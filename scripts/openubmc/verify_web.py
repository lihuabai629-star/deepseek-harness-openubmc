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
from urllib.request import build_opener, HTTPCookieProcessor, Request, urlopen
from urllib.error import HTTPError


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
            raise RuntimeError("Web profile plugin installation failed:\n" + installed.stdout[-4000:] + installed.stderr[-4000:])
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
            route = urljoin(base, 'openubmc?kind=targets')
            try:
                urlopen(route, timeout=15)
            except HTTPError as error:
                if error.code != 401:
                    raise AssertionError('Anonymous configuration must fail authentication') from None
            else:
                raise AssertionError('Configuration accepted an anonymous request')
            with opener.open(route, timeout=30) as response:
                page = response.url
                if urlsplit(page).netloc != urlsplit(base).netloc or not urlsplit(page).fragment:
                    raise AssertionError('Configuration did not stay on the authenticated Web address')
                document = response.read()
                if b'src="page.js"' not in document or b'href="page.css"' not in document:
                    raise AssertionError('Configuration assets do not preserve the proxy prefix')
            token = urlsplit(page).fragment
            clean = page.split('#', 1)[0]
            origin = f'{urlsplit(base).scheme}://{urlsplit(base).netloc}'
            headers = {'X-OpenUBMC-Session': token, 'Origin': origin, 'Content-Type': 'application/json'}
            def request(path, data=None, custom_headers=None):
                req = Request(urljoin(clean, path), headers=custom_headers or headers,
                              data=json.dumps(data).encode() if data is not None else None)
                try:
                    with opener.open(req, timeout=45) as response:
                        return response.status, response.read()
                except HTTPError as error:
                    return error.code, error.read()
            if request('api/state', custom_headers={'Origin': origin})[0] != 403:
                raise AssertionError('Configuration accepted a missing page token')
            if request('api/state', custom_headers={**headers, 'Origin': 'https://example.invalid'})[0] != 403:
                raise AssertionError('Configuration accepted a foreign Origin')
            code, body = request('api/state')
            if code != 200:
                raise AssertionError('Configuration state unavailable through the proxy')
            code, body = request('page.js')
            if code != 200 or b"new URL('.' + path, location.href)" not in body:
                raise AssertionError('Page requests do not preserve the proxy prefix')
            code, body = request('api/save', {'kind': 'targets', 'expected_revision': None,
                                            'config': {'schema_version': 1}})
            if code != 200:
                raise AssertionError('Local configuration draft failed')
            revision = json.loads(body)['revision']
            code, body = request('api/activate', {'kind': 'targets', 'revision': revision, 'expected_active_revision': None})
            if code != 200 or json.loads(body)['active_revision'] != revision:
                raise AssertionError('Local configuration activation failed')
            code, body = request('api/plugin', {'action': 'status'})
            report = json.loads(body)
            if code != 200 or report.get('integrity') is not True or report.get('remote_target_authentication') != 'not_checked':
                raise AssertionError('Diagnostics confused local readiness with device authentication')
            if request('api/close', {})[0] != 200:
                raise AssertionError('Configuration page failed to close')
            print(json.dumps({"status": "passed", "authenticated_index": True,
                              "frontend_scripts": len(scripts), "configuration_proxy": True,
                              "private_activation": True, "foreign_origin_rejected": True,
                              "model_calls": 0, "target_calls": 0}))
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
