"""Manage an owned openUBMC bundle without replacing user profile settings."""
from __future__ import annotations

import argparse
import copy
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import tempfile
import time
import uuid

BUNDLE = "@local/dsh-openubmc"
PACKAGES = {
    "@deepseek-ai/dsh-experimental-openubmc-cases": "packages/experimental/openubmc-cases",
    "@deepseek-ai/dsh-experimental-openubmc-runtime": "packages/experimental/openubmc-runtime",
    "@deepseek-ai/dsh-client-ui-openubmc-cases": "packages/client/ui-openubmc-cases",
}
ROOT = Path(__file__).resolve().parents[2]


def write_json(path: Path, value) -> None:
    """Atomically replace one owned JSON file with owner-only permissions."""
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, raw = tempfile.mkstemp(prefix=".openubmc-", dir=path.parent)
    temporary = Path(raw)
    try:
        with os.fdopen(descriptor, "w") as stream:
            stream.write(json.dumps(value, indent=2) + "\n")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def link(path: Path, target: Path) -> None:
    """Atomically replace a managed symlink; never traverse its target on removal."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not path.is_symlink():
        raise ValueError(f"Managed link replaced by an unowned file: {path}")
    temporary = path.with_name(f".openubmc-{uuid.uuid4().hex}")
    try:
        temporary.symlink_to(target, target_is_directory=True)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def take_over_exited_lock(path: Path) -> bool:
    """Use the native profile writer's record and claim protocol for a dead PID."""
    try:
        record = path.read_text()
    except OSError:
        return False
    def exited():
        if not re.fullmatch(r"[0-9]+\n", record):
            return False
        pid = int(record.strip())
        if not 0 < pid <= 0x7fffffff or pid == os.getpid():
            return False
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return True
        except PermissionError:
            return False
        return False
    if not exited():
        return False
    claim = Path(f"{path}.takeover-{hashlib.sha256(record.encode()).hexdigest()[:16]}")
    try:
        descriptor = os.open(claim, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return False
    try:
        os.close(descriptor)
        try:
            if path.read_text() != record or not exited():
                return False
            path.unlink()
            return True
        except FileNotFoundError:
            return False
    finally:
        claim.unlink(missing_ok=True)


@contextmanager
def locked(home: Path):
    """Serialize lifecycle transactions within a private home-owned directory."""
    managed = home / "openubmc-managed"
    managed.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (managed / "lock").open("a") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        # Share the native writer's exclusive PID record and verified-dead takeover protocol.
        profile_lock = home / "profiles/openubmc/package.json.lock"
        profile_lock.parent.mkdir(parents=True, exist_ok=True)
        deadline = time.monotonic() + 2
        while True:
            try:
                descriptor = os.open(profile_lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                break
            except FileExistsError:
                if take_over_exited_lock(profile_lock):
                    continue
                if time.monotonic() >= deadline:
                    raise ValueError(f"Profile writer lock is held: {profile_lock}; live or unverified owner")
                time.sleep(0.02)
        try:
            with os.fdopen(descriptor, "w") as record:
                record.write(f"{os.getpid()}\n")
            yield managed
        finally:
            profile_lock.unlink()


def generation(home: Path, workflow: Path, template: str, node: str, python: str, credentials: Path, *, case_ui: bool = False) -> Path:
    """Build and validate an immutable bundle before activation."""
    spec = importlib.util.spec_from_file_location("openubmc_initializer", ROOT / "scripts/openubmc/init.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    generations = home / "openubmc-managed/generations"
    generations.mkdir(parents=True, exist_ok=True)
    target = generations / uuid.uuid4().hex
    staging = Path(tempfile.mkdtemp(prefix=".staging-", dir=generations))
    draft = staging / "draft"
    try:
        module.initialize(workflow, draft, template, node, python, case_ui=case_ui)
        skills = staging / "skills"
        skills.mkdir()
        source_manifest = json.loads((workflow / "workflow.json").read_text())
        mapping = {entry["name"]: workflow / entry["path"] for entry in source_manifest["skills"]}
        skill_sources = {str(workflow / "workflow.json"): hashlib.sha256((workflow / "workflow.json").read_bytes()).hexdigest()}
        for name in source_manifest["profiles"]["full"]:
            shutil.copytree(mapping[name], skills / name, symlinks=False)
            for file in (skills / name).rglob("*"):
                if file.is_file():
                    skill_sources[str(mapping[name] / file.relative_to(skills / name))] = hashlib.sha256(file.read_bytes()).hexdigest()
        write_json(staging / "sources.json", skill_sources)
        shutil.copytree(workflow / "openubmc-target-runtime/openubmc_target_runtime",
                        skills / "openubmc-target-runtime/openubmc_target_runtime",
                        symlinks=False, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        for body in skills.rglob("*.md"):
            text = body.read_text()
            for name, source in mapping.items():
                for prefix in ("/root/.agents/skills/", "$HOME/.agents/skills/", "~/.agents/skills/"):
                    text = text.replace(prefix + name, str(target / "skills" / name))
                text = text.replace(str(source), str(target / "skills" / name))
            body.write_text(text)
        patch = json.loads((draft / "profiles/openubmc/cordis.patch.yml").read_text())
        patch[0]["config"]["customSkillDirs"] = [str(target / "skills")]
        runtime = next(entry for entry in patch[1]["insert"] if entry["id"] == "openubmc-target-runtime")
        runtime["config"]["env"] = {"OPENUBMC_TARGET_RUNTIME_INTERFACE_PROFILE": "agent", "OPENUBMC_TARGET_RUNTIME_STATE_DIR": str(home / "openubmc-agent-state"), "OPENUBMC_CREDENTIALS_FILE": str(credentials)}
        write_json(staging / "config.json", {"template": template, "caseUi": case_ui, "workflow": str(workflow), "node": node,
                                             "python": python, "credentials": str(credentials)})
        dependencies = json.loads((draft / "profiles/openubmc/package.json").read_text())["dependencies"]
        write_json(staging / "package.json", {"name": BUNDLE, "private": True, "type": "module", "dependencies": dependencies,
                                             "dsh": {"bundle": {"patch": "./cordis.yml"}}})
        write_json(staging / "cordis.yml", patch)
        module_root = staging / "node_modules"
        for name in dependencies:
            link(module_root / name, ROOT / PACKAGES[name])
        write_json(staging / "links.json", {name: str(ROOT / PACKAGES[name]) for name in dependencies})
        shutil.rmtree(draft)
        files = {str(path.relative_to(staging)): hashlib.sha256(path.read_bytes()).hexdigest()
                 for path in staging.rglob("*") if path.is_file() and "node_modules" not in path.parts and not path.is_symlink()}
        write_json(staging / "files.json", files)
        # This manager versions configuration and Skills. External executable code remains pinned by digest.
        external = {}
        roots = [workflow / "openubmc-target-runtime", workflow / "openubmc-debug/scripts", workflow / "openubmc-kb-mcp/src",
                 ROOT / "scripts/openubmc/runtime_stdio.py", *[ROOT / PACKAGES[name] / "src" for name in dependencies],
                 *[ROOT / PACKAGES[name] / "lib" for name in dependencies]]
        for source in roots:
            for file in ([source] if source.is_file() else source.rglob("*")):
                if file.is_file() and "__pycache__" not in file.parts and file.suffix not in {".pyc", ".map"}:
                    external[str(file.absolute())] = hashlib.sha256(file.read_bytes()).hexdigest()
        for source in [workflow / "openubmc-kb-mcp/package.json", workflow / "openubmc-kb-mcp/package-lock.json", ROOT / "pnpm-lock.yaml", *[ROOT / PACKAGES[name] / "package.json" for name in dependencies]]:
            if source.is_file():
                external[str(source)] = hashlib.sha256(source.read_bytes()).hexdigest()
        write_json(staging / "external.json", external)
        files["external.json"] = hashlib.sha256((staging / "external.json").read_bytes()).hexdigest()
        write_json(staging / "files.json", files)
        staging.replace(target)
        return target
    except BaseException:
        shutil.rmtree(staging)
        raise


def profile_manifest(home: Path, template: str):
    path = home / "profiles/openubmc/package.json"
    if path.exists():
        return path, json.loads(path.read_text())
    bundle = "headless" if template == "headless" else "web-app"
    return path, {"name": "dsh-profile-openubmc", "private": True, "type": "module", "dependencies": {},
                  "dsh": {"profile": {"bundles": ["@deepseek-ai/dsh-base", f"@deepseek-ai/dsh-{bundle}"]}}}


def validate_generation(path: Path) -> None:
    """Reject incomplete or changed managed content before activation."""
    expected = json.loads((path / "files.json").read_text())
    for name, digest in expected.items():
        candidate = path / name
        if candidate.is_symlink() or not candidate.is_file() or hashlib.sha256(candidate.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Managed bundle content differs: {name}")

    validate_links(path, json.loads((path / "links.json").read_text()))


def validate_links(path: Path, expected, *, allow_missing=False) -> None:
    """Reject foreign native resolver links; missing owned links may be rebuilt."""
    for name, target in expected.items():
        candidate = path / "node_modules" / name
        if candidate.is_symlink():
            if candidate.readlink() != Path(target):
                raise ValueError(f"Refusing to replace an unowned native link: {candidate}")
        elif candidate.exists():
            raise ValueError(f"Refusing to replace an unowned native file: {candidate}")
        elif not allow_missing:
            raise ValueError(f"Managed native link is missing: {candidate}")


def validate_external_files(expected) -> None:
    """Verify executable identities retained in the ownership record."""
    for name, digest in expected.items():
        candidate = Path(name)
        if not candidate.is_file() or hashlib.sha256(candidate.read_bytes()).hexdigest() != digest:
            raise ValueError(f"External executable changed; update from the intended checkout: {name}")


def validate_external(path: Path) -> None:
    """Refuse launch qualification or rollback after pinned executable files changed."""
    validate_external_files(json.loads((path / "external.json").read_text()))

def preflight(home: Path, state, manifest, *, fresh=False) -> None:
    """Check exact owned values before any mutation; absent owned entries are repairable."""
    expected_dependency = f"link:{home / 'openubmc-managed/current'}"
    dependency = manifest.get("dependencies", {}).get(BUNDLE)
    if dependency is not None and (fresh or dependency != expected_dependency):
        raise ValueError("Refusing to replace an unowned bundle dependency")
    paths = [(home / "openubmc-managed/current", {home / "openubmc-managed/generations" / name for name in state["generations"]}),
             (home / "profiles/openubmc/node_modules" / BUNDLE, {home / "openubmc-managed/current"})]
    for path, allowed in paths:
        if path.is_symlink():
            if fresh or path.readlink() not in allowed:
                raise ValueError(f"Refusing to replace an unowned link: {path}")
        elif path.exists():
            raise ValueError(f"Refusing to replace an unowned file: {path}")


def activate(home: Path, state, selected: Path) -> None:
    """Activate validated content while keeping the user's patch byte-for-byte."""
    validate_generation(selected)
    state.update(state["generations"][selected.name]["config"])
    state["caseUi"] = state["generations"][selected.name]["config"].get("caseUi", state["template"] == "web")
    manifest_path, manifest = profile_manifest(home, state["template"])
    preflight(home, state, manifest)
    manifest.setdefault("dependencies", {})[BUNDLE] = f"link:{home / 'openubmc-managed/current'}"
    bundles = manifest.setdefault("dsh", {}).setdefault("profile", {}).setdefault("bundles", [])
    if BUNDLE not in bundles:
        bundles.append(BUNDLE)
    # Readers may observe either complete generation while the installer holds the writer lock.
    link(home / "openubmc-managed/current", selected)
    link(home / "profiles/openubmc/node_modules" / BUNDLE, home / "openubmc-managed/current")
    write_json(manifest_path, manifest)
    if selected.name not in state["history"]:
        if state["active"] is not None:
            state["history"] = state["history"][:state["history"].index(state["active"]) + 1]
        state["history"].append(selected.name)
    state["active"] = selected.name
    write_json(home / "openubmc-managed/manifest.json", state)


def publish(home: Path, state, selected: Path):
    """Journal ownership before activation and compensate using the prior profile."""
    state_path = home / "openubmc-managed/manifest.json"
    prior = copy.deepcopy(state)
    manifest_path, manifest = profile_manifest(home, state["template"])
    preflight(home, state, manifest)
    previous_current = (home / "openubmc-managed/current").readlink() if (home / "openubmc-managed/current").is_symlink() else None
    previous_bundle = (home / "profiles/openubmc/node_modules" / BUNDLE).is_symlink()
    record = {"config": json.loads((selected / "config.json").read_text()),
              "external": json.loads((selected / "external.json").read_text()),
              "links": json.loads((selected / "links.json").read_text()),
              "sources": json.loads((selected / "sources.json").read_text())}
    journal = copy.deepcopy(state)
    journal["generations"][selected.name] = record
    if journal["active"] is None:
        journal["active"] = selected.name
        journal["history"].append(selected.name)
        journal.update(record["config"])
    write_json(state_path, journal)
    try:
        activate(home, journal, selected)
    except BaseException:
        # Retain all published ownership even if a second write also fails during compensation.
        if prior["active"] is not None:
            if previous_current is None:
                (home / "openubmc-managed/current").unlink(missing_ok=True)
            else:
                link(home / "openubmc-managed/current", previous_current)
            bundle_link = home / "profiles/openubmc/node_modules" / BUNDLE
            if not previous_bundle:
                bundle_link.unlink(missing_ok=True)
            write_json(manifest_path, manifest)
            journal.update({key: prior[key] for key in ("active", "history", "template", "workflow", "node", "python", "credentials")})
            if "caseUi" in prior:
                journal["caseUi"] = prior["caseUi"]
            else:
                journal.pop("caseUi", None)
            write_json(state_path, journal)
        raise
    return journal


def run(action: str, home: Path, workflow: Path | None = None, template="headless", node=None, python=None, credentials: Path | None = None, *, case_ui: bool | None = None):
    """Run one reversible lifecycle action over entries recorded as owned."""
    if case_ui is not None and action not in {"install", "update"}:
        raise ValueError("--case-ui and --no-case-ui require install or update")
    with locked(home) as managed:
        state_path = managed / "manifest.json"
        state = json.loads(state_path.read_text()) if state_path.exists() else None
        if state is not None and (state.get("format") != 1 or "generations" not in state):
            raise ValueError("No supported openUBMC ownership record")
        if action in {"install", "update"}:
            if workflow is None:
                if state is None:
                    raise ValueError("--workflow is required")
                workflow = Path(state["workflow"])
            node = node or (state["node"] if state else "node")
            python = python or (state["python"] if state else "python3")
            if state is None:
                case_ui = False if case_ui is None else case_ui
                manifest_path, manifest = profile_manifest(home, template)
                if BUNDLE in manifest.get("dependencies", {}) or BUNDLE in manifest.get("dsh", {}).get("profile", {}).get("bundles", []):
                    raise ValueError("Cannot adopt an openUBMC bundle without its ownership record")
                if (home / "profiles/openubmc/node_modules" / BUNDLE).is_symlink() or (home / "profiles/openubmc/node_modules" / BUNDLE).exists():
                    raise ValueError("Cannot replace an unowned bundle link")
                state = {"format": 1, "template": template, "caseUi": case_ui, "workflow": str(workflow), "node": node, "python": python,
                         "credentials": str(credentials or home / "credentials.env"), "history": [], "generations": {}, "active": None,
                         "createdProfile": not manifest_path.exists()}
            else:
                template = state["template"]
                if case_ui is None:
                    case_ui = state["generations"][state["active"]]["config"].get("caseUi", False)
                validate_links(managed / "generations" / state["active"], state["generations"][state["active"]]["links"], allow_missing=True)
            _, manifest = profile_manifest(home, template)
            preflight(home, state, manifest)
            selected = generation(home, workflow, template, node, python, Path(credentials or state["credentials"]), case_ui=case_ui)
            publish(home, state, selected)
            return {"status": "installed", "generation": selected.name}
        if state is None:
            raise ValueError("No supported openUBMC ownership record")
        active = managed / "generations" / state["active"]
        record = state["generations"][state["active"]]
        manifest_path, manifest = profile_manifest(home, state["template"])
        preflight(home, state, manifest)
        validate_links(active, record["links"], allow_missing=True)
        if action == "check":
            validate_generation(active)
            validate_external_files(record["external"])
            if manifest.get("dependencies", {}).get(BUNDLE) != f"link:{managed / 'current'}":
                raise ValueError("Managed dependency requires repair")
            if BUNDLE not in manifest.get("dsh", {}).get("profile", {}).get("bundles", []):
                raise ValueError("Managed bundle is absent from the profile")
            for path, target in [(managed / "current", active), (home / "profiles/openubmc/node_modules" / BUNDLE, managed / "current")]:
                if not path.is_symlink() or path.readlink() != target:
                    raise ValueError(f"Managed link requires repair: {path}")
            return {"status": "healthy", "generation": state["active"]}
        if action == "repair":
            validate_external_files(record["external"])
            try:
                validate_generation(active)
            except (OSError, ValueError):
                for name, digest in record["sources"].items():
                    file = Path(name)
                    if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != digest:
                        raise ValueError(f"Selected Skill source changed; restore the selected checkout or use update: {name}")
                config = record["config"]
                selected = generation(home, Path(config["workflow"]), config["template"], config["node"], config["python"], Path(config["credentials"]),
                                      case_ui=config.get("caseUi", config["template"] == "web"))
                if json.loads((selected / "sources.json").read_text()) != record["sources"]:
                    shutil.rmtree(selected)
                    raise ValueError("Selected Skill source set changed; restore the selected checkout or use update")
                publish(home, state, selected)
                return {"status": "repaired", "generation": selected.name}
            publish(home, state, active)
            return {"status": "repaired", "generation": state["active"]}
        if action == "rollback":
            index = state["history"].index(state["active"])
            if index == 0:
                raise ValueError("No previous generation")
            selected = managed / "generations" / state["history"][index - 1]
            validate_external_files(state["generations"][selected.name]["external"])
            publish(home, state, selected)
            return {"status": "rolled-back", "generation": selected.name}
        if action == "uninstall":
            manifest.get("dependencies", {}).pop(BUNDLE, None)
            bundles = manifest.get("dsh", {}).get("profile", {}).get("bundles", [])
            manifest["dsh"]["profile"]["bundles"] = [name for name in bundles if name != BUNDLE]
            write_json(manifest_path, manifest)
            for path in [home / "profiles/openubmc/node_modules" / BUNDLE, managed / "current"]:
                path.unlink(missing_ok=True)
            state_path.unlink()
            return {"status": "uninstalled", "retained": ["sessions", "openubmc-agent-state", "credentials", "user profile settings"]}
        raise ValueError(f"Unknown action: {action}")


def main():
    """Parse explicit paths; output lifecycle status without credential contents."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["install", "check", "repair", "update", "rollback", "uninstall"])
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--workflow", type=Path)
    parser.add_argument("--template", choices=["headless", "web"], default="headless")
    parser.add_argument("--case-ui", action=argparse.BooleanOptionalAction, default=None,
                        help="Enable or disable diagnostic cards on install/update of a Web profile")
    parser.add_argument("--node")
    parser.add_argument("--python")
    parser.add_argument("--credentials", type=Path)
    args = parser.parse_args()
    print(json.dumps(run(args.action, args.home.absolute(), args.workflow.resolve() if args.workflow else None,
                         args.template, args.node, args.python, args.credentials.absolute() if args.credentials else None,
                         case_ui=args.case_ui)))


if __name__ == "__main__":
    main()
