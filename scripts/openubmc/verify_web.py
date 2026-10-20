"""Qualify an installed bundle's authenticated Web entry without model or target calls."""
from __future__ import annotations

import argparse
from http.cookiejar import CookieJar
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time
from urllib.parse import urljoin, urlsplit
from urllib.request import build_opener, HTTPCookieProcessor


class Scripts(HTMLParser):
    """Read actual script attributes, decoding HTML entities in module query strings."""
    def __init__(self) -> None:
        super().__init__()
        self.sources: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        source = dict(attrs).get("src")
        if tag == "script" and source:
            self.sources.add(source)


def verify(archive: Path, dsh: Path, node: str, timeout: float = 120) -> None:
    """Install into a private profile, exchange launch authentication, and fetch its scripts."""
    with tempfile.TemporaryDirectory(prefix="dsh-openubmc-web-") as raw:
        root = Path(raw)
        (root / "package.json").write_text(json.dumps({"private": True, "packageManager": "pnpm@11.7.0"}))
        env = dict(os.environ, DSH_HOME=str(root / "home"), DSH_TELEMETRY_DISABLED="1",
                   XDG_CONFIG_HOME=str(root / "config"), XDG_CACHE_HOME=str(root / "cache"))
        installed = subprocess.run([node, str(dsh), "plugin", "--profile", "web", "add", str(archive)],
                                   cwd=root, env=env, capture_output=True, text=True, timeout=timeout)
        if installed.returncode:
            raise RuntimeError("Web profile plugin installation failed")
        log_path = root / "web.log"
        with log_path.open("w") as log:
            process = subprocess.Popen([node, str(dsh), "--profile", "web", "--host", "127.0.0.1",
                                        "--port", "0", "--no-open"], cwd=root, env=env,
                                       stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            deadline = time.monotonic() + timeout
            launch_url = None
            while time.monotonic() < deadline:
                output = log_path.read_text()
                match = re.search(r"dsh web: (http://127\.0\.0\.1:\d+/\?token=[A-Za-z0-9_-]+)", output)
                if match:
                    launch_url = match[1]
                    break
                if process.poll() is not None:
                    raise RuntimeError("Web Host exited before readiness")
                time.sleep(0.1)
            if launch_url is None:
                raise TimeoutError("Web Host did not report readiness")
            if "did not activate" in output:
                raise RuntimeError("A Web profile plugin failed activation")
            opener = build_opener(HTTPCookieProcessor(CookieJar()))
            with opener.open(launch_url, timeout=15) as response:
                if response.status != 200 or urlsplit(response.url).query:
                    raise AssertionError("Web launch authentication did not exchange for a clean URL")
                html = response.read().decode()
                base = response.url
            parser = Scripts()
            parser.feed(html)
            scripts = parser.sources
            if not scripts:
                raise AssertionError("The Web page has no frontend scripts")
            for script in scripts:
                url = urljoin(base, script)
                if urlsplit(url).netloc != urlsplit(base).netloc:
                    raise AssertionError("The Web page unexpectedly depends on a remote script")
                with opener.open(url, timeout=15) as response:
                    if response.status != 200 or not response.read():
                        raise AssertionError("A Web frontend script is unavailable")
            print(json.dumps({"status": "passed", "authenticated_index": True,
                              "frontend_scripts": len(scripts), "model_calls": 0, "target_calls": 0}))
        finally:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass  # The Host already finished; communicate still reaps it.
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise RuntimeError("Web Host did not stop within its teardown budget") from None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--dsh", type=Path, required=True)
    parser.add_argument("--node", required=True)
    args = parser.parse_args()
    verify(args.archive.resolve(strict=True), args.dsh.resolve(strict=True), args.node)
