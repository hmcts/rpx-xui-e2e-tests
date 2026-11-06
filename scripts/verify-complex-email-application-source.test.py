import sys
sys.dont_write_bytecode = True
import importlib.util
from pathlib import Path
import tempfile
import io
import tarfile
import zipfile
import contextlib
from unittest import mock
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

class CompilerOwnershipTests(unittest.TestCase):
    def test_actual_child_normal_terminal_is_recorded(self):
        class Child:
            pid = 42
            def poll(self): return 0
            def wait(self, timeout): return 0
        with tempfile.TemporaryDirectory() as directory:
            receipt = Path(directory) / 'terminal.json'
            with (Path(directory) / 'log').open('w') as log:
                code = binding.run_fixed_compiler(['fixed-javac'], cwd=directory, env={}, log=log, receipt=receipt, launch=lambda *a, **k: Child())
            self.assertEqual(code, 0)
            import json
            value = json.loads(receipt.read_text())
            self.assertTrue(value['observed']); self.assertFalse(value['cancelled']); self.assertFalse(value['forced'])

    def test_spawn_window_interrupt_forwards_then_waits_before_receipt(self):
        events = []
        class Child:
            pid = 43
            stopped = False
            def poll(self): return -15 if self.stopped else None
            def terminate(self): events.append('terminate'); self.stopped = True
            def wait(self, timeout): events.append('wait'); return -15
        child = Child()
        def launch(*a, **k):
            binding.signal.getsignal(binding.signal.SIGTERM)(binding.signal.SIGTERM, None)
            events.append('launch-return')
            return child
        with tempfile.TemporaryDirectory() as directory:
            receipt = Path(directory) / 'terminal.json'
            with (Path(directory) / 'log').open('w') as log:
                with self.assertRaisesRegex(ValueError, 'COMPILER_CANCELLED'):
                    binding.run_fixed_compiler(['fixed-javac'], cwd=directory, env={}, log=log, receipt=receipt, launch=launch)
            import json
            value = json.loads(receipt.read_text())
            self.assertEqual(events, ['launch-return', 'terminate', 'wait'])
            self.assertTrue(value['observed']); self.assertTrue(value['cancelled']); self.assertEqual(value['signal'], 15)
    def test_signal_during_wait_ignoring_term_is_killed_and_observed_within_parent_grace(self):
        clock = [0.0]
        events = []
        class Child:
            pid = 44
            killed = False
            signalled = False
            def poll(self): return -9 if self.killed else None
            def terminate(self): events.append('term-ignored')
            def kill(self): events.append('kill'); self.killed = True
            def wait(self, timeout):
                clock[0] += timeout
                if not self.signalled:
                    self.signalled = True
                    binding.signal.getsignal(binding.signal.SIGTERM)(binding.signal.SIGTERM, None)
                if self.killed: events.append('observed'); return -9
                raise binding.subprocess.TimeoutExpired('fixed-javac', timeout)
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(binding.time, 'monotonic', side_effect=lambda: clock[0]):
            receipt = Path(directory) / 'terminal.json'
            with (Path(directory) / 'log').open('w') as log:
                with self.assertRaisesRegex(ValueError, 'COMPILER_CANCELLED'):
                    binding.run_fixed_compiler(['fixed-javac'], cwd=directory, env={}, log=log, receipt=receipt, launch=lambda *a, **k: Child())
            import json
            value = json.loads(receipt.read_text())
            self.assertEqual(events, ['term-ignored', 'kill', 'observed'])
            self.assertLess(value['durationMs'], 8000)
            self.assertTrue(value['forced']); self.assertTrue(value['observed']); self.assertEqual(value['signal'], 9)

    def test_signal_during_handler_restoration_cannot_return_success(self):
        class Child:
            pid = 45
            def poll(self): return 0
            def wait(self, timeout): return 0
        real_signal = binding.signal.signal
        installed = []
        def install(number, handler):
            if callable(handler): installed.append(handler)
            elif installed: installed[0](number, None)
            return real_signal(number, handler)
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(binding.signal, 'signal', side_effect=install):
            with (Path(directory) / 'log').open('w') as log:
                with self.assertRaisesRegex(ValueError, 'COMPILER_CANCELLED'):
                    binding.run_fixed_compiler(['fixed-javac'], cwd=directory, env={}, log=log, receipt=Path(directory) / 'terminal.json', launch=lambda *a, **k: Child())


class DefinitionImageTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('image_binding', Path(__file__).with_name('verify-definition-image-binding.py'))
        self.image = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.image)

    def jar(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as jar: jar.writestr('META-INF/build-info.properties', 'build.commit=source\n')
        return data.getvalue()

    def layer(self, root, name, members):
        target = root / name
        with tarfile.open(target, 'w') as archive:
            for path, data, kind in members:
                entry = tarfile.TarInfo(path); entry.type = kind
                if kind == tarfile.REGTYPE: entry.size = len(data)
                if kind == tarfile.SYMTYPE: entry.linkname = 'foreign'
                archive.addfile(entry, io.BytesIO(data) if kind == tarfile.REGTYPE else None)
        return target

    def test_effective_target_matches_bytes_and_scans_later_layers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); data = self.jar()
            base = self.layer(root, 'base.tar', [(self.image.TARGET, data, tarfile.REGTYPE)])
            witness = {'imageJarDigest': binding.digest(data), 'sourceCommit': 'source'}
            self.image.extract_jar([base], root / 'good.jar', witness, binding.require, binding.digest)
            for index, bad in enumerate(['opt/app/.wh.case-definition-store-api.jar', 'opt/app/.wh..wh..opq', 'opt/.wh.app', '.wh.opt']):
                later = self.layer(root, 'later.tar', [(bad, b'', tarfile.REGTYPE)])
                with self.assertRaisesRegex(ValueError, 'IMAGE_JAR_WHITEOUT'):
                    self.image.extract_jar([base, later], root / ('bad' + str(index)), witness, binding.require, binding.digest)
            later = self.layer(root, 'link.tar', [('opt/app', b'', tarfile.SYMTYPE)])
            with self.assertRaisesRegex(ValueError, 'IMAGE_JAR_PARENT'):
                self.image.extract_jar([base, later], root / 'link.jar', witness, binding.require, binding.digest)
            later = self.layer(root, 'replacement.tar', [(self.image.TARGET, data, tarfile.REGTYPE)])
            with self.assertRaisesRegex(ValueError, 'IMAGE_JAR_TYPE'):
                self.image.extract_jar([base, later], root / 'replacement.jar', witness, binding.require, binding.digest)

    def test_wrong_missing_jar_and_build_commit_reject(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); data = self.jar()
            layer = self.layer(root, 'layer.tar', [(self.image.TARGET, data, tarfile.REGTYPE)])
            for name, witness, code in [('wrong', {'imageJarDigest': binding.digest(b'wrong'), 'sourceCommit': 'source'}, 'IMAGE_JAR_DIGEST'),
                                        ('commit', {'imageJarDigest': binding.digest(data), 'sourceCommit': 'other'}, 'IMAGE_BUILD_COMMIT')]:
                with self.assertRaisesRegex(ValueError, code): self.image.extract_jar([layer], root / name, witness, binding.require, binding.digest)
            empty = self.layer(root, 'empty.tar', [])
            with self.assertRaisesRegex(ValueError, 'IMAGE_JAR_DIGEST'):
                self.image.extract_jar([empty], root / 'missing', {'imageJarDigest': binding.digest(data)}, binding.require, binding.digest)

    def test_fixed_definition_wrapper_does_not_replace_data_pins(self):
        oci = self.image.load_oci()
        @contextlib.contextmanager
        def fake(_archive, index, manifest, **_options):
            yield {'indexDigest': index, 'manifestDigest': manifest, 'configDigest': 'sha256:7725e2475ded2180df9eaef000f8043c20a28d231cd4d41bbc3d2360bfdd61ca'}
        with mock.patch.object(oci, '_layout', side_effect=fake) as shared:
            with oci.definition_layout(Path('/fixed')) as value: self.assertEqual(value['indexDigest'], 'sha256:4c6b17b06d347d650fb8d26542716e1d723b7c8b8d44eee69908299cc8f4af52')
            with oci.layout(Path('/data')): pass
            self.assertEqual(shared.call_args_list[1].args[1:], (oci.BASE_INDEX, oci.BASE_MANIFEST))
        @contextlib.contextmanager
        def foreign(*_args, **_options): yield {'indexDigest': oci.BASE_INDEX, 'manifestDigest': oci.BASE_MANIFEST, 'configDigest': oci.BASE}
        with mock.patch.object(oci, '_layout', side_effect=foreign):
            with self.assertRaisesRegex(ValueError, 'DEFINITION_IMAGE'):
                with oci.definition_layout(Path('/wrong')): pass

    def test_launch_target_and_fixed_config_reject_before_extracting(self):
        from types import SimpleNamespace
        witness = {'imageIndexDigest': 'index', 'imagePlatformManifestDigest': 'manifest', 'imageConfigDigest': 'config'}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); archive = root / 'archive'; archive.write_bytes(b'placeholder')
            @contextlib.contextmanager
            def layout(_archive):
                yield {'indexDigest': 'index', 'manifestDigest': 'manifest', 'configDigest': 'config',
                       'config': {'config': {'WorkingDir': '/foreign', 'Entrypoint': ['/usr/bin/java', '-jar'], 'Cmd': ['case-definition-store-api.jar']}}}
            with mock.patch.object(self.image, 'load_oci', return_value=SimpleNamespace(definition_layout=layout)):
                with self.assertRaisesRegex(ValueError, 'IMAGE_LAUNCH_TARGET'):
                    self.image.bind_archive(archive, root, witness, binding.require, lambda _data: self.image.ARCHIVE_DIGEST)
            self.assertFalse((root / 'original-case-definition-store-api.jar').exists())

    def test_definition_docker_envelope_is_exact_and_not_data_authority(self):
        oci = self.image.load_oci()
        config = 'sha256:7725e2475ded2180df9eaef000f8043c20a28d231cd4d41bbc3d2360bfdd61ca'
        layers = ['sha256:' + 'a' * 64, 'sha256:' + 'b' * 64]
        manifest = {'config': {'digest': config}, 'layers': [{'digest': p} for p in layers]}
        record = [{'Config': 'blobs/sha256/' + config[7:], 'RepoTags': None, 'Layers': ['blobs/sha256/' + p[7:] for p in layers]}]
        oci.validate_definition_envelope(record, manifest)
        import copy
        for field, value, code in [('Config', 'blobs/sha256/' + 'f' * 64, 'CONFIG'),
                                   ('Layers', list(reversed(record[0]['Layers'])), 'LAYERS'),
                                   ('RepoTags', ['trusted-looking:latest'], 'FIELDS')]:
            changed = copy.deepcopy(record); changed[0][field] = value
            with self.assertRaisesRegex(ValueError, 'DEFINITION_DOCKER_' + code): oci.validate_definition_envelope(changed, manifest)
        changed = copy.deepcopy(record); changed[0]['Extra'] = 'unknown'
        with self.assertRaisesRegex(ValueError, 'DEFINITION_DOCKER_FIELDS'): oci.validate_definition_envelope(changed, manifest)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['manifest.json', 'unknown.json']:
                archive = self.layer(root, name + '.tar', [(name, b'[]', tarfile.REGTYPE)])
                with self.assertRaisesRegex(ValueError, 'LOCAL_OCI_EXTRA_ENTRY'):
                    with oci.layout(archive): pass
            unknown = root / 'unknown.json.tar'
            with self.assertRaisesRegex(ValueError, 'LOCAL_OCI_EXTRA_ENTRY'):
                with oci.definition_layout(unknown): pass

    def test_archive_mode_cannot_accept_supplied_jar_or_reuse_cached_proof(self):
        from types import SimpleNamespace
        with self.assertRaisesRegex(ValueError, 'AMBIGUOUS_IMAGE_INPUT'):
            binding.verify(SimpleNamespace(definition_archive=Path('/archive'), image_jar=Path('/good.jar')))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve(); archive = root / 'wrong.tar'; archive.write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError, 'DEFINITION_ARCHIVE_DIGEST'):
                self.image.bind_archive(archive, root, {}, binding.require, binding.digest)

unittest.main()
