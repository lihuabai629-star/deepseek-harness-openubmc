"""Real Agent gateway, durable Runtime storage and an offline device backend."""
import os
import json
from pathlib import Path
import sys
from types import SimpleNamespace
from datetime import datetime, timezone


def _load_runtime_module():
    sys.path.insert(0, str(Path(os.environ['DSH_OPENUBMC_WORKFLOW']) / 'openubmc-target-runtime'))
    import openubmc_target_runtime
    return openubmc_target_runtime


def create_service():
    runtime = _load_runtime_module()
    state = Path(os.environ['DSH_RECOVERY_STATE'])

    class Backend:
        def open_task(self, task_id):
            return SimpleNamespace(task_id=task_id)

        def close_task(self, task):
            pass

        def task_status(self, task):
            return {'task_id': task.task_id}

        def maintain_task(self, task):
            return 0

        def debug_run(self, task, arguments, context):
            context.raise_if_stopped()
            return {'ok': True, 'schema': 'openubmc-debug.v1', 'task': task.task_id,
                    'summary': 'offline bounded diagnosis', 'root_cause': 'offline source defect',
                    'observed_at': datetime.now(timezone.utc).isoformat(), 'freshness': {'status': 'fresh'}}

        def debug_collect(self, task, arguments, context):
            context.raise_if_stopped()
            result = {'ok': True, 'observed_at': datetime.now(timezone.utc).isoformat(),
                    'result': {'capabilities': {'ssh_transport': True, 'mdbctl': True, 'busctl': False},
                               'lanes': {'ssh': {}}}}
            if arguments.get('_minimum_target_epoch'):
                result['target_epoch'] = arguments['_minimum_target_epoch']
                result['business_acceptance'] = 'passed'
            return result

        def live_patch_run(self, task, arguments, context):
            context.raise_if_stopped()
            scenario = os.environ.get('DSH_RECOVERY_SCENARIO')
            if scenario not in {'retry', 'retry-removed'}:
                raise RuntimeError('The fixture has no live-patch scenario')
            path = state / 'effects.jsonl'
            recovering = arguments.get('_runtime_effect_recovery') == 'reconcile'
            with path.open('a') as stream:
                stream.write(json.dumps({'kind': 'recover' if recovering else 'dispatch',
                                         'effect_id': context.operation_id}) + '\n')
            records = [json.loads(line) for line in path.read_text().splitlines()]
            if not recovering:
                raise OSError('Offline domain acknowledgement lost')
            if sum(item['kind'] == 'recover' for item in records) <= 2:
                raise OSError('Offline mutation journal temporarily unavailable')
            if scenario == 'retry-removed':
                return {'ok': True, 'target_epoch': 1, 'idempotent_replay': True,
                        'mutation': None, 'verification': None,
                        'journal': {'operation_id': context.operation_id, 'action': 'rollback',
                                    'stage': 'verified', 'expected_missing': True,
                                    'expected_checksum': '', 'observed_checksum': '',
                                    'verification_state': 'verified', 'root_mount_restored': True}}
            digest = arguments['artifact_sha256']
            metadata = {'mode': '600', 'uid': 0, 'gid': 0}
            return {'ok': True, 'target_epoch': 1,
                    'mutation': {'local_sha256': digest, 'remote_after_sha256': digest,
                                 'remote_after_metadata': metadata, 'root_mount_restored': True},
                    'verification': {'remote_sha256': digest, 'remote_metadata': metadata, 'target_epoch': 1},
                    'journal': {'operation_id': context.operation_id, 'action': 'live_patch',
                                'stage': 'verified', 'expected_checksum': digest, 'observed_checksum': digest,
                                'expected_metadata': metadata, 'root_mount_restored': True}}

        def observe_query(self, task, arguments, context):
            result = self.debug_collect(task, arguments, context)
            anchor = result['observed_at']
            result['observation_timing'] = {'started_at': anchor, 'completed_at': anchor,
                'selectors': [{'selector_id': item['id'], 'kind': item['kind'],
                               'started_at': anchor, 'completed_at': anchor, 'status': 'observed'}
                              for item in arguments.get('selectors', [])]}
            return result

    return runtime.RuntimeMcpService(Backend(), context_repository=runtime.SQLiteRuntimeRepository(state / 'cases.sqlite3'),
                                    blob_repository=runtime.FilesystemBlobRepository(state / 'blobs'), interface_profile='agent')
