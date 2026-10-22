"""DSH Host bridge against the real Runtime ledger and a fixture device backend."""
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


WORKFLOW = os.environ.get("DSH_OPENUBMC_WORKFLOW")


@unittest.skipUnless(WORKFLOW, "Set DSH_OPENUBMC_WORKFLOW to the qualified workflow checkout")
class HostBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dsh-host-records-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        payload = self.root / "package/payload"
        payload.mkdir(parents=True)
        (payload / "workflow").symlink_to(Path(WORKFLOW))
        worker = payload / "host_records.py"
        shutil.copyfile(Path(__file__).with_name("host_records.py"), worker)
        (payload.parent / "release.json").write_text(json.dumps({"dshCommit": "a" * 40}))
        spec = importlib.util.spec_from_file_location("dsh_records", worker)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        sys.path.insert(0, str(Path(WORKFLOW) / "openubmc-target-runtime"))
        sys.path.insert(0, str(Path(WORKFLOW) / "openubmc-target-runtime/tests"))
        self.project = self.root / "project"
        self.project.mkdir()
        self.git("init", "-q")
        (self.project / "source.txt").write_text("original\n")
        self.git("add", ".")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Fixture")
        self.state = self.root / "state"

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.project), *args], text=True, stderr=subprocess.DEVNULL).strip()

    def call(self, command, task="owner", **fields):
        return self.module.handle({"stateDir": str(self.state), "taskId": task, "command": command, **fields})

    def start(self):
        from openubmc_target_runtime import RuntimeMcpService, SQLiteRuntimeRepository
        from openubmc_target_runtime.host_records import InstalledHostRecords
        from test_mcp_contracts import FakeDebugBackend
        self.call("capture", cwd=str(self.project))
        host = InstalledHostRecords(self.state)
        service = RuntimeMcpService(FakeDebugBackend(), context_repository=SQLiteRuntimeRepository(self.state / "context-runtime.sqlite3"),
            host_continuity=host.continuity, host_context_provider=host.workspace_context, source_checker=host.check_source)
        self.addCleanup(service.close)
        turn = service.call_exposed_tool("execute", {"kind": "start", "target": "192.0.2.1", "intent": "diagnosis-only"},
            task_id="owner", operation_id="first")
        return service, turn

    def test_capture_freezes_source_and_export_verification_survives_restart(self):
        service, turn = self.start()
        handoff = self.call("handoff")
        snapshot = handoff["runs"][0]["run_record"]["workspace_binding"]["snapshot"]
        self.assertEqual(snapshot["repositories"][0]["commit"], self.git("rev-parse", "HEAD"))
        self.assertFalse(snapshot["repositories"][0]["dirty"])
        self.call("capture", cwd=str(self.root))
        service.close()
        fresh = self.call("handoff")
        self.assertEqual(fresh["runs"][0]["run_record"]["workspace_binding"]["snapshot"], snapshot)
        self.assertEqual(self.call("handoff", task="fork")["runs"], [])
        exported = self.call("export")
        verified = self.call("verify", file=Path(exported["path"]).name)
        self.assertEqual(verified["content_digest"], exported["content_digest"])
        document = Path(exported["path"]).read_text()
        self.assertNotIn(str(self.root), document)
        self.assertNotIn("192.0.2.1", document)
        self.assertEqual(fresh["runs"][0]["run_id"], turn["run_id"])
        with self.assertRaises(ValueError):
            self.call("verify", file="../outside.json")

    def test_native_test_receipt_is_exported_and_source_drift_denies_another_test(self):
        _service, turn = self.start()
        repo = self.call("handoff")["runs"][0]["run_record"]["workspace_binding"]["snapshot"]["repositories"][0]
        request = {"runId": turn["run_id"], "repoRef": repo["repo_ref"], "commandRef": "test:fixture",
                   "argv": [sys.executable, "-c", "print('fixture test')"]}
        self.assertEqual(self.call("test", test=request)["status"], "passed")
        exported = self.call("export")
        document = json.loads(Path(exported["path"]).read_text())
        self.assertTrue(any(entry["kind"] == "test" and entry["status"] == "passed"
            for entry in document["operation_evidence"]["snapshot"]["entries"]))
        (self.project / "source.txt").write_text("changed\n")
        with self.assertRaises(ValueError):
            self.call("test", test=request)
        with self.assertRaises(ValueError):
            self.call("test", task="fork", test=request)

    def test_only_exact_committed_final_confirms_runtime_terminal_answer(self):
        service, turn = self.start()
        gate = turn["gate"]
        action = {"kind": "control", "command": "cancel", "run_id": turn["run_id"],
                  **{key: gate[key] for key in ("gate_id", "gate_version", "schema_digest")}}
        service.call_exposed_tool("execute", action, task_id="owner", operation_id="cancel")
        answer = self.call("answer", runId=turn["run_id"])
        event = {"id": "dsh:owner:42", "timestamp": datetime.now(timezone.utc).timestamp() * 1000, "text": "Different final"}
        self.assertEqual(self.call("delivery", event=event)["confirmed"], [])
        event["text"] = answer["text"]
        self.assertEqual(self.call("delivery", event=event)["confirmed"], [turn["run_id"]])
        self.assertTrue(self.call("handoff")["runs"][0]["terminal_answer"]["delivery_confirmed"])
        self.assertEqual(self.call("delivery", event=event)["confirmed"], [])

    def test_session_observations_never_claim_complete_usage_or_run_attribution(self):
        self.start()
        handoff = self.call("handoff", measurements=[{"invocation_ref": "dsh:1", "run_ref": None,
            "usage": {"input_tokens": 13, "output_tokens": 8}}])
        usage = handoff["task_aggregate"]["usage_totals"]
        self.assertIsNone(usage["input_tokens"])
        self.assertNotEqual(usage["status"], "complete")

    def test_trusted_provider_inventory_retains_exact_run_attribution_and_rejects_foreign_task(self):
        _service, turn = self.start()
        report = self.root / "provider.json"
        body = {"schema": "openubmc.provider-requests/v1", "task_ref": "owner",
            "provider_ref": "fixture-provider", "evidence_kind": "observed", "inventory_complete": True,
            "provider_requests": [{"invocation_ref": "physical-request-1", "run_ref": turn["run_id"],
                "usage": {"input_tokens": 13, "output_tokens": 8, "cached_tokens": 0}}]}
        report.write_text(json.dumps(body))
        fields = {"providerReportFile": str(report), "providerRef": "fixture-provider",
            "measurements": [{"invocation_ref": "partial-host-settlement", "run_ref": None, "usage": {}}]}
        handoff = self.call("handoff", **fields)
        self.assertEqual(handoff["task_aggregate"]["usage_totals"]["input_tokens"], 13)
        self.assertEqual(handoff["runs"][0]["run_record"]["usage"]["input_tokens"], 13)
        self.assertEqual(handoff["runs"][0]["run_record"]["usage"]["status"], "available")
        body["task_ref"] = "another-session"
        report.write_text(json.dumps(body))
        self.assertIsNone(self.call("handoff", **fields)["task_aggregate"]["usage_totals"]["input_tokens"])
        report.unlink()
        self.assertIsNone(self.call("handoff", **fields)["task_aggregate"]["usage_totals"]["input_tokens"])

    def test_export_pruning_previews_before_deleting_owned_exports(self):
        self.start()
        path = Path(self.call("export")["path"])
        directory = path.parent
        foreign = directory / "user-data.txt"
        foreign.write_text("retain")
        request = {"beforeTimestamp": datetime.now(timezone.utc).timestamp() + 60}
        self.assertTrue(self.call("prune", **request)["dry_run"])
        self.assertTrue(path.exists())
        self.assertFalse(self.call("prune", apply=True, **request)["dry_run"])
        self.assertFalse(path.exists())
        self.assertTrue(foreign.exists())


if __name__ == "__main__":
    unittest.main()
