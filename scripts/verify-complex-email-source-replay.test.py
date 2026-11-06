"""Focused real-byte guards; optional retained-proof replay never compiles or writes it."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('source_replay', Path(__file__).with_name('replay-complex-email-application-source.py'))
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)
ACTUAL = None
if '--actual-request' in sys.argv:
    index = sys.argv.index('--actual-request')
    ACTUAL = json.loads(Path(sys.argv[index + 1]).read_bytes())
    del sys.argv[index:index + 2]


class ReplayGuards(unittest.TestCase):
    def test_real_class_bytes_and_exact_set_not_result_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            a, b = root / 'A.class', root / 'MapperImpl.class'
            a.write_bytes(b'class A'); b.write_bytes(b'generated mapper')
            expected = {'A.class': replay.digest(a.read_bytes()), 'MapperImpl.class': replay.digest(b.read_bytes())}
            self.assertEqual(replay.classes(root, expected)['matches'], 2)
            b.unlink()
            with self.assertRaisesRegex(ValueError, 'REPLAY_CLASS_BYTES'): replay.classes(root, expected)
            b.write_bytes(b'wrong mapper')
            with self.assertRaisesRegex(ValueError, 'REPLAY_CLASS_BYTES'): replay.classes(root, expected)
            b.write_bytes(b'generated mapper'); (root / 'Extra.class').write_bytes(b'extra')
            with self.assertRaisesRegex(ValueError, 'REPLAY_CLASS_BYTES'): replay.classes(root, expected)

    def test_real_compiler_input_change_or_missing_rejects_original_pin(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory).resolve() / 'source.java'; file.write_bytes(b'original')
            pins = [{'path': str(file), 'digest': replay.digest(file.read_bytes())}]
            replay.checked(pins); file.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'REPLAY_INPUT_DRIFT'): replay.checked(pins)
            file.unlink()
            with self.assertRaisesRegex(ValueError, 'REPLAY_PATH'): replay.checked(pins)

    def test_leaf_and_directory_aliases_reject_even_identical_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); real = root / 'real'; real.mkdir()
            (real / 'A.class').write_bytes(b'a'); alias = root / 'alias'; alias.symlink_to(real, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, 'REPLAY_PATH'): replay.classes(alias, {'A.class': replay.digest(b'a')})
            (real / 'Alias.class').symlink_to(real / 'A.class')
            with self.assertRaisesRegex(ValueError, 'REPLAY_CLASS_ALIAS'): replay.classes(real, {'A.class': replay.digest(b'a')})

    def test_compiler_terminal_is_observed_normal_not_declared_success(self):
        valid = {'started': True, 'observed': True, 'pid': 23, 'code': 0, 'signal': None, 'cancelled': False, 'forced': False}
        replay.closed(valid)
        for key, value in [('started', False), ('observed', False), ('pid', True), ('code', False), ('signal', 15), ('cancelled', True), ('forced', True)]:
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'REPLAY_COMPILER_TERMINAL'):
                replay.closed({**valid, key: value})

    def test_forged_green_result_cannot_replace_actual_class_comparison(self):
        result = {'kind': 'fixed-ccd-application-class-reproduction', 'status': 'APPLICATION_CLASS_BYTES_IDENTICAL', 'sourceFiles': 560, 'expectedClasses': 635,
                  'compilerExitCode': 0, 'inputsUnchanged': True, 'missing': [], 'extra': [], 'mismatches': [], 'matches': 635, **replay.FLAGS}
        observed = {key: result[key] for key in ['missing', 'extra', 'mismatches', 'matches']}
        replay.result_contract(result, observed)
        for key, value in [('missing', ['MapperImpl.class']), ('mismatches', ['A.class']), ('matches', 634)]:
            with self.assertRaisesRegex(ValueError, 'REPLAY_RESULT_BYTES'):
                replay.result_contract(result, {**observed, key: value})
        with self.assertRaisesRegex(ValueError, 'REPLAY_RESULT'):
            replay.result_contract({**result, 'status': 'foreign-version'}, observed)

    def test_cli_requires_caller_pin_and_redacts_untrusted_error(self):
        value = b'{"secret":"PRIVATE-CANARY"}'
        child = subprocess.run([sys.executable, '-B', str(Path(replay.__file__)), '--expected-digest', 'sha256:' + '0' * 64], input=value, capture_output=True)
        self.assertEqual(child.returncode, 2); self.assertNotIn(b'PRIVATE-CANARY', child.stdout + child.stderr)
        self.assertEqual(json.loads(child.stdout)['code'], 'COMPLEX_APPLICATION_REPLAY_REJECTED')


if ACTUAL is not None:
    class ActualRetainedProof(unittest.TestCase):
        """Runs the full production reader over retained evidence, with virtual read-only corruptions."""
        def test_full_original_then_coherently_repinned_negatives(self):
            self.assertEqual(replay.replay(ACTUAL)['applicationClasses'], 635)
            proof = ACTUAL['sourceProof']; base = Path(proof['directory'])
            original_read = Path.read_bytes
            original_file = Path.is_file
            pre = json.loads((base / 'class-proof/preexecution.json').read_bytes())
            selected = next((base / 'class-proof/classes').rglob('*.class'))
            # Removing one real output is invisible to the old receipt/count-only checks.
            with mock.patch.object(Path, 'is_file', lambda p: False if p == selected else original_file(p)):
                with self.assertRaises(ValueError): replay.replay(ACTUAL)
            source = Path(pre['actualCompiledInputs'][-1]['path'])
            with mock.patch.object(Path, 'read_bytes', lambda p: b'changed source' if p == source else original_read(p)):
                with self.assertRaisesRegex(ValueError, 'REPLAY_INPUT_DRIFT'): replay.replay(ACTUAL)
            # Refreshing both declared compiler input and held receipt pins does not change the sealed source oracle.
            changed_pre = copy.deepcopy(pre); changed_pre['actualCompiledInputs'][-1]['digest'] = replay.digest(b'changed source')
            self._repinned(pre=changed_pre, extra={source: b'changed source'}, code='REPLAY_COMPILED_INPUTS')
            forged = json.loads((base / 'class-proof/result.json').read_bytes()); forged['matches'] = 634
            self._repinned(result=forged, code='REPLAY_RESULT_BYTES')
            foreign = copy.deepcopy(pre); foreign['sourceCommit'] = '0' * 40
            self._repinned(pre=foreign, code='REPLAY_SOURCE_IDENTITY')
            version = base / 'class-proof/compiler-version.log'
            with mock.patch.object(Path, 'read_text', lambda p, *a, **k: 'javac 22' if p == version else original_read(p).decode()):
                with self.assertRaisesRegex(ValueError, 'REPLAY_COMPILER_VERSION'): replay.replay(ACTUAL)

        def _repinned(self, *, pre=None, result=None, extra=None, code):
            request = copy.deepcopy(ACTUAL); proof = request['sourceProof']; base = Path(proof['directory'])
            replacements = dict(extra or {}); original = Path.read_bytes
            association = json.loads((base / 'definition-image-binding.json').read_bytes())
            for name, value, field in [('class-proof/preexecution.json', pre, 'classProofPreexecutionDigest'), ('class-proof/result.json', result, 'classProofResultDigest')]:
                if value is not None:
                    raw = json.dumps(value).encode(); replacements[base / name] = raw
                    proof['files'][name] = replay.digest(raw); association[field] = replay.digest(raw)
            raw = json.dumps(association).encode(); replacements[base / 'definition-image-binding.json'] = raw
            proof['files']['definition-image-binding.json'] = replay.digest(raw)
            # Receipt pins remain coherent; the fixed semantic replay must still reject.
            self.assertEqual(association['status'], 'APPLICATION_CLASS_BYTES_IDENTICAL')
            for name, pin in proof['files'].items():
                self.assertEqual(replay.digest(replacements.get(base / name, original(base / name))), pin)
            with mock.patch.object(Path, 'read_bytes', lambda p: replacements[p] if p in replacements else original(p)):
                with self.assertRaisesRegex(ValueError, code): replay.replay(request)


if __name__ == '__main__':
    unittest.main()
