"""Trusted DSH Host records over the shared Runtime stores; no device dispatch."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile


def handle(options):
    """Use Host-selected Session identity and cwd, never model metadata."""
    payload = Path(__file__).resolve().parent
    sys.path.insert(0, str(payload / "workflow/openubmc-target-runtime"))
    from openubmc_target_runtime.host_records import InstalledHostRecords
    from openubmc_target_runtime.host_continuity import read_runtime_projection
    from openubmc_target_runtime.record_export import RecordExportStore, verify_export
    from openubmc_target_runtime.measurements import JsonMeasurementReader
    from openubmc_target_runtime.test_records import TestRecordRunner

    state = Path(options["stateDir"])
    task = options["taskId"]
    environment = dict(os.environ)
    # A profile-selected report replaces inherited measurement registration.
    if options.get("providerReportFile"):
        environment.pop("OPENUBMC_HOST_MEASUREMENTS_FILE", None)
        environment["OPENUBMC_HOST_PROVIDER_REPORT"] = options["providerReportFile"]
        environment["OPENUBMC_HOST_PROVIDER_REF"] = options["providerRef"]
    elif "measurements" in options:
        directory = state / "dsh-measurements"
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        report = directory / (hashlib.sha256(task.encode()).hexdigest() + ".json")
        body = {"schema": "openubmc.provider-requests/v1", "task_ref": task,
                "provider_ref": "dsh:session-log", "evidence_kind": "observed",
                # Session settlements do not inventory provider-internal retries.
                "inventory_complete": False, "provider_requests": options["measurements"]}
        descriptor, temporary = tempfile.mkstemp(dir=directory)
        try:
            with os.fdopen(descriptor, "w") as output:
                json.dump(body, output)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, report)
        finally:
            Path(temporary).unlink(missing_ok=True)
        environment["OPENUBMC_HOST_PROVIDER_REPORT"] = str(report)
        environment["OPENUBMC_HOST_PROVIDER_REF"] = "dsh:session-log"
    host = InstalledHostRecords(state, environment=environment)
    store = host.continuity
    read_run = lambda run: read_runtime_projection(state / "context-runtime.sqlite3", run)
    command = options["command"]
    if command == "prune":
        dry_run = not options.get("apply", False)
        return {"dry_run": dry_run, "files": RecordExportStore(state / "dsh-exports").prune(
            before_timestamp=options["beforeTimestamp"], dry_run=dry_run)}
    if command == "capture":
        host.capture_selection({"hook_event_name": "UserPromptSubmit", "session_id": task,
                                "cwd": options.get("cwd")})
        return {"captured": True}
    if command == "verify":
        name = options["file"]
        if (Path(name).name != name or not name.endswith(".json")
                or len(name) > 128 or not name.removesuffix(".json").isalnum()):
            raise ValueError("Select a content-addressed export filename")
        path = state / "dsh-exports" / name
        return {"content_digest": verify_export(JsonMeasurementReader(path)(None, ()))}
    if command == "test":
        request = options["test"]
        return TestRecordRunner(host).run(task, request["runId"], request["repoRef"],
            request["commandRef"], request["argv"], timeout=request.get("timeout", 600))
    if command == "export":
        document = store.export_records(task, read_run=read_run,
            producer_commit=json.loads((payload.parent / "release.json").read_text())["dshCommit"])
        path = RecordExportStore(state / "dsh-exports").write(document)
        return {"path": str(path), "content_digest": document["content_digest"]}
    handoff = store.handoff(task, read_run=read_run)
    if command == "handoff":
        return handoff
    if command == "answer":
        run = next((run for run in handoff["runs"] if run["run_id"] == options["runId"]), {})
        answer = run.get("terminal_answer")
        if answer is None:
            raise ValueError("Runtime terminal answer unavailable")
        return answer
    if command == "delivery":
        event = options["event"]
        pending = [run for run in handoff["runs"] if run.get("terminal_answer")
                   and not run["terminal_answer"]["delivery_confirmed"]]
        all_answers = [run for run in handoff["runs"] if run.get("terminal_answer")]
        text = event["text"].strip()
        expected = {"\n\n".join(run["terminal_answer"]["text"] for run in batch)
                    for batch in (pending, all_answers)}
        if not pending or not text or text not in expected:
            return {"confirmed": []}
        observed = datetime.fromtimestamp(event["timestamp"] / 1000, timezone.utc).isoformat()
        confirmed = []
        for run in pending:
            answer = run["terminal_answer"]
            if datetime.fromisoformat(observed) < datetime.fromisoformat(answer["prepared_at"].replace("Z", "+00:00")):
                raise ValueError("Host final predates prepared answer")
            projection = read_run(run["run_id"])
            # Reuse the shared Outcome fingerprint validation and atomic answer store.
            store._answers(task, run["run_id"]).acknowledge(task_id=task, run_id=run["run_id"],
                outcome=projection["run_outcome"], delivery_stage=store._facts(projection, run["run_id"])["delivery_stage"],
                text=answer["text"], host_event_id=event["id"], observed_at=observed,
                delivery_source="dsh-session-v1")
            confirmed.append(run["run_id"])
        return {"confirmed": confirmed}
    raise ValueError("Unsupported Host record operation")


if __name__ == "__main__":
    try:
        from local_admin import integrity
        if not integrity():
            raise ValueError("package_integrity_failed_reinstall_archive")
        value = json.loads(sys.stdin.buffer.readline(256 * 1024 + 1))
        print(json.dumps(handle(value), ensure_ascii=False), flush=True)
    except Exception as error:
        print(json.dumps({"ok": False, "error": type(error).__name__}), flush=True)
        sys.exit(1)
