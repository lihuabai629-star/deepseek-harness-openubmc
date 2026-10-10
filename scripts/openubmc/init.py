"""Create an isolated DSH development home for a local openUBMC workflow checkout."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil


def initialize(workflow: Path, home: Path, template: str, node: str, python: str) -> None:
    """Create a fresh home; never modify an existing deployment or workflow checkout."""
    case_package = "@deepseek-ai/dsh-experimental-openubmc-cases"
    runtime_package = "@deepseek-ai/dsh-experimental-openubmc-runtime"
    case_ui_package = "@deepseek-ai/dsh-client-ui-openubmc-cases"
    runtime_source = Path(__file__).resolve().parents[2] / "packages/experimental/openubmc-runtime"
    case_source = Path(__file__).resolve().parents[2] / "packages/experimental/openubmc-cases"
    case_ui_source = Path(__file__).resolve().parents[2] / "packages/client/ui-openubmc-cases"
    if not (case_source / "package.json").is_file():
        raise ValueError(f"Missing native Case package: {case_source}")
    if template == "web" and not (case_ui_source / "package.json").is_file():
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
        for name in selected:
            target = skills / name
            target.mkdir()
            for source in mapping[name].iterdir():
                if source.name == "SKILL.md":
                    body = source.read_text()
                    for skill_name, skill_path in mapping.items():
                        for prefix in ("/root/.agents/skills/", "$HOME/.agents/skills/", "~/.agents/skills/"):
                            body = body.replace(prefix + skill_name, str(skill_path))
                    (target / source.name).write_text(body)
                else:
                    (target / source.name).symlink_to(source, target_is_directory=source.is_dir())
        profile = home / "profiles/openubmc"
        profile.mkdir(parents=True)
        bundle = {"headless": "headless", "web": "web-app"}[template]
        module_root = profile / "node_modules/@deepseek-ai"
        module_root.mkdir(parents=True)
        (module_root / "dsh-experimental-openubmc-cases").symlink_to(case_source, target_is_directory=True)
        (module_root / "dsh-experimental-openubmc-runtime").symlink_to(runtime_source, target_is_directory=True)
        if template == "web":
            (module_root / "dsh-client-ui-openubmc-cases").symlink_to(case_ui_source, target_is_directory=True)
        (profile / "package.json").write_text(json.dumps({
            "name": "dsh-profile-openubmc", "private": True, "type": "module",
            "dependencies": {case_package: f"link:{case_source}", runtime_package: f"link:{runtime_source}",
                              **({case_ui_package: f"link:{case_ui_source}"} if template == "web" else {})},
            "dsh": {"profile": {"bundles": ["@deepseek-ai/dsh-base", f"@deepseek-ai/dsh-{bundle}"]}},
        }, indent=2) + "\n")
        entries = [
            {"id": "openubmc-runtime", "name": runtime_package, "config": {"serverName": "openubmc-target-runtime",
                "operationDeadlineSeconds": 600, "completionGraceMs": 60000, "workflowMaxSteps": 1, "evidenceReadLimitBytes": 65536}},
            {"id": "openubmc-cases", "name": "@deepseek-ai/dsh-experimental-openubmc-cases",
             "config": {"serverName": "openubmc-target-runtime"}},
            {"id": "openubmc-target-runtime", "name": "@deepseek-ai/dsh-mcp-client", "config": {
                "serverName": "openubmc-target-runtime", "transport": "stdio", "command": python,
                "args": [str(Path(__file__).with_name("runtime_stdio.py")), "--entry", str(runtime)], "cwd": str(workflow), "sessionIdMetadataKey": "taskId",
                "structuredContentInText": True, "structuredContentInMeta": True,
                "requiredToolCallPolicies": ["openubmc-session-authority"],
                "toolCallTimeoutMs": 660000, "failOnStartupError": True,
                "env": {"OPENUBMC_TARGET_RUNTIME_STATE_DIR": str(home / "openubmc-state"),
                        "OPENUBMC_CREDENTIALS_FILE": str(home / "credentials.env")},
            }},
            {"id": "openubmc-kb", "name": "@deepseek-ai/dsh-mcp-client", "config": {
                "serverName": "openubmc-kb", "transport": "stdio", "command": node,
                "args": [str(kb)], "cwd": str(kb.parent.parent), "failOnStartupError": True,
            }},
        ]
        if template == "web": entries.insert(0, {"id": "openubmc-case-ui", "name": case_ui_package, "config": {"serverName": "openubmc-target-runtime"}})
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
    parser.add_argument("--node", required=True)
    parser.add_argument("--python", default="python3")
    args = parser.parse_args()
    initialize(args.workflow.resolve(), args.home.absolute(), args.template, args.node, args.python)


if __name__ == "__main__":
    main()
