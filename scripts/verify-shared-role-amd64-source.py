#!/usr/bin/env python3
"""Rebuild reviewed CCD role classes and compare them with the pinned AMD64 image."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import zipfile

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parent
WITNESS = ROOT / 'fixtures/ccd/shared-role-amd64-source-witnesses.json'
SOURCE = ROOT / 'verify-shared-role-ccd-source.py'
IMAGE = 'hmctsprod.azurecr.io/ccd/data-store-api@sha256:6614f22b00ce82e4cb74f9829cbb80cc1bd4e02da01e480e6428c940d6419a96'


def require(condition, code):
    if not condition:
        raise ValueError('SHARED_AMD64_' + code)


def run(args, *, cwd=None, env=None, output=None, timeout=300):
    result = subprocess.run(args, cwd=cwd, env=env, stdout=output or subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=timeout, check=False)
    require(result.returncode == 0, 'PROCESS_FAILED')
    return result.stdout


def verify(source_archive, java_home, gradle_home, output):
    require(output.is_absolute() and not output.exists() and output.parent.is_dir(), 'FRESH_OUTPUT_REQUIRED')
    require(source_archive.is_file() and not source_archive.is_symlink(), 'SOURCE_ARCHIVE_REQUIRED')
    witness_bytes = WITNESS.read_bytes()
    require(hashlib.sha256(witness_bytes).hexdigest() ==
            '784705c40eb24ed456efac2127c3062b4124da44e157ec50c208a1c629dbc5e0',
            'WITNESS_SEAL')
    witness = json.loads(witness_bytes)
    pins = json.loads((ROOT / 'fixtures/ccd/linux-amd64-images.json').read_bytes())['data']
    require(witness['schemaVersion'] == 1 and pins['reference'] == IMAGE and
            pins['manifestDigest'] == witness['imageManifestDigest'] and
            pins['configDigest'] == witness['imageConfigDigest'] and
            pins['platform'] == 'linux/amd64', 'PIN_MISMATCH')
    spec = importlib.util.spec_from_file_location('ccd_source', SOURCE)
    source = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(source)
    require(source.digest(source_archive.read_bytes()) == witness['sourceArchiveDigest'], 'ARCHIVE_DIGEST')
    files = source.read_source_archive(source_archive)
    require(source.git_tree(files) == witness['sourceGitTree'], 'SOURCE_TREE')
    refs = [{'path': row['sourcePath'], 'digest': row['sourceDigest']} for row in witness['roleClasses']]
    require(len(refs) == 6 and len({row['path'] for row in refs}) == 6 and
            all(row['path'] in files and source.digest(files[row['path']][0]) == row['digest'] for row in refs),
            'SOURCE_CLASSES')
    image = json.loads(run(['docker', 'image', 'inspect', IMAGE]))
    require(len(image) == 1 and image[0]['Id'] == witness['imageManifestDigest'] and
            image[0]['Architecture'] == 'amd64' and IMAGE in image[0]['RepoDigests'], 'IMAGE_IDENTITY')
    require(java_home.is_dir() and gradle_home.is_dir(), 'TOOLCHAIN_REQUIRED')
    output.mkdir(mode=0o700)
    build = output / 'source'
    build.mkdir(mode=0o700)
    for name, (data, mode) in files.items():
        target = build / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(mode)
    env = {'PATH': str(java_home / 'bin') + ':/usr/bin:/bin', 'JAVA_HOME': str(java_home),
           'GRADLE_USER_HOME': str(gradle_home), 'LANG': 'en_US.UTF-8'}
    require(b'21.0.12' in run([str(java_home / 'bin/java'), '-version'], env=env), 'JAVA_VERSION')
    with (output / 'compile.log').open('xb') as log:
        os.fchmod(log.fileno(), 0o600)
        run([str(build / 'gradlew'), 'compileJava', '--offline', '--no-daemon', '--no-build-cache',
             '--rerun-tasks'], cwd=build, env=env, output=log, timeout=600)
    container = None
    try:
        container = run(['docker', 'create', '--platform', 'linux/amd64', IMAGE]).decode().strip().splitlines()[-1]
        require(len(container) == 64 and all(char in '0123456789abcdef' for char in container), 'CONTAINER_ID')
        jar = output / 'image-core-case-data.jar'
        run(['docker', 'cp', container + ':/opt/app/core-case-data.jar', str(jar)])
    finally:
        if container:
            subprocess.run(['docker', 'rm', '-f', container], stdout=subprocess.DEVNULL,
                           stderr=subprocess.DEVNULL, check=False)
    require(source.digest(jar.read_bytes()) == witness['jarDigest'], 'IMAGE_JAR')
    with zipfile.ZipFile(jar) as archive:
        build_info = archive.read('META-INF/build-info.properties').decode().splitlines()
    require('build.commit=' + witness['sourceCommit'] in build_info, 'IMAGE_BUILD_COMMIT')
    image_classes = source.class_witnesses(jar, refs)
    require(image_classes == witness['roleClasses'], 'IMAGE_CLASSES')
    for row in image_classes:
        for item in row['classes']:
            compiled = build / 'build/classes/java/main' / item['path'].removeprefix('BOOT-INF/classes/')
            require(compiled.is_file() and source.digest(compiled.read_bytes()) == item['digest'],
                    'REBUILT_CLASS_MISMATCH')
    require(source.digest(source_archive.read_bytes()) == witness['sourceArchiveDigest'], 'INPUT_CHANGED')
    proof = {'schemaVersion': 1, 'kind': 'reproduced-shared-role-amd64-source-image',
             'sourceCommit': witness['sourceCommit'], 'sourceGitTree': witness['sourceGitTree'],
             'sourceArchiveDigest': witness['sourceArchiveDigest'],
             'imageManifestDigest': witness['imageManifestDigest'], 'jarDigest': witness['jarDigest'],
             'roleClasses': image_classes, 'runtimeAcceptance': False, 'catalogueCredit': False,
             'releaseCredit': False}
    (output / 'source-image-binding.json').write_text(json.dumps(proof, indent=2) + '\n')
    return proof


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ['source-archive', 'java-home', 'gradle-home', 'output']:
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    try:
        proof = verify(args.source_archive, args.java_home, args.gradle_home, args.output)
        print(json.dumps({'status': 'SOURCE_IMAGE_VERIFIED', 'imageManifestDigest': proof['imageManifestDigest'],
                          'roleSourceWitnesses': len(proof['roleClasses']), 'catalogueCredit': False}))
    except (ValueError, OSError, KeyError, TypeError, IndexError, zipfile.BadZipFile,
            subprocess.SubprocessError) as error:
        code = str(error) if isinstance(error, ValueError) and str(error).startswith('SHARED_AMD64_') else 'SHARED_AMD64_EVIDENCE_REJECTED'
        print(json.dumps({'status': 'BLOCKED', 'code': code, 'catalogueCredit': False}))
        sys.exit(2)
