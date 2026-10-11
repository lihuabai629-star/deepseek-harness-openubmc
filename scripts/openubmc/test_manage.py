"""Owned lifecycle actions preserve user settings and survive interrupted activation."""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("openubmc_manage", Path(__file__).with_name("manage.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def checkout(root):
    workflow = root / 'workflow'
    workflow.mkdir()
    (workflow / 'workflow.json').write_text(json.dumps({'skills': [{'name': 'openubmc-dt-testing', 'path': 'testing'}], 'profiles': {'full': ['openubmc-dt-testing']}}))
    skill = workflow / 'testing'
    (skill / 'scripts').mkdir(parents=True)
    (skill / 'references').mkdir()
    (skill / 'SKILL.md').write_text('Run $HOME/.agents/skills/openubmc-dt-testing/scripts/check.py\n')
    (skill / 'scripts/check.py').write_text('print("evidence")\n')
    (skill / 'references/guide.md').write_text('Evidence guide\n')
    for entry in ['openubmc-debug/scripts/target_runtime_mcp.py', 'openubmc-kb-mcp/src/server.js']:
        path = workflow / entry
        path.parent.mkdir(parents=True)
        path.touch()
    return workflow


class LifecycleTests(unittest.TestCase):
    def test_rollback_repair_restores_generation_interpreters_and_selector(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            home = root / 'home'
            workflow = checkout(root)
            first_selector = root / 'first.env'
            module.run('install', home, workflow, node='/node/old', python='/python/old', credentials=first_selector)
            module.run('update', home, node='/node/new', python='/python/new', credentials=root / 'second.env')
            module.run('rollback', home)
            (home / 'openubmc-managed/current/skills/openubmc-dt-testing/SKILL.md').unlink()
            module.run('repair', home)
            state = json.loads((home / 'openubmc-managed/manifest.json').read_text())
            self.assertEqual((state['node'], state['python'], state['credentials']), ('/node/old', '/python/old', str(first_selector)))
            config = json.loads((home / 'openubmc-managed/current/config.json').read_text())
            self.assertEqual(config['credentials'], str(first_selector))
            self.assertEqual(module.run('check', home)['status'], 'healthy')

    def test_repair_refuses_to_replace_rolled_back_skills_with_newer_checkout_content(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            home = root / 'home'
            workflow = checkout(root)
            module.run('install', home, workflow)
            original = (workflow / 'testing/SKILL.md').read_text()
            (workflow / 'testing/SKILL.md').write_text('newer Skill version\n')
            module.run('update', home)
            module.run('rollback', home)
            selected = (home / 'openubmc-managed/current').resolve()
            (selected / 'skills/openubmc-dt-testing/SKILL.md').unlink()
            before = (home / 'openubmc-managed/manifest.json').read_bytes()
            with self.assertRaisesRegex(ValueError, 'Selected Skill source changed'):
                module.run('repair', home)
            self.assertEqual((home / 'openubmc-managed/manifest.json').read_bytes(), before)
            (workflow / 'testing/SKILL.md').write_text(original)
            module.run('repair', home)
            self.assertEqual(module.run('check', home)['status'], 'healthy')

    def test_repair_refuses_added_skill_source_files_without_publishing_a_generation(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            home = root / 'home'
            workflow = checkout(root)
            module.run('install', home, workflow)
            selected = (home / 'openubmc-managed/current').resolve()
            (selected / 'skills/openubmc-dt-testing/SKILL.md').unlink()
            before = (home / 'openubmc-managed/manifest.json').read_bytes()
            generations = sorted((home / 'openubmc-managed/generations').iterdir())
            added = workflow / 'testing/references/added.md'
            added.write_text('Added after installation\n')
            with self.assertRaisesRegex(ValueError, 'Selected Skill source'):
                module.run('repair', home)
            self.assertEqual((home / 'openubmc-managed/manifest.json').read_bytes(), before)
            self.assertEqual(sorted((home / 'openubmc-managed/generations').iterdir()), generations)
            added.unlink()
            module.run('repair', home)
            self.assertEqual(module.run('check', home)['status'], 'healthy')

    def test_update_after_rollback_uses_the_actual_active_predecessor(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            home = root / 'home'
            workflow = checkout(root)
            first = module.run('install', home, workflow, node='/node/A')
            second = module.run('update', home, node='/node/B')
            module.run('rollback', home)
            module.run('update', home, node='/node/C')
            self.assertEqual(module.run('rollback', home)['generation'], first['generation'])
            state = json.loads((home / 'openubmc-managed/manifest.json').read_text())
            self.assertEqual(state['node'], '/node/A')
            self.assertIn(second['generation'], state['generations'])

    def test_commit_failure_restores_predecessor_history(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            home = root / 'home'
            workflow = checkout(root)
            first = module.run('install', home, workflow, node='/node/A')
            original_write = module.write_json
            count = 0
            def fail_commit_once(path, value):
                nonlocal count
                if path == home / 'openubmc-managed/manifest.json':
                    count += 1
                    if count == 2:
                        raise OSError('ownership commit interrupted')
                original_write(path, value)
            with patch.object(module, 'write_json', side_effect=fail_commit_once):
                with self.assertRaisesRegex(OSError, 'commit interrupted'):
                    module.run('update', home, node='/node/FAILED')
            self.assertEqual(module.run('check', home)['generation'], first['generation'])
            module.run('update', home, node='/node/C')
            self.assertEqual(module.run('rollback', home)['generation'], first['generation'])

    def test_activation_failures_compensate_and_keep_every_published_generation_owned(self):
        for action in ['update', 'repair']:
            with self.subTest(action=action), tempfile.TemporaryDirectory() as raw:
                root = Path(raw)
                home = root / 'home'
                workflow = checkout(root)
                first = module.run('install', home, workflow, credentials=root / 'first.env')
                if action == 'repair':
                    (home / 'openubmc-managed/current/skills/openubmc-dt-testing/SKILL.md').unlink()
                original_write = module.write_json
                profile_path = home / 'profiles/openubmc/package.json'
                before = profile_path.read_bytes()
                failed = False
                def fail_profile_once(path, value):
                    nonlocal failed
                    if path == profile_path and not failed:
                        failed = True
                        raise OSError('profile write interrupted')
                    original_write(path, value)
                with patch.object(module, 'write_json', side_effect=fail_profile_once):
                    with self.assertRaisesRegex(OSError, 'interrupted'):
                        module.run(action, home, credentials=root / 'second.env')
                self.assertEqual(profile_path.read_bytes(), before)
                state = json.loads((home / 'openubmc-managed/manifest.json').read_text())
                self.assertEqual(state['active'], first['generation'])
                self.assertEqual(state['credentials'], str(root / 'first.env'))
                self.assertEqual(state['history'], [first['generation']])
                self.assertEqual(len(state['generations']), 2)
                self.assertEqual((home / 'openubmc-managed/current').readlink().name, first['generation'])
                module.run('repair', home)
                self.assertEqual(module.run('check', home)['status'], 'healthy')
                module.run('uninstall', home)

    def test_repair_rebuilds_an_entire_missing_generation_using_owned_identity(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            home = root / 'home'
            workflow = checkout(root)
            first = module.run('install', home, workflow)
            shutil.rmtree((home / 'openubmc-managed/current').resolve())
            repaired = module.run('repair', home)
            self.assertNotEqual(repaired['generation'], first['generation'])
            self.assertEqual(module.run('check', home)['status'], 'healthy')

    def test_configured_launcher_symlink_retargeting_invalidates_qualification(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            home = root / 'home'
            workflow = checkout(root)
            launcher = workflow / 'openubmc-debug/scripts/target_runtime_mcp.py'
            launcher.unlink()
            original = root / 'original.py'
            original.write_text('original launcher\n')
            launcher.symlink_to(original)
            module.run('install', home, workflow)
            replacement = root / 'replacement.py'
            replacement.write_text('replacement launcher\n')
            launcher.unlink()
            launcher.symlink_to(replacement)
            for action in ['check', 'repair']:
                with self.assertRaisesRegex(ValueError, 'External executable changed'):
                    module.run(action, home)

    def test_foreign_native_resolver_link_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            home = root / 'home'
            workflow = checkout(root)
            module.run('install', home, workflow)
            target = home / 'openubmc-managed/current/node_modules/@deepseek-ai/dsh-experimental-openubmc-runtime'
            target.unlink()
            target.symlink_to(root / 'foreign')
            for action in ['check', 'repair', 'update', 'uninstall']:
                with self.subTest(action=action), self.assertRaisesRegex(ValueError, 'unowned native'):
                    module.run(action, home)
                self.assertEqual(target.readlink(), root / 'foreign')

    def test_exited_writer_lock_is_taken_over_but_unverified_records_are_preserved(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            home = root / 'home'
            workflow = checkout(root)
            script = "import importlib.util, os; from pathlib import Path; spec=importlib.util.spec_from_file_location('manager', " + repr(str(Path(module.__file__))) + "); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); lock=m.locked(Path(" + repr(str(home)) + ")); lock.__enter__(); os._exit(0)"
            subprocess.run([sys.executable, '-c', script], check=True)
            self.assertTrue((home / 'profiles/openubmc/package.json.lock').exists())
            module.run('install', home, workflow)
            self.assertEqual(module.run('check', home)['status'], 'healthy')
            path = home / 'profiles/openubmc/package.json.lock'
            for record in ['', '0\n', '999999999999\n', str(os.getpid()) + '\n', 'partial']:
                path.write_text(record)
                self.assertFalse(module.take_over_exited_lock(path))
                self.assertEqual(path.read_text(), record)
            path.unlink()

    def test_copies_linked_support_files_without_mutating_source(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            workflow = checkout(root)
            source = root / 'original.md'
            original = b'Run $HOME/.agents/skills/openubmc-dt-testing/scripts/check.py\n'
            source.write_bytes(original)
            (workflow / 'testing/references/linked.md').symlink_to(source)
            home = root / 'home'
            module.run('install', home, workflow)
            copied = home / 'openubmc-managed/current/skills/openubmc-dt-testing/references/linked.md'
            self.assertFalse(copied.is_symlink())
            self.assertIn('openubmc-managed/generations', copied.read_text())
            self.assertEqual(source.read_bytes(), original)

    def test_foreign_links_and_dependencies_fail_before_profile_mutation(self):
        for replacement in ['current', 'bundle-link', 'dependency']:
            for action in ['check', 'repair', 'update', 'rollback', 'uninstall']:
                with self.subTest(replacement=replacement, action=action), tempfile.TemporaryDirectory() as raw:
                    root = Path(raw)
                    workflow = checkout(root)
                    home = root / 'home'
                    module.run('install', home, workflow)
                    profile = home / 'profiles/openubmc'
                    if replacement == 'dependency':
                        manifest = json.loads((profile / 'package.json').read_text())
                        manifest['dependencies'][module.BUNDLE] = 'file:/user/other-bundle'
                        (profile / 'package.json').write_text(json.dumps(manifest))
                    else:
                        link = home / 'openubmc-managed/current' if replacement == 'current' else profile / 'node_modules' / module.BUNDLE
                        link.unlink()
                        link.symlink_to(root / 'user-directory')
                    before = (profile / 'package.json').read_bytes()
                    with self.assertRaisesRegex(ValueError, 'unowned'):
                        module.run(action, home, workflow)
                    self.assertEqual((profile / 'package.json').read_bytes(), before)

    def test_update_preserves_interpreters_accepts_selector_and_rejects_changed_external_code(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            workflow = checkout(root)
            home = root / 'home'
            module.run('install', home, workflow, node='/opt/node-test', python='/opt/python-test')
            selector = root / 'new-credentials.env'
            module.run('update', home, credentials=selector)
            state = json.loads((home / 'openubmc-managed/manifest.json').read_text())
            self.assertEqual((state['node'], state['python'], state['credentials']), ('/opt/node-test', '/opt/python-test', str(selector)))
            kb = workflow / 'openubmc-kb-mcp/src/server.js'
            kb.write_text('new external code\n')
            with self.assertRaisesRegex(ValueError, 'External executable changed'):
                module.run('check', home)
            with self.assertRaisesRegex(ValueError, 'External executable changed'):
                module.run('rollback', home)

    def test_native_profile_lock_excludes_installer(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            workflow = checkout(root)
            home = root / 'home'
            profile = home / 'profiles/openubmc'
            profile.mkdir(parents=True)
            (profile / 'package.json.lock').write_text('1\n')
            with self.assertRaisesRegex(ValueError, 'Profile writer lock'):
                module.run('install', home, workflow)
            self.assertFalse((profile / 'package.json').exists())

    def test_install_update_rollback_and_uninstall_preserve_unowned_configuration(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            workflow = checkout(root)
            home = root / 'home'
            profile = home / 'profiles/openubmc'
            profile.mkdir(parents=True)
            manifest = {'name': 'user-profile', 'type': 'module', 'dependencies': {'other-plugin': '1.0.0'}, 'dsh': {'profile': {'bundles': ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']}}, 'custom': {'model': 'user-model'}}
            (profile / 'package.json').write_text(json.dumps(manifest))
            user_patch = b'- id: user-model\n  config:\n    model: preserved\n- insert:\n    - id: user-mcp\n      name: unrelated\n'
            (profile / 'cordis.patch.yml').write_bytes(user_patch)
            selector = root / 'private.env'
            selector.write_text('PASSWORD=do-not-read\n')
            first = module.run('install', home, workflow, credentials=selector)
            state = json.loads((home / 'openubmc-managed/manifest.json').read_text())
            active = home / 'openubmc-managed/generations' / state['active']
            self.assertIn(str(active / 'skills/openubmc-dt-testing'), (active / 'skills/openubmc-dt-testing/SKILL.md').read_text())
            self.assertEqual((active / 'skills/openubmc-dt-testing/scripts/check.py').read_text(), 'print("evidence")\n')
            self.assertTrue((active / 'skills/openubmc-dt-testing/references/guide.md').exists())
            self.assertNotIn('do-not-read', ''.join(p.read_text() for p in active.rglob('*.json')))
            self.assertEqual(module.run('check', home)['status'], 'healthy')
            (workflow / 'testing/SKILL.md').write_text('Updated workflow\n')
            second = module.run('update', home, workflow)
            self.assertNotEqual(first['generation'], second['generation'])
            self.assertEqual(module.run('rollback', home)['generation'], first['generation'])
            self.assertEqual((profile / 'cordis.patch.yml').read_bytes(), user_patch)
            module.run('uninstall', home)
            self.assertEqual(json.loads((profile / 'package.json').read_text()), manifest)
            self.assertEqual((profile / 'cordis.patch.yml').read_bytes(), user_patch)
            self.assertEqual(selector.read_text(), 'PASSWORD=do-not-read\n')
            self.assertTrue(active.is_dir())

    def test_partial_owned_install_repair_and_failed_update_keep_active_content(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            workflow = checkout(root)
            home = root / 'home'
            first = module.run('install', home, workflow)
            current = home / 'openubmc-managed/current'
            current.unlink()
            (home / 'profiles/openubmc/node_modules' / module.BUNDLE).unlink()
            with self.assertRaises(ValueError):
                module.run('check', home)
            self.assertEqual(module.run('repair', home)['generation'], first['generation'])
            with patch.object(module, 'generation', side_effect=OSError('staging unavailable')):
                with self.assertRaises(OSError):
                    module.run('update', home, workflow)
            self.assertEqual(module.run('check', home)['generation'], first['generation'])
            active = current.resolve()
            (active / 'skills/openubmc-dt-testing/SKILL.md').unlink()
            repaired = module.run('repair', home)
            self.assertNotEqual(repaired['generation'], first['generation'])
            self.assertEqual(module.run('check', home)['status'], 'healthy')

    def test_refuses_unowned_replacements_and_install_without_ownership(self):
        with tempfile.TemporaryDirectory() as raw:
            root = Path(raw)
            workflow = checkout(root)
            home = root / 'home'
            module.run('install', home, workflow)
            current = home / 'openubmc-managed/current'
            current.unlink()
            current.write_text('user-owned replacement\n')
            with self.assertRaises(ValueError):
                module.run('repair', home)
            self.assertEqual(current.read_text(), 'user-owned replacement\n')
            (home / 'openubmc-managed/manifest.json').unlink()
            with self.assertRaises(ValueError):
                module.run('install', home, workflow)


if __name__ == '__main__':
    unittest.main()
