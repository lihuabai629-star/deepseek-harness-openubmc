"""DSH-owned local configuration and health checks; never probes a target implicitly."""
from __future__ import annotations

import hashlib
import importlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time


PAYLOAD = Path(__file__).resolve().parent
WORKFLOW = PAYLOAD / "workflow"


def load_modules():
    """Load immutable shared configuration code without Codex entrypoints."""
    sys.path.insert(0, str(WORKFLOW / "openubmc-target-runtime"))
    sys.path.insert(0, str(WORKFLOW / "openubmc-environment-setup/scripts"))
    return importlib.import_module("config_page")


def integrity():
    """Verify the release-owned files; npm dependencies have a separate owner."""
    root = PAYLOAD.parent
    try:
        manifest = json.loads((root / "integrity.json").read_text())
        if manifest["schema"] != "dsh-openubmc/integrity/v1" or not manifest["files"]:
            return False
        for name, digest in manifest["files"].items():
            path = root / name
            if (not path.resolve().is_relative_to(root.resolve()) or path.is_symlink()
                    or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest):
                return False
        return True
    except (OSError, ValueError, KeyError, TypeError):
        return False


def owned_run(argv, *, timeout=30, cwd=None, env=None):
    """Bound output and terminate the whole process group before returning."""
    import selectors
    with subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, start_new_session=True) as process:
        try:
            deadline = time.monotonic() + timeout
            output = bytearray()
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while selector.get_map():
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise subprocess.TimeoutExpired(argv[0], timeout)
                    for key, _ in selector.select(min(remaining, 0.2)):
                        chunk = os.read(key.fileobj.fileno(), 65536)
                        if not chunk:
                            selector.unregister(key.fileobj)
                            continue
                        output.extend(chunk)
                        if len(output) > 1024 * 1024:
                            raise ValueError("local_operation_output_limit")
            return process.wait(timeout=max(0.01, deadline - time.monotonic())), bytes(output)
        finally:
            # Descendants can retain handles after their parent exits.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait()


class Maintenance:
    """Configuration-page operations scoped to this DSH installation."""

    def __init__(self, options):
        self.options = options
        self.storage_transactions = []

    def sources(self):
        from openubmc_target_runtime.credential_file import configuration_home
        config = configuration_home()
        return {"targets": Path(self.options["credentialsFile"]),
                "kb": Path(self.options.get("kbConfigFile") or config / "openubmc/kb-mcp.json"),
                "conan": config / "openubmc/conan.json"}

    def kb_directory(self):
        source = WORKFLOW / "openubmc-kb-mcp"
        identity = hashlib.sha256()
        for path in sorted([source / "package.json", source / "package-lock.json", *source.joinpath("src").rglob("*")]):
            if path.is_file():
                identity.update(str(path.relative_to(source)).encode() + b"\0" + path.read_bytes())
        key = identity.hexdigest()
        return Path(self.options["stateDir"]) / "dependencies" / key / "kb"

    @staticmethod
    def cache_inventory(directory):
        result = {}
        for path in sorted(directory.rglob("*")):
            if path.is_symlink() and not path.resolve().is_relative_to(directory.resolve()):
                raise ValueError("dependency_cache_link_escapes")
            if path.is_file() and path.name != "ready.json":
                result[str(path.relative_to(directory))] = hashlib.sha256(path.read_bytes()).hexdigest()
        return result

    def kb_entry(self):
        cached = self.kb_directory()
        if (cached / "ready.json").is_file():
            marker = json.loads((cached / "ready.json").read_text())
            if marker.get("source") != cached.parent.name or marker.get("files") != self.cache_inventory(cached):
                raise ValueError("dependency_cache_integrity_failed_repair_kb")
            return cached / "src/server.js"
        return WORKFLOW / "openubmc-kb-mcp/src/server.js"

    def status(self):
        from openubmc_target_runtime.configuration import LocalConfigurationStore, ConfigurationError
        from openubmc_target_runtime.credentials import LocalCredentialSource
        release = json.loads((PAYLOAD.parent / "release.json").read_text())
        valid = integrity()
        local = {}
        for kind, path in self.sources().items():
            try:
                if kind == "targets":
                    status = LocalCredentialSource(config_path=path).status()
                    revision = status["active_revision"]
                    configured = status["configured"]
                else:
                    revision = LocalConfigurationStore(path, kind=kind).status()["active_revision"]
                    configured = revision is not None
                local[kind] = {"configured": configured, "active_revision": revision}
            except (ConfigurationError, OSError, ValueError):
                local[kind] = {"configured": False, "active_revision": None, "error": "configuration_invalid"}
        runtime = valid and sys.version_info >= (3, 10)
        if runtime:
            try:
                code, _ = owned_run([sys.executable, "-B", "-c",
                    "import sys; sys.path.insert(0,sys.argv[1]); import target_runtime_mcp; target_runtime_mcp._load_runtime_module()",
                    str(WORKFLOW / "openubmc-debug/scripts")])
                runtime = code == 0
            except (OSError, ValueError, subprocess.SubprocessError):
                runtime = False
        kb = False
        if valid:
            try:
                code, _ = owned_run([self.options["node"], "--input-type=module", "-e",
                    "await import('@modelcontextprotocol/sdk/server/mcp.js'); await import('zod')"],
                    cwd=self.kb_entry().parent.parent)
                kb = code == 0
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
        return {"version": release.get("pluginVersion"), "source_commit": release["dshCommit"],
                "integrity": valid, "runtime": runtime, "kb": kb,
                "execution": {"host": "wsl" if "microsoft" in os.uname().release.lower() else "linux",
                              "native_windows_build_supported": False},
                "dependencies": {"runtime": {"ready": runtime, "import_ready": runtime},
                                 "kb": {"ready": kb, "import_ready": kb}},
                "provider_connection": "not_checked",
                "transports": {name: shutil.which(name) is not None for name in ("ssh", "sshpass", "git", "npm")},
                "local_configuration": local,
                "configuration": {"ready": True, "conflict": False, "servers": [], "skills": []},
                "knowledge_authentication": "not_checked", "remote_target_authentication": "not_checked"}

    def prepare(self, capability):
        if capability not in {"runtime", "kb", "all"}:
            raise ValueError("invalid_capability")
        if not integrity():
            raise ValueError("package_integrity_failed_reinstall_archive")
        if capability in {"kb", "all"}:
            import fcntl
            import tempfile
            target = self.kb_directory()
            target.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            with (target.parent / "prepare.lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                staging = Path(tempfile.mkdtemp(prefix=".prepare-", dir=target.parent))
                try:
                    source = WORKFLOW / "openubmc-kb-mcp"
                    shutil.copytree(source / "src", staging / "src")
                    for name in ("package.json", "package-lock.json"):
                        shutil.copyfile(source / name, staging / name)
                    code, _ = owned_run(["npm", "ci", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"],
                                        cwd=staging, timeout=self.options["setupTimeoutSeconds"])
                    if code:
                        raise ValueError("kb_dependency_install_failed")
                    (staging / "ready.json").write_text(json.dumps({"source": target.parent.name,
                        "files": self.cache_inventory(staging)}))
                    previous = target.with_name("previous")
                    if previous.exists():
                        shutil.rmtree(previous)
                    if target.exists():
                        target.rename(previous)
                    try:
                        staging.rename(target)
                    except BaseException:
                        if previous.exists():
                            previous.rename(target)
                        raise
                    if previous.exists():
                        shutil.rmtree(previous)
                finally:
                    if staging.exists():
                        shutil.rmtree(staging)
        result = self.status()
        return {"repaired": all(result[name] for name in ("runtime", "kb") if capability in {name, "all"}),
                "capability": capability, "status": result}

    def dispatch(self, data):
        action = data.get("action")
        if action == "status":
            return self.status()
        if action == "dependencies":
            return self.prepare(data.get("capability"))
        if action == "preview":
            # Native DSH owns plugin configuration and its update transactions.
            return {"would_change": False, "servers": [], "skills": [], "operation": "dsh-plugin-manager"}
        raise ValueError("use_native_dsh_plugin_manager")


def configure(options, maintenance):
    page = load_modules()
    from config_checks import BoundedConfigurationChecker
    from openubmc_target_runtime.credential_file import configuration_home
    kind = options.get("kind", "targets")
    with page.LocalConfigurationServer(configuration_home(), sources=maintenance.sources(),
            checker=BoundedConfigurationChecker(), maintenance=maintenance, kind=kind,
            focus_target=options.get("focusTarget"), wait_for_save=options.get("waitForSave", False)) as server:
        print(json.dumps({"event": "configuration_opened", "url": server.url}), flush=True)
        while server.thread.is_alive():
            server.thread.join(timeout=0.2)
            if options.get("waitForSave") and server.completion is not None:
                break
            if time.monotonic() - server.last_activity > options["configurationIdleSeconds"]:
                break
        print(json.dumps(server.completion or {"event": "configuration_cancelled", "kind": kind}), flush=True)


def main():
    """Receive only Host-selected paths and operations through private stdin."""
    options = json.loads(sys.stdin.buffer.readline(64 * 1024 + 1))
    os.environ["OPENUBMC_CREDENTIALS_FILE"] = options["credentialsFile"]
    os.environ["OPENUBMC_TARGET_RUNTIME_STATE_DIR"] = options["stateDir"]
    if options.get("kbConfigFile"):
        os.environ["OPENUBMC_KB_CONFIG"] = options["kbConfigFile"]
    os.environ["PATH"] = str(Path(options["node"]).parent) + os.pathsep + os.environ.get("PATH", "")
    if not integrity():
        print(json.dumps({"integrity": False, "runtime": False, "kb": False,
                          "error": "package_integrity_failed_reinstall_archive"}), flush=True)
        if options["command"] != "doctor":
            sys.exit(1)
        return
    load_modules()
    maintenance = Maintenance(options)
    if options["command"] == "configure":
        def stop(_signal, _frame):
            raise KeyboardInterrupt
        signal.signal(signal.SIGTERM, stop)
        configure(options, maintenance)
        return
    result = (maintenance.prepare(options["capability"]) if options["command"] == "prepare"
              else {"entry": str(maintenance.kb_entry())} if options["command"] == "kb-entry"
              else maintenance.status())
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as error:
        # Errors from network tools or configuration parsers can contain secrets.
        print(json.dumps({"ok": False, "error": type(error).__name__}), flush=True)
        sys.exit(1)
