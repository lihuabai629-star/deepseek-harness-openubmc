"""Exercise native administration through the real disjoint Runtime interface."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest

WORKFLOW = os.environ.get("DSH_OPENUBMC_WORKFLOW")


@unittest.skipUnless(WORKFLOW, "Set DSH_OPENUBMC_WORKFLOW to the qualified workflow checkout")
class RuntimeOperatorTests(unittest.TestCase):
    def setUp(self):
        sys.path.insert(0, str(Path(WORKFLOW) / "openubmc-target-runtime"))
        sys.path.insert(0, str(Path(WORKFLOW) / "openubmc-target-runtime/tests"))
        from openubmc_target_runtime import RuntimeMcpService, SQLiteRuntimeRepository
        from test_mcp_contracts import FakeDebugBackend

        temporary = tempfile.TemporaryDirectory(prefix="dsh-operator-")
        self.addCleanup(temporary.cleanup)
        repository = SQLiteRuntimeRepository(Path(temporary.name) / "runtime.sqlite3")
        self.service = RuntimeMcpService(FakeDebugBackend(), context_repository=repository, interface_profile="operator")
        self.addCleanup(self.service.close)
        spec = importlib.util.spec_from_file_location("dsh_runtime_operator", Path(__file__).with_name("runtime_operator.py"))
        self.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.worker)

    def call(self, operation, arguments=None):
        return self.worker.dispatch(self.service, {"operation": operation, "arguments": arguments or {}}, "trusted-session")

    def test_catalog_retains_governance_and_excludes_agent_and_domain_execution(self):
        names = {tool["name"] for tool in self.call("tools")["tools"]}
        self.assertTrue({"case_read", "evidence_read", "case_replay_export", "case_replay_run", "case_close",
            "case_forget", "session_outcome_record", "session_outcome_transition", "session_outcome_promote"} <= names)
        self.assertFalse({"observe", "execute", "live_patch_run", "upgrade_run"} & names)
        with self.assertRaises(ValueError):
            self.call("execute", {"kind": "start"})

    def test_runtime_failure_retains_structured_result(self):
        result = self.call("case_read", {"case_id": "missing-case"})
        self.assertTrue(result["isError"])
        self.assertTrue(result["content"])
        self.assertTrue(result["structuredContent"])

    def test_governance_summary_uses_runtime_without_a_device_dispatch(self):
        result = self.call("session_outcome_summary")
        self.assertFalse(result["isError"])
        self.assertTrue(result["structuredContent"])

    def test_agent_service_cannot_be_used_as_operator_transport(self):
        self.service.interface_profile = "agent"
        with self.assertRaises(ValueError):
            self.call("tools")


if __name__ == "__main__":
    unittest.main()
