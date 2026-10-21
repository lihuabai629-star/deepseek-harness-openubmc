"""Launch the selected native Agent gateway with trusted MCP metadata."""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import sys


def serve(entry: Path) -> None:
    """Use Runtime's native operation-id and cancellation handling unchanged."""
    sys.path.insert(0, str(entry.parent))
    spec = importlib.util.spec_from_file_location("dsh_openubmc_launcher", entry)
    if spec is None or spec.loader is None:
        raise ValueError("Invalid Runtime launcher")
    launcher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(launcher)
    runtime = launcher._load_runtime_module()
    service = launcher.create_service()
    endpoint = runtime.JsonRpcMcpEndpoint(service)
    discovery = endpoint.handle({"jsonrpc": "2.0", "id": 0, "method": "tools/list"})
    if {tool["name"] for tool in discovery["result"]["tools"]} != {"observe", "execute"}:
        raise ValueError("DSH requires the native observe/execute Agent interface")
    runtime.StdioMcpServer(endpoint).serve()


def main() -> None:
    """Launch only the explicitly selected workflow Runtime."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entry", type=Path, required=True)
    args = parser.parse_args()
    serve(args.entry.resolve(strict=True))


if __name__ == "__main__":
    main()
