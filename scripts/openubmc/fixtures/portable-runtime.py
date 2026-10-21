"""Offline MCP peer for the portable bridge; every accepted call is recorded."""
import json
from pathlib import Path
import socket
import sys

for line in sys.stdin:
    request = json.loads(line)
    if "id" not in request:
        continue
    method = request["method"]
    if method == "initialize":
        barrier = Path("initialize-barrier.json")
        if barrier.exists():
            with socket.create_connection(("127.0.0.1", json.loads(barrier.read_text())["port"])) as peer:
                peer.recv(1)
        result = {"protocolVersion": request["params"]["protocolVersion"], "capabilities": {"tools": {}},
                  "serverInfo": {"name": "offline-runtime", "version": "1"}}
    elif method == "tools/list":
        result = {"tools": [{"name": name, "description": name, "inputSchema": {"type": "object"}}
                            for name in ["observe", "execute"]]}
    elif method == "tools/call":
        params = request["params"]
        args = params["arguments"]
        with Path("calls.jsonl").open("a") as output:
            output.write(json.dumps(params) + "\n")
        if args.get("purpose") == "disconnect":
            sys.exit(0)
        if args.get("purpose") == "wait":
            # The test cancels after observing the recorded dispatch; no timer races.
            continue
        run = "run-" + params["_meta"]["taskId"]
        document = {"schema": "openubmc.target-runtime.v1/agent-gateway-v1/turn", "run_id": run,
                    "state": "waiting_response", "gate": {"gate_id": "gate-one", "gate_version": 1,
                    "schema_digest": "sha256:abc", "input_schema": {"type": "object"}}, "incident": None,
                    "purpose": args.get("purpose")}
        result = {"content": [{"type": "text", "text": "offline result"}], "structuredContent": document,
                  "isError": args.get("purpose") == "fail"}
    else:
        result = {}
    print(json.dumps({"jsonrpc": "2.0", "id": request["id"], "result": result}), flush=True)
