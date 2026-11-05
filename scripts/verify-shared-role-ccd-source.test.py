import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('binding', Path(__file__).with_name('verify-shared-role-ccd-source.py'))
binding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(binding)


class SourceBindingTests(unittest.TestCase):
    def archive(self, entries):
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        target = Path(root.name) / 'source.tar.gz'
        with tarfile.open(target, 'w:gz') as archive:
            for name, body, mode in entries:
                info = tarfile.TarInfo('source/' + name)
                info.size, info.mode = len(body), mode
                archive.addfile(info, io.BytesIO(body))
        return target

    def test_git_tree_uses_content_and_executable_mode(self):
        # git hash-object and git mktree for:100644 blob containing "hello\n" as file.txt.
        source = self.archive([('file.txt', b'hello\n', 0o664)])
        files = binding.read_source_archive(source)
        self.assertEqual(binding.git_tree(files), '4cf9f177c4c015836fca6a31f9c3917e89ae29ec')
        changed = self.archive([('file.txt', b'hello\n', 0o775)])
        self.assertNotEqual(binding.git_tree(binding.read_source_archive(changed)), binding.git_tree(files))

    def test_source_rejects_traversal_and_duplicates(self):
        for entries in [[('../outside', b'no', 0o644)], [('a', b'one', 0o644), ('a', b'two', 0o644)]]:
            with self.assertRaises(ValueError):
                binding.read_source_archive(self.archive(entries))

    def test_source_rejects_symlink_and_parent_collision(self):
        with tempfile.TemporaryDirectory() as root:
            file = Path(root) / 'symlink.tar.gz'
            with tarfile.open(file, 'w:gz') as archive:
                member = tarfile.TarInfo('source/link')
                member.type, member.linkname = tarfile.SYMTYPE, '../../outside'
                archive.addfile(member)
            with self.assertRaisesRegex(ValueError, 'ARCHIVE_ENTRY_TYPE'):
                binding.read_source_archive(file)
        files = binding.read_source_archive(self.archive([('a', b'file', 0o644), ('a/b', b'child', 0o644)]))
        with self.assertRaisesRegex(ValueError, 'ARCHIVE_PARENT_COLLISION'):
            binding.git_tree(files)

    def test_inventory_rejects_missing_extra_or_changed_source(self):
        files = binding.read_source_archive(self.archive([('a', b'one', 0o644)]))
        inventory = [{'path':'a','kind':'file','mode':0o644,'digest':'sha256:'+hashlib.sha256(b'one').hexdigest()}]
        binding.assert_inventory(files, inventory)
        for altered in [[], inventory + inventory, [{**inventory[0], 'digest':'sha256:'+'0'*64}]]:
            with self.assertRaises(ValueError):
                binding.assert_inventory(files, altered)

    def test_class_witness_rejects_missing_or_altered_class(self):
        with tempfile.TemporaryDirectory() as root:
            jar = Path(root) / 'test.jar'
            name = 'BOOT-INF/classes/example/Policy.class'
            with zipfile.ZipFile(jar, 'w') as archive:
                archive.writestr(name, b'compiled')
            refs = [{'path':'src/main/java/example/Policy.java','digest':'sha256:'+'1'*64}]
            self.assertEqual(binding.class_witnesses(jar, refs)[0]['classDigest'], 'sha256:'+hashlib.sha256(b'compiled').hexdigest())
            with self.assertRaises(ValueError):
                binding.class_witnesses(jar, [{'path':'src/main/java/example/Missing.java','digest':'sha256:'+'1'*64}])

    def test_original_jar_rejects_whiteout_link_parent_and_wrong_bytes(self):
        for name, kind in [('opt/app/.wh.core-case-data.jar', tarfile.REGTYPE), ('opt/app', tarfile.SYMTYPE), ('opt/app/core-case-data.jar', tarfile.SYMTYPE), ('opt/app/core-case-data.jar', tarfile.REGTYPE)]:
            with tempfile.TemporaryDirectory() as root:
                layer = Path(root) / 'layer.tar'
                with tarfile.open(layer, 'w') as archive:
                    entry = tarfile.TarInfo(name)
                    entry.type = kind
                    if kind == tarfile.SYMTYPE:
                        entry.linkname = '/outside'
                        archive.addfile(entry)
                    else:
                        entry.size = 5
                        archive.addfile(entry, io.BytesIO(b'wrong'))
                with self.assertRaises(ValueError):
                    binding.extract_original_jar([layer], Path(root) / 'jar')


if __name__ == '__main__':
    unittest.main()
