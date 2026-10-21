"""Private configuration readiness, dependency cache ownership and process limits."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("dsh_local_admin", Path(__file__).with_name("local_admin.py"))
admin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admin)
WORKFLOW = os.environ.get("DSH_OPENUBMC_WORKFLOW")


class LocalProcessTests(unittest.TestCase):
    def test_limits_output_and_waits_for_termination(self):
        with self.assertRaisesRegex(ValueError, "output_limit"):
            admin.owned_run([sys.executable, "-c", "print('x'*2097152); import time; time.sleep(300)"], timeout=5)

    def test_deadline_stops_silent_process(self):
        with self.assertRaises(subprocess.TimeoutExpired):
            admin.owned_run([sys.executable, "-c", "import time; time.sleep(300)"], timeout=0.1)


@unittest.skipUnless(WORKFLOW, "Set DSH_OPENUBMC_WORKFLOW to the qualified workflow checkout")
class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="dsh-maintenance-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        payload = self.root / "payload"
        payload.mkdir()
        self.workflow = payload / "workflow"
        kb = self.workflow / "openubmc-kb-mcp"
        shutil.copytree(Path(WORKFLOW) / "openubmc-kb-mcp/src", kb / "src")
        for name in ("package.json", "package-lock.json"):
            shutil.copyfile(Path(WORKFLOW) / "openubmc-kb-mcp" / name, kb / name)
        sys.path.insert(0, str(Path(WORKFLOW) / "openubmc-target-runtime"))
        self.addCleanup(sys.path.remove, str(Path(WORKFLOW) / "openubmc-target-runtime"))
        self.enterContext(patch.object(admin, "WORKFLOW", self.workflow))
        self.enterContext(patch.object(admin, "PAYLOAD", payload))
        (self.root / "release.json").write_text(json.dumps({"dshCommit": "fixture", "pluginVersion": "0.3.0"}))
        self.credentials = self.root / "credentials.env"
        self.enterContext(patch.dict(os.environ, {"XDG_CONFIG_HOME": str(self.root / "config"),
                          "OPENUBMC_CREDENTIALS_FILE": str(self.credentials)}, clear=True))
        self.maintenance = admin.Maintenance({"stateDir": str(self.root / "state"),
                            "credentialsFile": str(self.credentials), "node": "node"})

    def test_nonempty_invalid_credentials_do_not_claim_ready(self):
        self.credentials.write_text("# incomplete local credentials\n")
        self.credentials.chmod(0o600)
        with patch.object(admin, "integrity", return_value=True), patch.object(admin, "owned_run", return_value=(0, b"")):
            report = self.maintenance.status()
        self.assertFalse(report["local_configuration"]["targets"]["configured"])
        self.assertEqual(report["remote_target_authentication"], "not_checked")
        self.assertEqual(report["provider_connection"], "not_checked")

    def test_cache_identity_includes_source_and_rejects_drift(self):
        first = self.maintenance.kb_directory()
        first.mkdir(parents=True)
        shutil.copytree(self.workflow / "openubmc-kb-mcp/src", first / "src")
        (first / "ready.json").write_text(json.dumps({"source": first.parent.name,
                                            "files": admin.Maintenance.cache_inventory(first)}))
        self.assertEqual(self.maintenance.kb_entry(), first / "src/server.js")
        (first / "src/server.js").write_text("modified cached source")
        with self.assertRaisesRegex(ValueError, "cache_integrity"):
            self.maintenance.kb_entry()
        (self.workflow / "openubmc-kb-mcp/src/server.js").write_text("new release source")
        self.assertNotEqual(self.maintenance.kb_directory(), first)
        self.assertEqual(self.maintenance.kb_entry(), self.workflow / "openubmc-kb-mcp/src/server.js")


if __name__ == "__main__":
    unittest.main()
