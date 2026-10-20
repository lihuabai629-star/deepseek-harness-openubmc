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
           incompatible_dsh: Path | None = None, timeout: float = 300) -> None:
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
        output = run("--profile", "headless", "--patch", str(overlay), "Validate Agent preflight.")
        if "OPENUBMC_OFFLINE_OK" not in output:
            raise AssertionError(f"Offline preflight did not complete:\n{output[-12000:]}")
        if "OPENUBMC_LIFECYCLE_OK" not in output:
            raise AssertionError(f"Plugin disposal and remount did not complete:\n{output[-12000:]}")
        if incompatible_dsh is not None:
            # A fresh home prevents an older reader from opening the compatible build's Session logs.
            compatible_home = env["DSH_HOME"]
            env["DSH_HOME"] = str(root / "incompatible-home")
            try:
                run("plugin", "--profile", "headless", "add", str(archive), entry=incompatible_dsh)
                refusal = run("--profile", "headless", "--patch", str(overlay), "Validate Agent preflight.",
                              entry=incompatible_dsh, expected_code=1)
                if "requires a DSH build with native openUBMC MCP authority" not in refusal:
                    raise AssertionError(f"The unsupported Host did not report the required capability:\n{refusal[-12000:]}")
            finally:
                env["DSH_HOME"] = compatible_home
        sessions = list((home / "sessions").rglob("*"))
        if not any(path.is_file() for path in sessions):
            raise AssertionError("The preflight did not persist a Session")
        retained = home / "openubmc-agent-state/retained-probe"
        retained.parent.mkdir(parents=True, exist_ok=True)
        retained.write_text("private state\n")
        if update_archive is not None:
            older = json.loads((package / "package.json").read_text())["version"]
            run("plugin", "--profile", "headless", "add", str(update_archive))
            newer = json.loads((installed() / "package.json").read_text())["version"]
            if newer == older:
                raise AssertionError("The update did not select a different package version")
            run("plugin", "--profile", "headless", "add", str(archive))
            if json.loads((installed() / "package.json").read_text())["version"] != older:
                raise AssertionError("The retained archive did not restore the original plugin")
        run("plugin", "--profile", "headless", "remove", "dsh-openubmc")
        manifest = json.loads((profile / "package.json").read_text())
        if "dsh-openubmc" in manifest.get("dependencies", {}) or "dsh-openubmc" in manifest["dsh"]["profile"]["bundles"]:
            raise AssertionError("Uninstall left the bundle enabled")
        if (profile / "cordis.patch.yml").read_bytes() != user_patch or retained.read_text() != "private state\n":
            raise AssertionError("Uninstall changed user configuration or Runtime state")
        if any(not path.exists() for path in sessions):
            raise AssertionError("Uninstall removed Session files")
        print(json.dumps({"status": "passed", "skills": len(mapping), "offline_preflight": True,
                          "dispose_and_remount": True, "update_and_restore": update_archive is not None,
                          "incompatible_host_rejected": incompatible_dsh is not None,
                          "uninstall_retained_user_data": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--dsh", type=Path, required=True)
    parser.add_argument("--node", default=shutil.which("node"))
    parser.add_argument("--update-archive", type=Path)
    parser.add_argument("--incompatible-dsh", type=Path)
    parser.add_argument("--timeout", type=float, default=300)
    args = parser.parse_args()
    if not args.node or sys.platform != "linux":
        parser.error("The installed plugin smoke requires Linux/WSL and Node on PATH")
    verify(args.archive.resolve(strict=True), args.dsh.resolve(strict=True), args.node,
           update_archive=args.update_archive.resolve(strict=True) if args.update_archive else None,
           incompatible_dsh=args.incompatible_dsh.resolve(strict=True) if args.incompatible_dsh else None, timeout=args.timeout)
