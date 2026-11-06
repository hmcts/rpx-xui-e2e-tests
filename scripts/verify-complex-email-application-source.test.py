import sys
sys.dont_write_bytecode = True
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('binding', Path(__file__).with_name('verify-complex-email-application-source.py'))
binding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(binding)

class ApplicationSourceTests(unittest.TestCase):
    def test_exact_class_set_rejects_zero_missing_extra_and_changed_generated_class(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, 'EMPTY_EXPECTED'):
                binding.compare_output(root, {})
            expected = {'Mapper.class': binding.digest(b'interface'), 'MapperImpl.class': binding.digest(b'generated')}
            self.assertEqual(len(binding.compare_output(root, expected)['missing']), 2)
            (root / 'Mapper.class').write_bytes(b'interface')
            (root / 'MapperImpl.class').write_bytes(b'generated')
            self.assertEqual(binding.compare_output(root, expected)['matches'], 2)
            (root / 'MapperImpl.class').write_bytes(b'changed')
            self.assertEqual(len(binding.compare_output(root, expected)['mismatches']), 1)
            (root / 'Unexpected.class').write_bytes(b'extra')
            self.assertEqual(binding.compare_output(root, expected)['extra'], ['Unexpected.class'])

    def test_actual_input_rejects_missing_changed_and_symlink_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); source = root / 'Source.java'; library = root / 'classpath.zip'
            source.write_bytes(b'source'); library.write_bytes(b'jar')
            pins = [{'path': str(p), 'digest': binding.digest(p.read_bytes())} for p in [source, library]]
            binding.check_inputs(pins)
            source.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'INPUT_DRIFT'): binding.check_inputs(pins)
            source.write_bytes(b'source'); library.unlink()
            with self.assertRaisesRegex(ValueError, 'INPUT_REQUIRED'): binding.check_inputs(pins)
            library.symlink_to(source)
            with self.assertRaisesRegex(ValueError, 'INPUT_REQUIRED'): binding.check_inputs(pins)

    def test_full_class_inventory_rejects_missing_extra_shadow_even_matching_bytes(self):
        expected = {'p/A.class': 'app'}
        binding.check_class_inventory({'app': {'p/A.class'}, 'dependency': {'q/B.class'}}, expected, ['app'])
        for actual in [{'app': set()}, {'app': {'p/A.class', 'other/Unexpected.class'}}, {'app': {'p/A.class'}, 'dependency': {'p/A.class'}}, {'app': {'p/A.class'}, 'unlisted': {'uk/gov/hmcts/ccd/definition/store/Other.class'}}]:
            with self.assertRaises(ValueError): binding.check_class_inventory(actual, expected, ['app'])

    def test_output_cannot_modify_harness_or_readonly_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); source = root / 'immutable'; source.mkdir()
            with self.assertRaisesRegex(ValueError, 'OUTPUT_OVERLAP'): binding.prepare_output(source / 'inside', [source])
            fresh = root / 'fresh'; binding.prepare_output(fresh, [source])
            with self.assertRaisesRegex(ValueError, 'FRESH_OUTPUT'): binding.prepare_output(fresh, [source])

    def test_wrong_source_image_and_tool_digests_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['source.tar.gz', 'image.jar', 'javac']:
                p = root / name; p.write_bytes(b'wrong')
                with self.assertRaisesRegex(ValueError, 'INPUT_DRIFT'):
                    binding.check_inputs([{'path': str(p), 'digest': binding.digest(b'expected')}])

unittest.main()
