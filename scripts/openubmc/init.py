"""Create an isolated DSH development home for a local openUBMC workflow checkout."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil


def initialize(workflow: Path, home: Path, template: str, node: str, python: str, *, case_ui: bool = False) -> None:
    """Create a fresh home; never modify an existing deployment or workflow checkout."""
    if case_ui and template != "web":
        raise ValueError("--case-ui requires --template web")
    case_package = "@deepseek-ai/dsh-experimental-openubmc-cases"
    runtime_package = "@deepseek-ai/dsh-experimental-openubmc-runtime"
    case_ui_package = "@deepseek-ai/dsh-client-ui-openubmc-cases"
    runtime_source = Path(__file__).resolve().parents[2] / "packages/experimental/openubmc-runtime"
    case_source = Path(__file__).resolve().parents[2] / "packages/experimental/openubmc-cases"
    case_ui_source = Path(__file__).resolve().parents[2] / "packages/client/ui-openubmc-cases"
    if not (case_source / "package.json").is_file():
        raise ValueError(f"Missing native Case package: {case_source}")
    if case_ui and not (case_ui_source / "package.json").is_file():
        raise ValueError(f"Missing native Case Web package: {case_ui_source}")
    manifest = json.loads((workflow / "workflow.json").read_text())
    mapping = {entry["name"]: workflow / entry["path"] for entry in manifest["skills"]}
    selected = manifest["profiles"]["full"]
    for name in selected:
        if not (mapping[name] / "SKILL.md").is_file():
            raise ValueError(f"Missing skill: {name}")
    runtime = workflow / "openubmc-debug/scripts/target_runtime_mcp.py"
    kb = workflow / "openubmc-kb-mcp/src/server.js"
    for entry in (runtime, kb):
        if not entry.is_file():
            raise ValueError(f"Missing MCP entry: {entry}")
    home.mkdir(mode=0o700, parents=True, exist_ok=False)
    try:
        skills = home / "openubmc-skills"
        skills.mkdir()
        aliases = {alias: str(path) for name, path in mapping.items()
                   for alias in (name, path.relative_to(workflow).as_posix())}
        pattern = re.compile(r"(?:/root/\.agents/skills/|\$HOME/\.agents/skills/|~/\.agents/skills/)("
                             + "|".join(re.escape(name) for name in sorted(aliases, key=len, reverse=True))
                             + r")(?![\w-])")

        def stage_resources(source: Path, target: Path) -> None:
            if source.is_dir():
                target.mkdir()
                for child in source.iterdir():
                    stage_resources(child, target / child.name)
            elif source.suffix == ".md":
                body = pattern.sub(lambda match: aliases[match[1]], source.read_text())
                target.write_text(body)
            else:
                target.symlink_to(source)

        for name in selected:
            stage_resources(mapping[name], skills / name)
        profile = home / "profiles/openubmc"
        profile.mkdir(parents=True)
        bundle = {"headless": "headless", "web": "web-app"}[template]
        module_root = profile / "node_modules/@deepseek-ai"
        module_root.mkdir(parents=True)
        (module_root / "dsh-experimental-openubmc-cases").symlink_to(case_source, target_is_directory=True)
        (module_root / "dsh-experimental-openubmc-runtime").symlink_to(runtime_source, target_is_directory=True)
        if case_ui:
            (module_root / "dsh-client-ui-openubmc-cases").symlink_to(case_ui_source, target_is_directory=True)
        (profile / "package.json").write_text(json.dumps({
            "name": "dsh-profile-openubmc", "private": True, "type": "module",
            "dependencies": {case_package: f"link:{case_source}", runtime_package: f"link:{runtime_source}",
                              **({case_ui_package: f"link:{case_ui_source}"} if case_ui else {})},
            "dsh": {"profile": {"bundles": ["@deepseek-ai/dsh-base", f"@deepseek-ai/dsh-{bundle}"]}},
        }, indent=2) + "\n")
        entries = [
            {"id": "openubmc-runtime", "name": runtime_package, "config": {"serverName": "openubmc-target-runtime",
                "operationDeadlineSeconds": 120, "observationDeadlineSeconds": 180, "completionGraceMs": 10000}},
            {"id": "openubmc-cases", "name": "@deepseek-ai/dsh-experimental-openubmc-cases",
             "config": {"serverName": "openubmc-target-runtime"}},
            {"id": "openubmc-target-runtime", "name": "@deepseek-ai/dsh-mcp-client", "config": {
                "serverName": "openubmc-target-runtime", "transport": "stdio", "command": python,
                "args": [str(Path(__file__).with_name("runtime_stdio.py")), "--entry", str(runtime)], "cwd": str(workflow), "sessionIdMetadataKey": "taskId",
                "structuredContentInText": True, "structuredContentInMeta": True,
                "requiredToolCallPolicies": ["openubmc-session-authority"],
                "toolCallTimeoutMs": 190000, "failOnStartupError": True,
                "env": {"OPENUBMC_TARGET_RUNTIME_INTERFACE_PROFILE": "agent", "OPENUBMC_TARGET_RUNTIME_STATE_DIR": str(home / "openubmc-agent-state"),
                        "OPENUBMC_CREDENTIALS_FILE": str(home / "credentials.env")},
            }},
            {"id": "openubmc-kb", "name": "@deepseek-ai/dsh-mcp-client", "config": {
                "serverName": "openubmc-kb", "transport": "stdio", "command": node,
                "args": [str(kb)], "cwd": str(kb.parent.parent), "failOnStartupError": True,
            }},
        ]
        if case_ui: entries.insert(0, {"id": "openubmc-case-ui", "name": case_ui_package, "config": {"serverName": "openubmc-target-runtime"}})
        patch = [
            {"id": "skill-filesystem", "config": {
                "includeDefaultRoots": False, "customSkillDirs": [str(skills)], "watch": False,
            }},
            {"insert": [
                *entries,
            ]},
        ]
        # JSON is a YAML subset and keeps paths literal without !!js or shell interpolation.
        (profile / "cordis.patch.yml").write_text(json.dumps(patch, indent=2) + "\n")
    except BaseException:
        shutil.rmtree(home)
        raise


def main() -> None:
    """Parse explicit development paths and generate the profile."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workflow", type=Path, required=True)
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--template", choices=["headless", "web"], default="headless")
    parser.add_argument("--case-ui", action="store_true", help="Add optional diagnostic cards to the Web conversation")
    parser.add_argument("--node", required=True)
    parser.add_argument("--python", default="python3")
    args = parser.parse_args()
    initialize(args.workflow.resolve(), args.home.absolute(), args.template, args.node, args.python, case_ui=args.case_ui)


if __name__ == "__main__":
    main()
