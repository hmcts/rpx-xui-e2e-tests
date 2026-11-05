#!/usr/bin/env python3
"""Reproduce the one reviewed CCD correction and bind its role consumers to OCI bytes.

No Docker, runtime startup, network dependency resolution or catalogue credit.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tarfile
import zipfile
import shutil

COMMIT = '5c5ff0b941dcbc7e661e8aa9e38dc51d7c30ffb3'
TREE = '5b4b765f015949e62fc2f4fb9fa61ff8fdbb1300'
ARCHIVE = 'sha256:1ee713ac9a171a705304078d344b89a59605312237d0ea0a6078e1f30d6d3944'
IMAGE = 'sha256:0ec6bc39e2ba42645931c4f01f74beb84ff678770ea9c709b8c08cf1eb8c6ff4'
ORIGINAL_JAR = 'sha256:1c3afe85796f549b29c14378f22ba9b3069488d04ad93b42983d8a6e79db06fc'
SOURCE_SEAL = 'sha256:bfe447916878b8c73a33d0e8dd58224d16664a1a197ae2b1c80d82ce08e7aaf8'
MAX_SOURCE = 64 * 1024 * 1024


def require(value, code):
    if not value:
        raise ValueError('SHARED_CCD_' + code)


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def regular(file):
    file = Path(file)
    require(file.is_file() and not file.is_symlink() and file.resolve() == file, 'REGULAR_FILE_REQUIRED')
    return file


def read_source_archive(file):
    files, total, prefix = {}, 0, None
    with tarfile.open(file, 'r:gz') as archive:
        for member in archive:
            parts = member.name.split('/')
            require(parts[0] and all(part not in ('.', '..') for part in parts), 'ARCHIVE_PATH')
            prefix = prefix or parts[0]
            require(parts[0] == prefix and not member.name.startswith('/'), 'ARCHIVE_ROOT')
            if member.isdir():
                continue
            require(member.isfile() and len(parts) > 1 and all(parts), 'ARCHIVE_ENTRY_TYPE')
            name = '/'.join(parts[1:])
            require(name not in files and name != '.git' and not name.startswith('.git/'), 'ARCHIVE_DUPLICATE_OR_GIT')
            total += member.size
            require(0 <= member.size <= 8 * 1024 * 1024 and total <= MAX_SOURCE and len(files) < 5000, 'ARCHIVE_SIZE')
            data = archive.extractfile(member).read()
            require(len(data) == member.size, 'ARCHIVE_SHORT_ENTRY')
            files[name] = (data, member.mode & 0o777)
    require(files, 'ARCHIVE_EMPTY')
    return files


def git_tree(files):
    root = {}
    for name, value in files.items():
        *parents, leaf = name.split('/')
        target = root
        for part in parents:
            target = target.setdefault(part, {})
            require(isinstance(target, dict), 'ARCHIVE_PARENT_COLLISION')
        require(leaf not in target, 'ARCHIVE_PARENT_COLLISION')
        target[leaf] = value

    def object_hash(kind, data):
        return hashlib.sha1(kind + b' ' + str(len(data)).encode() + b'\0' + data).digest()

    def tree(node):
        result = b''
        for name in sorted(node, key=lambda key: (key + ('/' if isinstance(node[key], dict) else '')).encode()):
            child = node[name]
            if isinstance(child, dict):
                mode, hashed = b'40000', tree(child)
            else:
                mode = b'100755' if child[1] & 0o111 else b'100644'
                hashed = object_hash(b'blob', child[0])
            result += mode + b' ' + name.encode() + b'\0' + hashed
        return object_hash(b'tree', result)
    return tree(root).hex()


def assert_inventory(files, inventory):
    require(isinstance(inventory, list) and len(inventory) == len(files), 'INVENTORY_SELECTION')
    require(len({item['path'] for item in inventory}) == len(inventory), 'INVENTORY_DUPLICATE')
    for item in inventory:
        require(set(item) == {'path', 'kind', 'mode', 'digest'} and item['kind'] == 'file', 'INVENTORY_SCHEMA')
        require(item['path'] in files, 'INVENTORY_PATH')
        content, mode = files[item['path']]
        require(mode == item['mode'] and digest(content) == item['digest'], 'INVENTORY_CHANGED')


def class_witnesses(jar, references):
    result = []
    with zipfile.ZipFile(jar) as archive:
        names = archive.namelist()
        require(len(set(names)) == len(names), 'JAR_DUPLICATE')
        for reference in references:
            source = reference['path']
            require(source.startswith('src/main/java/') and source.endswith('.java'), 'CLASS_SOURCE_PATH')
            prefix = 'BOOT-INF/classes/' + source[len('src/main/java/'):-len('.java')]
            outer = prefix + '.class'
            require(outer in names, 'CLASS_MISSING')
            selected = sorted(name for name in names if name == outer or (name.startswith(prefix + '$') and name.endswith('.class')))
            for name in selected:
                info = archive.getinfo(name)
                require(0 < info.file_size <= 1024 * 1024, 'CLASS_SIZE')
            result.append({'sourcePath': source, 'sourceDigest': reference['digest'], 'classDigest': digest(archive.read(outer)), 'classes': [{'path': name, 'digest': digest(archive.read(name))} for name in selected]})
    return result


def run(command, cwd, env, log, timeout=180):
    with open(log, 'xb') as output:
        os.chmod(log, 0o600)
        process = subprocess.run(command, cwd=cwd, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=timeout, check=False)
    require(process.returncode == 0, 'BUILD_PROCESS_FAILED')


def extract_original_jar(layers, output):
    """Resolve only the fixed JAR path; reject ambiguous parents/whiteouts/links."""
    seen_jar = False
    for layer in layers:
        seen = set()
        with tarfile.open(layer, 'r:') as archive:
            for entry in archive:
                name = entry.name.removeprefix('./').rstrip('/')
                require(name not in {'.wh.opt', 'opt/.wh.app', 'opt/app/.wh.core-case-data.jar', '.wh..wh..opq', 'opt/.wh..wh..opq', 'opt/app/.wh..wh..opq'}, 'BASE_JAR_WHITEOUT')
                if name in ['opt', 'opt/app']:
                    require(entry.isdir(), 'BASE_JAR_PARENT')
                if name != 'opt/app/core-case-data.jar':
                    continue
                require(name not in seen and entry.isfile() and not entry.pax_headers, 'BASE_JAR_TYPE')
                require(0 < entry.size < 256 * 1024 * 1024, 'BASE_JAR_SIZE')
                seen.add(name)
                with archive.extractfile(entry) as source, open(output, 'wb') as target:
                    os.chmod(output, 0o600)
                    shutil.copyfileobj(source, target, 1024 * 1024)
                require(output.stat().st_size == entry.size, 'BASE_JAR_SIZE')
                seen_jar = True
    require(seen_jar and digest(output.read_bytes()) == ORIGINAL_JAR, 'BASE_JAR_DIGEST')
    with zipfile.ZipFile(output) as archive:
        properties = archive.read('META-INF/build-info.properties').decode('utf8').splitlines()
    commits = [line.split('=', 1)[1] for line in properties if line.startswith('build.commit=')]
    require(commits == [COMMIT], 'BASE_BUILD_COMMIT')


def reproduce(args):
    script_root = Path(__file__).resolve().parent
    module = importlib.util.spec_from_file_location('oci', script_root / 'verify-local-ccd-oci.py')
    oci = importlib.util.module_from_spec(module)
    module.loader.exec_module(oci)
    artifact = Path(args.artifact_root).resolve()
    provenance_digest = oci.verify_artifact(artifact)
    source_archive = regular(Path(args.source_archive).resolve())
    require(digest(source_archive.read_bytes()) == ARCHIVE, 'ARCHIVE_SEAL')
    files = read_source_archive(source_archive)
    require(git_tree(files) == TREE, 'SOURCE_GIT_TREE')
    source_refs = json.loads((script_root / 'fixtures/ccd/shared-policy-sources.json').read_bytes())
    require(digest(json.dumps(source_refs, separators=(',', ':'), ensure_ascii=False).encode()) == SOURCE_SEAL, 'ROLE_SOURCE_SEAL')
    refs = [item for item in source_refs['sourceReferences'] if item['repository'] == 'hmcts/ccd-data-store-api']
    require(len(refs) == 6 and all(ref['revision'] == COMMIT and digest(files[ref['path']][0]) == ref['digest'] for ref in refs), 'ROLE_SOURCE_MISMATCH')
    output = Path(args.output)
    require(output.is_absolute() and not output.exists(), 'FRESH_OUTPUT_REQUIRED')
    output.mkdir(mode=0o700)
    # Gradle embeds project.name in the JAR manifest. Preserve the reviewed build's basename.
    source = output / 'exui-ccd-search-id-fix'
    source.mkdir(mode=0o700)
    for name, (data, mode) in files.items():
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(mode)
    java = Path(args.java_home).resolve()
    env = {'PATH': str(java / 'bin') + ':/usr/bin:/bin', 'JAVA_HOME': str(java), 'GRADLE_USER_HOME': str(Path(args.gradle_home).resolve()), 'LANG': 'en_US.UTF-8'}
    java_version = subprocess.run([str(java / 'bin/java'), '-version'], env=env, capture_output=True, text=True, check=True).stderr
    javac_version = subprocess.run([str(java / 'bin/javac'), '-version'], env=env, capture_output=True, text=True, check=True).stdout.strip()
    require('Temurin-21.0.12+8' in java_version and javac_version == 'javac 21.0.12', 'TOOLCHAIN_VERSION')
    run(['/usr/bin/git', 'apply', '--check', str(artifact / 'correction.patch')], source, env, output / 'patch-check.log')
    run(['/usr/bin/git', 'apply', str(artifact / 'correction.patch')], source, env, output / 'patch-apply.log')
    # git apply replaces edited files with umask-derived modes. Recreate the
    # archive's reviewed modes before comparing the complete corrected inventory.
    for name, (_, mode) in files.items():
        (source / name).chmod(mode)
    corrected = {name: ((source / name).read_bytes(), stat.S_IMODE((source / name).stat().st_mode)) for name in files}
    inventory = json.loads((artifact / 'source-inventory.json').read_bytes())
    assert_inventory(corrected, inventory)
    require(all(digest(corrected[ref['path']][0]) == ref['digest'] for ref in refs), 'ROLE_SOURCE_PATCHED')
    run([str(source / 'gradlew'), 'bootJar', '--offline', '--no-daemon', '--no-build-cache', '--rerun-tasks'], source, env, output / 'offline-build.log')
    jar = regular(source / 'build/libs/core-case-data.jar')
    require(digest(jar.read_bytes()) == oci.JAR, 'REBUILT_JAR_MISMATCH')
    witnesses = class_witnesses(jar, refs)
    require(witnesses == class_witnesses(artifact / 'core-case-data.jar', refs), 'REBUILT_CLASS_MISMATCH')
    # Recheck immutable inputs after the process. A prior successful receipt is insufficient.
    require(digest(source_archive.read_bytes()) == ARCHIVE and oci.verify_artifact(artifact) == provenance_digest, 'INPUT_CHANGED')
    assert_inventory({name: ((source / name).read_bytes(), stat.S_IMODE((source / name).stat().st_mode)) for name in files}, inventory)
    with oci.layout(args.base_archive) as base:
        require(base['indexDigest'] == oci.BASE_INDEX and base['manifestDigest'] == oci.BASE_MANIFEST and base['configDigest'] == oci.BASE, 'BASE_IMAGE')
        original_jar = output / 'original-core-case-data.jar'
        extract_original_jar(base['expanded'], original_jar)
        require(class_witnesses(original_jar, refs) == witnesses, 'BASE_ROLE_CLASS_MISMATCH')
        original = {'imageId': oci.BASE_INDEX, 'manifestDigest': base['manifestDigest'], 'configDigest': base['configDigest'], 'archiveDigest': base['archiveDigest'], 'jarDigest': ORIGINAL_JAR, 'sourceBuildCommit': COMMIT, 'platform': 'linux/arm64', 'rootfsDiffIds': base['config']['rootfs']['diff_ids']}
        with oci.layout(args.derived_archive) as derived:
            verified = oci.verify_derivative(base, derived)
    require(verified['manifestDigest'] == IMAGE and verified['jarDigest'] == oci.JAR, 'DERIVED_IMAGE')
    return {'schemaVersion': 1, 'kind': 'reproduced-shared-role-ccd-source-image', 'boundary': 'six-reviewed-role-consumer-classes; corrected-JAR-reproduced; original-JAR-not-rebuilt', 'sourceCommit': COMMIT, 'sourceGitTree': TREE, 'sourceArchiveDigest': ARCHIVE, 'correctedSourceInventoryDigest': oci.SOURCE, 'patchDigest': oci.PATCH, 'rebuiltJarDigest': oci.JAR, 'artifactProvenanceDigest': provenance_digest, 'roleClasses': witnesses, 'originalImage': original, 'image': {key: verified[key] for key in ['platform', 'archiveDigest', 'manifestDigest', 'configDigest', 'rootfsDiffIds']}, 'toolchain': {'javaVersion': 'Temurin-21.0.12+8', 'javacVersion': javac_version, 'javaExecutableDigest': digest(regular(java / 'bin/java').read_bytes()), 'javacExecutableDigest': digest(regular(java / 'bin/javac').read_bytes()), 'gradleWrapperDigest': digest((source / 'gradle/wrapper/gradle-wrapper.jar').read_bytes())}, 'buildLogDigest': digest((output / 'offline-build.log').read_bytes()), 'runtimeAcceptance': False, 'catalogueCredit': False, 'releaseCredit': False}


def main():
    parser = argparse.ArgumentParser()
    for name in ['source-archive', 'artifact-root', 'base-archive', 'derived-archive', 'java-home', 'gradle-home', 'output']:
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    result = reproduce(args)
    target = Path(args.output) / 'source-image-binding.json'
    with open(target, 'x') as file:
        os.chmod(target, 0o600)
        json.dump(result, file, indent=2)
        file.write('\n')
    print(json.dumps({'status': 'SOURCE_IMAGE_VERIFIED', 'imageManifestDigest': result['image']['manifestDigest'], 'roleSourceWitnesses': len(result['roleClasses']), 'runtimeAcceptance': False, 'catalogueCredit': False}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, TypeError, subprocess.SubprocessError, tarfile.TarError, zipfile.BadZipFile) as error:
        # Build/process errors can include private paths or environment; never echo them.
        allowed = {'SHARED_CCD_' + code for code in ['REGULAR_FILE_REQUIRED', 'ARCHIVE_PATH', 'ARCHIVE_ROOT', 'ARCHIVE_ENTRY_TYPE', 'ARCHIVE_DUPLICATE_OR_GIT', 'ARCHIVE_SIZE', 'ARCHIVE_SHORT_ENTRY', 'ARCHIVE_EMPTY', 'ARCHIVE_PARENT_COLLISION', 'INVENTORY_SELECTION', 'INVENTORY_DUPLICATE', 'INVENTORY_SCHEMA', 'INVENTORY_PATH', 'INVENTORY_CHANGED', 'JAR_DUPLICATE', 'CLASS_SOURCE_PATH', 'CLASS_MISSING', 'CLASS_SIZE', 'BUILD_PROCESS_FAILED', 'ARCHIVE_SEAL', 'SOURCE_GIT_TREE', 'ROLE_SOURCE_SEAL', 'ROLE_SOURCE_MISMATCH', 'FRESH_OUTPUT_REQUIRED', 'TOOLCHAIN_VERSION', 'ROLE_SOURCE_PATCHED', 'REBUILT_JAR_MISMATCH', 'REBUILT_CLASS_MISMATCH', 'INPUT_CHANGED', 'BASE_IMAGE', 'DERIVED_IMAGE', 'BASE_JAR_WHITEOUT', 'BASE_JAR_PARENT', 'BASE_JAR_TYPE', 'BASE_JAR_SIZE', 'BASE_JAR_DIGEST', 'BASE_BUILD_COMMIT', 'BASE_ROLE_CLASS_MISMATCH']}
        code = str(error) if isinstance(error, ValueError) and str(error) in allowed else 'SHARED_CCD_PROVENANCE_FAILED'
        print(json.dumps({'status': 'BLOCKED', 'code': code, 'catalogueCredit': False}))
        raise SystemExit(2)
