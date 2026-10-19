"""Keyless Python SDK projection of native Agent observations from a built dsh profile."""
import json
import os
from pathlib import Path
import shlex
import shutil
import tempfile
import unittest

from deepseek_harness import DeepSeekHarness, DeepSeekHarnessConfig

ROOT = Path(__file__).resolve().parents[2]
SCENARIO = ROOT / 'snapshots/sdk/openubmc-inspection'
EXPECTED = ROOT / 'scripts/snapshots/python-sdk-single-exe/openubmc-inspection'


class PythonSdkInspectionTests(unittest.TestCase):
    def test_native_inspection_survives_sdk_projection(self):
        with tempfile.TemporaryDirectory(prefix='dsh-python-inspection-') as raw:
            cwd = Path(raw)
            home = cwd / '.dsh'
            profile = home / 'profiles/sdk'
            modules = profile / 'node_modules/@deepseek-ai'
            modules.mkdir(parents=True)
            package = '@deepseek-ai/dsh-experimental-openubmc-runtime'
            source = ROOT / 'packages/experimental/openubmc-runtime'
            (modules / 'dsh-experimental-openubmc-runtime').symlink_to(source)
            replay = ROOT / 'packages/test-support/llm-replay'
            (modules / 'dsh-llm-replay').symlink_to(replay)
            (profile / 'package.json').write_text(json.dumps({'name': 'python-inspection-profile', 'type': 'module', 'private': True, 'dependencies': {package: f'link:{source}', '@deepseek-ai/dsh-llm-replay': f'link:{replay}'}, 'dsh': {'profile': {'bundles': ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-sdk-app']}}}))
            runtime = cwd / 'runtime.mjs'
            runtime.write_bytes((SCENARIO / 'workspace/runtime.mjs').read_bytes())
            patch = cwd / 'inspection.yml'
            patch.write_text("- id: session-persistence-jsonl\n  config:\n    root: " + json.dumps(str(home / "sessions")) + "\n    compression: none\n" + (SCENARIO / 'cordis.snapshot.yml').read_text().replace("'./workspace/human.mjs'", json.dumps(str(SCENARIO / 'workspace/human.mjs'))))
            dsh = cwd / 'dsh'
            node = shutil.which('node')
            self.assertIsNotNone(node, 'The supported Node executable must be on PATH')
            dsh.write_text('#!/bin/sh\nexec ' + shlex.quote(node) + ' ' + shlex.quote(str(ROOT / 'apps/cli/lib/bin.js')) + ' "$@"\n')
            dsh.chmod(0o700)
            with DeepSeekHarness(DeepSeekHarnessConfig(dsh_bin=str(dsh), dsh_home=str(home), cwd=str(cwd), patches=(str(patch),), env={'DSH_SNAPSHOT': 'replay', 'DSH_SNAPSHOT_FILE': str(SCENARIO / 'session.v4.jsonl'), 'DSH_SNAPSHOT_OVERRIDE': str(SCENARIO / 'replay.override.json')}, request_timeout_seconds=30, shutdown_timeout_seconds=5)) as sdk:
                with sdk.client.subscribe_notifications() as subscription:
                    result = sdk.run('Read the Case observation.')
                    observed = []
                    subscription.drain(observed.append)
            self.assertEqual(result.final_response, 'SDK_INSPECTION_OK')
            inspections = [event for event in result.events if event.get('type') == 'openubmc/inspection']
            # Native commands run during Session creation, before the owned model interval; notifications still project them.
            notifications = [item for item in observed if item.method == 'session.event' and isinstance(item.payload, dict) and item.payload.get('event', {}).get('type') == 'openubmc/inspection']
            logs = list((home / 'sessions').rglob('session.v4.jsonl'))
            self.assertEqual(len(logs), 1)
            persisted = [json.loads(line) for line in logs[0].read_text().splitlines()]
            native = next(event for event in persisted if event.get('type') == 'openubmc/inspection')
            projection = {'final_response': result.final_response, 'inspection_in_run_events': len(inspections), 'inspection_notifications': len(notifications), 'inspection': native['data']}
            self.assertEqual(len(notifications), 1)
            projection['inspection']['commandId'] = '{{command:1}}'
            actual = json.dumps(projection, indent=2) + '\n'
            if os.environ.get('DSH_UPDATE_PYTHON_INSPECTION') == '1':
                EXPECTED.mkdir(parents=True, exist_ok=True)
                (EXPECTED / 'result.json').write_text(actual)
            self.assertEqual(actual, (EXPECTED / 'result.json').read_text())


if __name__ == '__main__':
    unittest.main()
