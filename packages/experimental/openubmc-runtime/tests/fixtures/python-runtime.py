"""Real Runtime storage and workflow with an offline external domain backend."""
import os
from pathlib import Path
import sys


def _load_runtime_module():
    sys.path.insert(0, str(Path(os.environ['DSH_OPENUBMC_WORKFLOW']) / 'openubmc-target-runtime'))
    import openubmc_target_runtime
    return openubmc_target_runtime


def create_service():
    runtime = _load_runtime_module()
    state = Path(os.environ['DSH_RECOVERY_STATE'])
    marker = state / 'attempts.txt'

    class Backend:
        def open_task(self, task_id):
            return task_id

        def close_task(self, task):
            pass

        def task_status(self, task):
            return {'task_id': task}

        def maintain_task(self, task):
            return 0

        def debug_run(self, task, arguments, context):
            context.raise_if_stopped()
            return {'ok': True, 'summary': 'offline diagnosis', 'target_epoch': 1, 'profile': arguments.get('profile', 'freshness')}

        def debug_collect(self, task, arguments, context):
            result = self.debug_run(task, arguments, context)
            if os.environ.get('DSH_RUNTIME_SCENARIO') == 'phases-complete' and marker.exists():
                result['target_epoch'] = 2
            return result

        def upgrade_run(self, task, arguments, context):
            context.raise_if_stopped()
            prior = marker.exists() or os.environ.get('DSH_RUNTIME_SCENARIO') in ('phases', 'phases-complete')
            with marker.open('a') as output:
                output.write('reconciled\n' if prior else 'interrupted\n')
            if not prior:
                raise OSError('offline upload connection lost')
            return {'ok': True, 'summary': 'offline journal reconciled', 'journal': {'stage': 'verified'}, 'target_epoch': 2}

    return runtime.RuntimeMcpService(Backend(), context_repository=runtime.SQLiteRuntimeRepository(state / 'cases.sqlite3'),
                                    blob_repository=runtime.FilesystemBlobRepository(state / 'blobs'))
