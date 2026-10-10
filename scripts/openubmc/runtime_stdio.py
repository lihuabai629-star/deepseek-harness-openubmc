"""Bind trusted DSH call identities to the existing Runtime's operation journal."""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import re
import sys
import threading


def serve(entry: Path) -> None:
    """Load the workflow launcher and preserve RPC response/cancellation identities."""
    sys.path.insert(0, str(entry.parent))
    spec = importlib.util.spec_from_file_location("dsh_openubmc_launcher", entry)
    if spec is None or spec.loader is None:
        raise ValueError("Invalid Runtime launcher")
    launcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(launcher)
    runtime = launcher._load_runtime_module()
    underlying = launcher.create_service()
    identities: dict[tuple[str, str], str] = {}
    lock = threading.Lock()

    class Service:
        def __getattr__(self, name):
            return getattr(underlying, name)

        def cancel_operation(self, task_id, operation_id):
            with lock:
                selected = identities.get((task_id, operation_id), operation_id)
            return underlying.cancel_operation(task_id, selected)

    class Endpoint(runtime.JsonRpcMcpEndpoint):
        def handle(self, message):
            params = message.get("params", {})
            meta = params.get("_meta", {}) if isinstance(params, dict) else {}
            operation_id = meta.get("dsh/openubmc-operation-id") if isinstance(meta, dict) else None
            if message.get("method") != "tools/call" or operation_id is None:
                return super().handle(message)
            if not isinstance(operation_id, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,256}", operation_id):
                return self._error(message.get("id"), -32602, "Invalid trusted operation identity")
            task_id = self.task_id_for_params(params)
            key = (task_id, str(message.get("id")))
            with lock:
                identities[key] = operation_id
            try:
                response = super().handle({**message, "id": operation_id})
                if response is not None:
                    response["id"] = message.get("id")
                return response
            finally:
                with lock:
                    identities.pop(key, None)

    runtime.StdioMcpServer(Endpoint(Service())).serve()


def main() -> None:
    """Launch only the explicitly selected workflow Runtime."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entry", type=Path, required=True)
    args = parser.parse_args()
    serve(args.entry.resolve(strict=True))


if __name__ == "__main__":
    main()
