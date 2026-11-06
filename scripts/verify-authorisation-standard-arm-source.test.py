import sys
sys.dont_write_bytecode = True
import importlib.util
import io
import json
from pathlib import Path
import signal
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock
import zipfile

spec = importlib.util.spec_from_file_location('auth', Path(__file__).with_name('verify-authorisation-standard-arm-source.py'))
auth = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auth)
WITNESS, HELPERS = auth.load_helpers()
role = HELPERS['verify-shared-role-standard-arm-source.py']
data = HELPERS['verify-shared-role-ccd-source.py']
compiler = HELPERS['verify-complex-email-application-source.py']


def zipped(entries):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as target:
        for name, value in entries:
            target.writestr(name, value)
    return stream.getvalue()


class SourceTests(unittest.TestCase):
    def test_fixed_original_families_and_legacy_eight_are_preserved(self):
        legacy = json.loads((auth.ROOT / 'fixtures/ccd/shared-role-standard-arm-source-witnesses.json').read_bytes())
        rows = WITNESS['consumerClasses']
        self.assertEqual(rows[:8], legacy['roleClasses'])
        self.assertEqual(len(rows), 19)
        self.assertEqual(sum(len(row['classes']) for row in rows), 20)
        self.assertEqual([Path(row['sourcePath']).stem for row in rows[8:]], [
            'AccessControlService', 'AccessControlList', 'AccessProfile', 'EventsEndpoint', 'QueryEndpoint',
            'AuthorisedGetCaseTypesOperation', 'AbstractAuthorisedCaseViewOperation',
            'AuthorisedGetCaseViewOperation', 'AuthorisedGetEventTriggerOperation', 'CaseAccessService', 'DefaultUserRepository'])
        for key in ['sourceCommit', 'sourceGitTree', 'sourceArchiveDigest', 'originalImage', 'toolchainDigests']:
            self.assertEqual(WITNESS[key], legacy[key])
        self.assertEqual(auth.FLAGS, dict(sourceComplete=False, runtimeAcceptance=False, catalogueCredit=False, releaseCredit=False))

    def test_changed_witness_or_helper_is_rejected_before_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'witness.json'
            file.write_bytes(auth.WITNESS.read_bytes() + b' ')
            with mock.patch.object(auth, 'WITNESS', file):
                with self.assertRaisesRegex(ValueError, 'WITNESS_SEAL'):
                    auth.load_helpers()
        real = auth.hash_file
        with mock.patch.object(auth, 'hash_file', side_effect=lambda p: 'wrong' if p.name == 'verify-shared-role-standard-arm-source.py' else real(p)):
            with self.assertRaisesRegex(ValueError, 'HELPER_BYTES'):
                auth.load_helpers()

    def test_original_jar_witness_contains_complete_nested_family_not_compiler_output(self):
        with tempfile.TemporaryDirectory() as directory:
            jar = Path(directory) / 'image.jar'
            jar.write_bytes(zipped([('BOOT-INF/classes/p/A.class', b'original'),
                                    ('BOOT-INF/classes/p/A$Builder.class', b'generated'),
                                    ('BOOT-INF/classes/p/Another.class', b'other')]))
            rows = data.class_witnesses(jar, [{'path': 'src/main/java/p/A.java', 'digest': 'source-pin'}])
            self.assertEqual([row['path'] for row in rows[0]['classes']], ['BOOT-INF/classes/p/A$Builder.class', 'BOOT-INF/classes/p/A.class'])
            self.assertEqual(rows[0]['classDigest'], data.digest(b'original'))
            jar.write_bytes(zipped([('BOOT-INF/classes/p/A$Builder.class', b'generated')]))
            with self.assertRaisesRegex(ValueError, 'CLASS_MISSING'):
                data.class_witnesses(jar, [{'path': 'src/main/java/p/A.java', 'digest': 'source-pin'}])

    def test_classpath_retains_actual_order_and_removes_all_target_shadows(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); cp = root / 'cp'; cp.mkdir()
            jar = root / 'image.jar'
            jar.write_bytes(zipped([
                ('BOOT-INF/classes/p/A.class', b'target'), ('BOOT-INF/classes/p/A$Inner.class', b'inner'),
                ('BOOT-INF/classes/p/Other.class', b'unchanged'),
                ('BOOT-INF/lib/z.jar', zipped([('p/A.class', b'shadow'), ('z/Z.class', b'last-name-first')])),
                ('BOOT-INF/lib/a.jar', zipped([('a/A.class', b'first-name-last')]))]))
            paths, ordered, excluded = auth.filtered_classpath(jar, cp, ['p/A'], role, auth.Cancellation())
            self.assertEqual([row['entry'] for row in ordered], ['application', 'BOOT-INF/lib/z.jar', 'BOOT-INF/lib/a.jar'])
            self.assertEqual(len(excluded), 3)
            with zipfile.ZipFile(paths[0]) as actual:
                self.assertEqual(actual.namelist(), ['p/Other.class'])
                self.assertEqual(actual.read('p/Other.class'), b'unchanged')
            role.assert_no_shadow(paths, ['p/A'])
            processor = root / 'processor.jar'; processor.write_bytes(zipped([('p/A$Inner.class', b'shadow')]))
            with self.assertRaisesRegex(ValueError, 'SHADOW_CLASS'):
                role.assert_no_shadow([processor], ['p/A'])

    def test_duplicate_archive_entry_cannot_silently_select_one_class(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); cp = root / 'cp'; cp.mkdir(); jar = root / 'image.jar'
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                jar.write_bytes(zipped([('BOOT-INF/classes/p/A.class', b'first'), ('BOOT-INF/classes/p/A.class', b'second')]))
            with self.assertRaisesRegex(ValueError, 'DUPLICATE_ZIP_ENTRY'):
                auth.filtered_classpath(jar, cp, ['p/A'], role, auth.Cancellation())

    def test_exact_output_rejects_missing_extra_changed_and_symlink_classes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); outer = root / 'A.class'; inner = root / 'A$Inner.class'
            witness = {'consumerClasses': [{'classes': [
                {'path': 'BOOT-INF/classes/A.class', 'digest': data.digest(b'outer')},
                {'path': 'BOOT-INF/classes/A$Inner.class', 'digest': data.digest(b'inner')}]}]}
            outer.write_bytes(b'outer'); inner.write_bytes(b'inner')
            self.assertEqual(len(auth.verify_classes(root, witness, role)), 2)
            for action in ['missing', 'extra', 'changed', 'symlink']:
                outer.write_bytes(b'outer')
                if inner.is_symlink() or inner.exists(): inner.unlink()
                inner.write_bytes(b'inner')
                if action == 'missing': inner.unlink()
                elif action == 'extra': (root / 'Unexpected.class').write_bytes(b'extra')
                elif action == 'changed': outer.write_bytes(b'changed')
                else: inner.unlink(); inner.symlink_to(outer)
                with self.assertRaises(ValueError): auth.verify_classes(root, witness, role)
                (root / 'Unexpected.class').unlink(missing_ok=True)

    def test_inputs_reject_precompile_and_postcompile_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory).resolve() / 'source.java'; file.write_bytes(b'original')
            expected = {str(file): data.digest(b'original')}
            captured = role.capture_inputs([file], expected)
            file.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'INPUT_CHANGED_BEFORE_COMPILATION'): role.capture_inputs([file], expected)
            with self.assertRaisesRegex(ValueError, 'INPUT_CHANGED_BEFORE_COMPILATION'):
                role.capture_inputs([row['path'] for row in captured], {row['path']: row['digest'] for row in captured})

    def test_wrong_source_archive_stops_before_output_or_compiler(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); java = root / 'java'; java.mkdir()
            for name in WITNESS['toolchainDigests']:
                if name.startswith('/'):
                    file = java / name.lstrip('/'); file.parent.mkdir(parents=True, exist_ok=True); file.write_bytes(b'not executed')
            archive, base, processor = [root / name for name in ['source.tar.gz', 'base.tar', 'lombok.jar']]
            for file in [archive, base, processor]: file.write_bytes(b'wrong')
            args = SimpleNamespace(source_archive=str(archive), base_archive=str(base), java_home=str(java), lombok_jar=str(processor), output=str(root / 'output'))
            with mock.patch.object(subprocess, 'Popen', side_effect=AssertionError('must not launch')):
                with self.assertRaisesRegex(ValueError, 'INPUT_BYTES'): auth.reproduce(args)
            self.assertFalse((root / 'output').exists())


class CompilerTests(unittest.TestCase):
    def run_compiler(self, root, launch, cancel=None):
        with (root / 'log').open('wb') as log, mock.patch.object(auth.subprocess, 'Popen', side_effect=launch):
            return auth.compile_owned(['fixed-javac'], root, root, log, root / 'terminal.json', compiler, cancel or auth.Cancellation(), 1)

    def test_actual_owned_compiler_normal_terminal_and_sanitized_environment(self):
        calls = []
        class Child:
            pid = 42
            def poll(self): return 0
            def wait(self, timeout): return 0
        def launch(command, **kwargs): calls.append((command, kwargs)); return Child()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); terminal = self.run_compiler(root, launch)
            self.assertTrue(terminal['observed']); self.assertEqual(terminal['code'], 0)
            self.assertEqual(set(calls[0][1]['env']), {'PATH', 'JAVA_HOME', 'LANG'})
            self.assertFalse(terminal['sourceComplete'])

    def test_cancel_before_launch_creates_no_compiler_or_success_receipt(self):
        cancel = auth.Cancellation(); cancel.interrupt(None, None)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, 'CANCELLED'):
                self.run_compiler(root, lambda *a, **k: self.fail('compiler launched'), cancel)
            self.assertFalse((root / 'terminal.json').exists())

    def test_cancel_during_launch_forwards_and_observes_child_before_rejection(self):
        events = []
        class Child:
            pid = 43
            stopped = False
            def poll(self): return -15 if self.stopped else None
            def terminate(self): events.append('terminate'); self.stopped = True
            def wait(self, timeout): events.append('wait'); return -15
        def launch(*args, **kwargs):
            signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)
            events.append('launch-return')
            return Child()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, 'COMPILER_CANCELLED'): self.run_compiler(root, launch)
            self.assertEqual(events, ['launch-return', 'terminate', 'wait'])
            receipt = json.loads((root / 'terminal.json').read_bytes())
            self.assertTrue(receipt['cancelled']); self.assertTrue(receipt['observed']); self.assertEqual(receipt['signal'], 15)

    def test_nonzero_or_malformed_resolved_compiler_cannot_produce_proof(self):
        for changed in [{'code': 1}, {'forced': True}, {'observed': False}, {'cancelled': True}, {'signal': 15}, {'started': False}, {'pid': True}]:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                def bad(*args, **kwargs):
                    receipt = dict(pid=42, code=0, signal=None, started=True, observed=True, cancelled=False, forced=False)
                    receipt.update(changed); kwargs['receipt'].write_text(json.dumps(receipt)); return 0
                with mock.patch.object(compiler, 'run_fixed_compiler', side_effect=bad):
                    with self.assertRaisesRegex(ValueError, 'COMPILER_TERMINAL'): self.run_compiler(root, lambda *a, **k: None)

    def test_actual_forced_and_unobserved_stop_are_never_success(self):
        for unobserved in [False, True]:
            clock = [0.0]
            events = []
            class Child:
                pid = 44
                killed = False
                def poll(self): return -9 if self.killed and not unobserved else None
                def terminate(self): events.append('terminate')
                def kill(self): events.append('kill'); self.killed = True
                def wait(self, timeout):
                    clock[0] += 1
                    if self.killed and not unobserved: return -9
                    raise subprocess.TimeoutExpired('fixed-javac', timeout)
            with tempfile.TemporaryDirectory() as directory, mock.patch.object(compiler.time, 'monotonic', side_effect=lambda: clock[0]):
                root = Path(directory)
                with self.assertRaises((ValueError, subprocess.TimeoutExpired)):
                    self.run_compiler(root, lambda *a, **k: Child())
                self.assertIn('kill', events)
                if unobserved:
                    self.assertFalse((root / 'terminal.json').exists())
                else:
                    receipt = json.loads((root / 'terminal.json').read_bytes())
                    self.assertTrue(receipt['forced']); self.assertTrue(receipt['cancelled'])

    def test_cancellation_at_handler_restoration_cannot_return_success(self):
        def restore(cancel): cancel.interrupt(None, None)
        previous = {number: signal.getsignal(number) for number in [signal.SIGINT, signal.SIGTERM]}
        try:
            with mock.patch.object(auth, 'reproduce_fixed', return_value={'status': 'not published'}), mock.patch.object(auth.Cancellation, 'restore', restore):
                with self.assertRaisesRegex(ValueError, 'CANCELLED'): auth.reproduce(None)
        finally:
            for number, handler in previous.items(): signal.signal(number, handler)


if __name__ == '__main__':
    unittest.main()
