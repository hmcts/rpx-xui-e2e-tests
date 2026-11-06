"""Fixed standard ARM definition image association; no runtime or Harness credit."""
import importlib.util
import os
from pathlib import Path
import shutil
import tarfile
import zipfile

ARCHIVE_DIGEST = 'sha256:4343d615ca395974e5651e7eae06296e4a19ce161c40d5b4ba18bf242eb24eb4'
TARGET = 'opt/app/case-definition-store-api.jar'


def load_oci():
    spec = importlib.util.spec_from_file_location('definition_oci', Path(__file__).with_name('verify-local-ccd-oci.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def extract_jar(layers, output, witness, require, digest):
    found = False
    forbidden = {'.wh.opt', '.wh..wh..opq', 'opt/.wh.app', 'opt/.wh..wh..opq',
                 'opt/app/.wh.case-definition-store-api.jar', 'opt/app/.wh..wh..opq'}
    for layer in layers:
        with tarfile.open(layer, 'r:') as archive:
            seen = set()
            for entry in archive:
                name = entry.name.removeprefix('./').rstrip('/')
                require(not name.startswith('/') and '..' not in name.split('/') and '\\' not in name, 'IMAGE_LAYER_PATH')
                require(name not in forbidden, 'IMAGE_JAR_WHITEOUT')
                if name in ['opt', 'opt/app']:
                    require(entry.isdir() and not entry.pax_headers, 'IMAGE_JAR_PARENT')
                if name != TARGET:
                    continue
                require(not found and name not in seen and entry.isfile() and not entry.pax_headers, 'IMAGE_JAR_TYPE')
                require(0 < entry.size < 256 * 1024 * 1024, 'IMAGE_JAR_SIZE')
                seen.add(name)
                with archive.extractfile(entry) as source, output.open('xb') as target:
                    os.fchmod(target.fileno(), 0o600)
                    shutil.copyfileobj(source, target, 1024 * 1024)
                require(output.stat().st_size == entry.size, 'IMAGE_JAR_SIZE')
                found = True
    require(found and digest(output.read_bytes()) == witness['imageJarDigest'], 'IMAGE_JAR_DIGEST')
    with zipfile.ZipFile(output) as jar:
        require(len(set(jar.namelist())) == len(jar.namelist()), 'IMAGE_JAR_DUPLICATE')
        commits = [line.split('=', 1)[1] for line in jar.read('META-INF/build-info.properties').decode().splitlines() if line.startswith('build.commit=')]
        require(commits == [witness['sourceCommit']], 'IMAGE_BUILD_COMMIT')


def bind_archive(archive, output, witness, require, digest):
    require(archive.is_absolute() and archive.resolve() == archive and archive.is_file() and not archive.is_symlink(), 'DEFINITION_ARCHIVE_REQUIRED')
    require(digest(archive.read_bytes()) == ARCHIVE_DIGEST, 'DEFINITION_ARCHIVE_DIGEST')
    oci = load_oci()
    jar = output / 'original-case-definition-store-api.jar'
    with oci.definition_layout(archive) as layout:
        config = layout['config']['config']
        require(config.get('WorkingDir') == '/opt/app' and config.get('Entrypoint') == ['/usr/bin/java', '-jar']
                and config.get('Cmd') == ['case-definition-store-api.jar'], 'IMAGE_LAUNCH_TARGET')
        require(layout['indexDigest'] == witness['imageIndexDigest'] and layout['manifestDigest'] == witness['imagePlatformManifestDigest']
                and layout['configDigest'] == witness['imageConfigDigest'], 'IMAGE_WITNESS')
        extract_jar(layout['expanded'], jar, witness, require, digest)
        binding = {'kind': 'fixed-standard-arm-definition-image-jar-association', 'platform': 'linux/arm64',
                   'archiveDigest': layout['archiveDigest'], 'imageIndexDigest': layout['indexDigest'],
                   'platformManifestDigest': layout['manifestDigest'], 'configDigest': layout['configDigest'],
                   'rootfsDiffIds': layout['config']['rootfs']['diff_ids'], 'launchTarget': '/' + TARGET,
                   'jarDigest': digest(jar.read_bytes()), 'sourceCommit': witness['sourceCommit']}
    require(digest(archive.read_bytes()) == ARCHIVE_DIGEST, 'DEFINITION_ARCHIVE_DRIFT')
    return jar, binding
