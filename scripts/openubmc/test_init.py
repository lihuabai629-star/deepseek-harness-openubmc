"""Offline checks for profile ownership and manifest Skill mappings."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("openubmc_init", Path(__file__).with_name("init.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ProfileTests(unittest.TestCase):
    def test_manifest_mapping_and_existing_home(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workflow = root / "workflow"
            workflow.mkdir()
            (workflow / "workflow.json").write_text(json.dumps({
                "skills": [{"name": "openubmc-dt-testing", "path": "testing"}],
                "profiles": {"full": ["openubmc-dt-testing"]},
            }))
            skill = workflow / "testing"
            skill.mkdir()
            (skill / "SKILL.md").write_text("Run $HOME/.agents/skills/openubmc-dt-testing/scripts/check.py\n")
            (skill / "scripts").mkdir()
            (skill / "scripts/check.py").write_text("print('ok')\n")
            for entry in ("openubmc-debug/scripts/target_runtime_mcp.py", "openubmc-kb-mcp/src/server.js"):
                path = workflow / entry
                path.parent.mkdir(parents=True)
                path.touch()
            home = root / "home"
            module.initialize(workflow, home, "headless", "node", "python3")
            case_module = home / "profiles/openubmc/node_modules/@deepseek-ai/dsh-experimental-openubmc-cases"
            self.assertTrue((case_module / "package.json").is_file())
            profile_manifest = json.loads((home / "profiles/openubmc/package.json").read_text())
            self.assertIn("@deepseek-ai/dsh-experimental-openubmc-cases", profile_manifest["dependencies"])
            deployed = home / "openubmc-skills/openubmc-dt-testing"
            self.assertIn(str(skill), (deployed / "SKILL.md").read_text())
            self.assertEqual((deployed / "scripts/check.py").read_text(), "print('ok')\n")
            patch_path = home / "profiles/openubmc/cordis.patch.yml"
            original = patch_path.read_bytes()
            patch = json.loads(original)
            self.assertFalse(patch[0]["config"]["includeDefaultRoots"])
            runtime = next(entry["config"] for entry in patch[1]["insert"] if entry["id"] == "openubmc-target-runtime")
            self.assertEqual(runtime["sessionIdMetadataKey"], "taskId")
            self.assertTrue(runtime["structuredContentInText"])
            self.assertTrue(runtime["structuredContentInMeta"])
            self.assertEqual(patch[1]["insert"][0]["name"], "@deepseek-ai/dsh-experimental-openubmc-cases")
            self.assertEqual(runtime["env"]["OPENUBMC_CREDENTIALS_FILE"], str(home / "credentials.env"))
            with self.assertRaises(FileExistsError):
                module.initialize(workflow, home, "web", "node", "python3")
            self.assertEqual(patch_path.read_bytes(), original)
            self.assertTrue((skill / "scripts/check.py").is_file())


if __name__ == "__main__":
    unittest.main()
