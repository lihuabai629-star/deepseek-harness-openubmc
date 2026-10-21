"""Real Agent gateway, durable Runtime storage and an offline device backend."""
import os
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
            return {'ok': True, 'observed_at': datetime.now(timezone.utc).isoformat(),
                    'result': {'capabilities': {'ssh_transport': True, 'mdbctl': True, 'busctl': False},
                               'lanes': {'ssh': {}}}}

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
