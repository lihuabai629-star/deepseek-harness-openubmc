"""Exercise a prebuilt plugin through the real dsh package and profile lifecycle."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile


def verify(archive: Path, dsh: Path, node: str, *, update_archive: Path | None = None,
           expected_host_version: str | None = None, timeout: float = 300) -> None:
    """Install outside the source tree, probe offline, and preserve private data on removal."""
    with tempfile.TemporaryDirectory(prefix="dsh-openubmc-installed-") as raw:
        root = Path(raw)
        home = root / "home"
        # Corepack resolves the repository-pinned manager even from this isolated directory.
        (root / "package.json").write_text(json.dumps({"private": True, "packageManager": "pnpm@11.7.0"}))
        profile = home / "profiles/headless"
        profile.mkdir(parents=True)
        user_patch = b"# User-owned configuration\n[]\n"
        (profile / "cordis.patch.yml").write_bytes(user_patch)
        env = dict(os.environ, DSH_HOME=str(home), DSH_TELEMETRY_DISABLED="1",
                   XDG_CONFIG_HOME=str(root / "config"), XDG_CACHE_HOME=str(root / "cache"))

        def run(*arguments: str, entry: Path = dsh, expected_code: int = 0) -> str:
            process = subprocess.Popen([node, str(entry), *arguments], cwd=root, env=env,
                                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
            try:
                output, _ = process.communicate(timeout=timeout)
            except BaseException:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass  # The process group completed while cancellation was requested.
                process.communicate()
                raise
            if process.returncode != expected_code:
                raise RuntimeError(f"dsh {arguments[0]} exited {process.returncode}:\n{output[-12000:]}")
            return output

        def installed() -> Path:
            package = (profile / "node_modules/dsh-openubmc").resolve(strict=True)
            if not package.is_relative_to(home):
                raise AssertionError("The installed package depends on a source checkout")
            if (profile / "cordis.patch.yml").read_bytes() != user_patch:
                raise AssertionError("User profile settings changed")
            manifest = json.loads((profile / "package.json").read_text())
            if "dsh-openubmc" not in manifest["dsh"]["profile"]["bundles"]:
                raise AssertionError("The installed bundle was not activated")
            return package

        host_version = run("--version").strip()
        if expected_host_version is not None and expected_host_version not in host_version:
            raise AssertionError(f"Expected DSH {expected_host_version}, got {host_version}")
        run("plugin", "--profile", "headless", "add", str(archive))
        package = installed()
        payload = package / "payload/workflow"
        mapping = json.loads((package / "payload/skills.json").read_text())["skills"]
        if not mapping or any(not (payload / item["path"] / "SKILL.md").is_file() for item in mapping):
            raise AssertionError("Packaged Skill mapping is incomplete")
        support = payload / "openubmc-target-runtime"
        probe = subprocess.run([sys.executable, "-I", "-B", "-c",
            "import sys; sys.path.insert(0, sys.argv[1]); "
            "from openubmc_target_runtime.credential_file import credential_completeness; "
            "assert credential_completeness({})['missing_keys']", str(support)],
            capture_output=True, text=True, timeout=timeout)
        if probe.returncode:
            raise AssertionError(f"Packaged Python support failed: {probe.stderr}")
        overlay = root / "preflight.yml"
        overlay.write_text("- id: llm-deepseek\n  disabled: true\n- insert:\n"
                           "    - id: openubmc-offline-model\n      name: dsh-openubmc/preflight\n"
                           "      config:\n        verifyLifecycle: true\n")
        def check_preflight() -> None:
            output = run("--profile", "headless", "--patch", str(overlay), "Validate Agent preflight.")
            if "OPENUBMC_OFFLINE_OK" not in output:
                raise AssertionError(f"Offline preflight did not complete:\n{output[-12000:]}")
            if "OPENUBMC_LIFECYCLE_OK" not in output:
                raise AssertionError(f"Plugin disposal and remount did not complete:\n{output[-12000:]}")

        check_preflight()
        resources = home / "openubmc-agent-state/skill-resources"
        retained_resources = {path: path.read_bytes() for path in resources.glob("*/openubmc-debug/scripts/diagnostic_advice.py")}
        if not retained_resources:
            raise AssertionError("The installed Skills did not materialize private script resources")
        setup = root / "setup-only.yml"
        setup.write_text(overlay.read_text().replace('verifyLifecycle: true', 'verifySetupOnly: true')
                         + "- id: openubmc\n  config:\n    python: /nonexistent/dsh-python\n")
        setup_output = run("--profile", "headless", "--patch", str(setup), "Check local setup readiness.")
        if 'OPENUBMC_SETUP_ONLY_OK' not in setup_output:
            raise AssertionError("A missing Runtime interpreter removed native setup diagnostics")
        sessions = list((home / "sessions").rglob("*"))
        if not any(path.is_file() for path in sessions):
            raise AssertionError("The preflight did not persist a Session")
        authority = list((home / "openubmc-agent-state/dsh-sessions").glob("*.json"))
        if not authority or any(json.loads(path.read_text())["schema"] != "dsh-openubmc/session-authority/v1" for path in authority):
            raise AssertionError("The plugin did not persist its own Session authority")
        for path in sessions:
            if path.suffix != ".jsonl":
                continue
            for line in path.read_text().splitlines():
                record = json.loads(line)
                if record.get("type", "").startswith("openubmc/"):
                    raise AssertionError("Portable Sessions must not require custom openUBMC event types")
        retained = home / "openubmc-agent-state/retained-probe"
        retained.parent.mkdir(parents=True, exist_ok=True)
        retained.write_text("private state\n")
        if update_archive is not None:
            older = json.loads((package / "package.json").read_text())["version"]
            run("plugin", "--profile", "headless", "add", str(update_archive))
            newer = json.loads((installed() / "package.json").read_text())["version"]
            if newer == older:
                raise AssertionError("The update did not select a different package version")
            check_preflight()
            run("plugin", "--profile", "headless", "add", str(archive))
            if json.loads((installed() / "package.json").read_text())["version"] != older:
                raise AssertionError("The retained archive did not restore the original plugin")
            check_preflight()
        run("plugin", "--profile", "headless", "remove", "dsh-openubmc")
        manifest = json.loads((profile / "package.json").read_text())
        if "dsh-openubmc" in manifest.get("dependencies", {}) or "dsh-openubmc" in manifest["dsh"]["profile"]["bundles"]:
            raise AssertionError("Uninstall left the bundle enabled")
        if (profile / "cordis.patch.yml").read_bytes() != user_patch or retained.read_text() != "private state\n":
            raise AssertionError("Uninstall changed user configuration or Runtime state")
        if any(not path.exists() for path in [*sessions, *authority]):
            raise AssertionError("Uninstall removed Session files")
        if any(not path.is_file() or path.read_bytes() != content for path, content in retained_resources.items()):
            raise AssertionError("Package lifecycle removed or changed a previously loaded Skill script")
        print(json.dumps({"status": "passed", "skills": len(mapping), "offline_preflight": True,
                          "dispose_and_remount": True, "update_and_restore": update_archive is not None,
                          "skill_resources_retained": True,
                          "setup_retained_without_interpreter": True,
                          "host_version": host_version, "portable_session_events": True, "authority_retained": True,
                          "uninstall_retained_user_data": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--dsh", type=Path, required=True)
    parser.add_argument("--node", default=shutil.which("node"))
    parser.add_argument("--update-archive", type=Path)
    parser.add_argument("--expected-host-version")
    parser.add_argument("--timeout", type=float, default=300)
    args = parser.parse_args()
    if not args.node or sys.platform != "linux":
        parser.error("The installed plugin smoke requires Linux/WSL and Node on PATH")
    verify(args.archive.resolve(strict=True), args.dsh.resolve(strict=True), args.node,
           update_archive=args.update_archive.resolve(strict=True) if args.update_archive else None,
           expected_host_version=args.expected_host_version, timeout=args.timeout)
