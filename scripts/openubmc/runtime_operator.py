"""Native Host administration of the pinned Runtime; never exposes Agent execution."""
from __future__ import annotations

import importlib.util
import argparse
import json
import os
from pathlib import Path
import sys
import uuid


def dispatch(service, request, task_id):
    """Preserve Runtime validation, failures and structured data for native commands."""
    from openubmc_target_runtime import JsonRpcMcpEndpoint

    if service.interface_profile != "operator":
        raise ValueError("Operator commands require the operator interface")
    endpoint = JsonRpcMcpEndpoint(service)
    catalog = endpoint.handle({"jsonrpc": "2.0", "id": 0, "method": "tools/list"})["result"]
    if request["operation"] == "tools":
        return catalog
    if request["operation"] not in {tool["name"] for tool in catalog["tools"]}:
        raise ValueError("Select an advertised operator operation; Agent execution is unavailable")
    response = endpoint.handle({"jsonrpc": "2.0", "id": str(uuid.uuid4()), "method": "tools/call",
        "params": {"name": request["operation"], "arguments": request.get("arguments", {}),
                   "_meta": {"taskId": task_id}}})
    if "error" in response:
        return {"isError": True, "protocolError": response["error"]}
    return response["result"]


def handle(options):
    """Load the verified installed Runtime with Host-selected private state and identity."""
    root = Path(__file__).resolve().parent / "workflow"
    entry = root / "openubmc-debug/scripts/target_runtime_mcp.py"
    sys.path.insert(0, str(entry.parent))
    os.environ["OPENUBMC_TARGET_RUNTIME_INTERFACE_PROFILE"] = "operator"
    os.environ["OPENUBMC_TARGET_RUNTIME_STATE_DIR"] = options["stateDir"]
    os.environ["OPENUBMC_CREDENTIALS_FILE"] = options["credentialsFile"]
    spec = importlib.util.spec_from_file_location("dsh_operator_launcher", entry)
    launcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(launcher)
    service = launcher.create_service()
    try:
        return dispatch(service, options, options["taskId"])
    finally:
        service.close()


if __name__ == "__main__":
    try:
        native_cli = len(sys.argv) > 1
        if native_cli:
            parser = argparse.ArgumentParser(description=__doc__)
            parser.add_argument("--state-dir", required=True)
            parser.add_argument("--credentials-file", required=True)
            parser.add_argument("--session-id", required=True)
            parser.add_argument("--operation", default="tools")
            parser.add_argument("--arguments", default="{}")
            args = parser.parse_args()
            body = json.dumps({"stateDir": args.state_dir, "credentialsFile": args.credentials_file,
                "taskId": args.session_id, "operation": args.operation, "arguments": json.loads(args.arguments)}).encode()
        else:
            body = sys.stdin.buffer.readline(256 * 1024 + 1)
        if len(body) > 256 * 1024:
            raise ValueError("Operator request exceeds 256 KiB")
        from local_admin import integrity
        if not integrity():
            raise ValueError("package_integrity_failed_reinstall_archive")
        result = handle(json.loads(body))
        print(json.dumps(result, ensure_ascii=False), flush=True)
        if native_cli and result.get("isError"):
            sys.exit(1)
    except Exception as error:
        print(json.dumps({"isError": True, "error": type(error).__name__}), flush=True)
        sys.exit(1)
