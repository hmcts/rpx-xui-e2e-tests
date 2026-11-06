#!/usr/bin/env python3
"""Fresh selected-class reproduction for the original fixed ARM64 DATA-store image."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import zipfile
import io

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
SEAL = 'sha256:bbe1e619ef013131c33c2e3cdf974e623c01e07037b7a81303622859d845433c'
LEGACY_SEAL = 'sha256:4ae153dfdced674ae3b79478515cdd306035c8bea587152d727d1476f72a3851'
RECIPE = ['-J-Xmx1G', '-J-XX:ActiveProcessorCount=2', '-g', '-parameters', '-encoding', 'UTF-8', '--release', '21', '-implicit:none']


def require(value, code):
    if not value:
        raise ValueError('STANDARD_ROLE_' + code)


def digest(value):
    return 'sha256:' + hashlib.sha256(value).hexdigest()


def hash_file(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return 'sha256:' + h.hexdigest()


def canonical(raw, directory=False):
    p = Path(raw)
    require(p.is_absolute() and str(p) == os.path.normpath(str(p)) and p.resolve() == p and not p.is_symlink(), 'INPUT_ALIAS')
    require(p.is_dir() if directory else p.is_file(), 'INPUT_TYPE')
    return p


def helper(name):
    file = canonical(ROOT / name)
    specification = importlib.util.spec_from_file_location(name.replace('-', '_'), file)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


def role_class_target(name, families):
    return any(name == f + '.class' or name.endswith('/' + f + '.class')
               or ((name.startswith(f + '$') or '/' + f + '$' in name) and name.endswith('.class')) for f in families)


def assert_no_shadow(artifacts, families):
    for file in artifacts:
        with zipfile.ZipFile(canonical(file)) as archive:
            require(not any(role_class_target(name, families) for name in archive.namelist()), 'SHADOW_CLASS')


def capture_inputs(paths, verified):
    inputs = []
    for raw in paths:
        file = canonical(raw)
        actual = hash_file(file)
        require(str(file) not in verified or actual == verified[str(file)], 'INPUT_CHANGED_BEFORE_COMPILATION')
        inputs.append({'path': str(file), 'digest': actual})
    return inputs


def reproduce(args):
    deadline = time.monotonic() + 180
    witness_path = canonical(ROOT / 'fixtures/ccd/shared-role-standard-arm-source-witnesses.json')
    require(hash_file(witness_path) == SEAL, 'WITNESS_SEAL')
    witness = json.loads(witness_path.read_bytes())
    legacy_path = canonical(ROOT / 'fixtures/ccd/shared-role-ccd-class-witnesses.json')
    require(hash_file(legacy_path) == LEGACY_SEAL, 'LEGACY_WITNESS_SEAL')
    legacy = json.loads(legacy_path.read_bytes())
    require(witness['roleClasses'][:6] == legacy['roleClasses'] and len(witness['roleClasses']) == 8, 'LEGACY_SUBSET')
    verified = {str(witness_path): SEAL, str(legacy_path): LEGACY_SEAL}
    archive, base = canonical(args.source_archive), canonical(args.base_archive)
    java, processor = canonical(args.java_home, True), canonical(args.lombok_jar)
    out = Path(args.output)
    require(out.is_absolute() and str(out) == os.path.normpath(str(out)) and out.parent.resolve() == out.parent and not os.path.lexists(out), 'FRESH_OUTPUT')
    require(not out.is_relative_to(java) and not java.is_relative_to(out), 'OUTPUT_OVERLAP')
    require(hash_file(archive) == witness['sourceArchiveDigest'], 'SOURCE_ARCHIVE')
    require(hash_file(base) == witness['originalImage']['archiveDigest'], 'OCI_ARCHIVE')
    verified.update({str(archive): witness['sourceArchiveDigest'], str(base): witness['originalImage']['archiveDigest']})
    tools = [(java / key.lstrip('/'), value) for key, value in witness['toolchainDigests'].items() if key.startswith('/')]
    tools += [(processor, witness['toolchainDigests']['lombok-1.18.46.jar'])]
    for p, expected in tools:
        require(hash_file(canonical(p)) == expected, 'TOOLCHAIN')
        verified[str(p)] = expected
    data = helper('verify-shared-role-ccd-source.py')
    oci = helper('verify-local-ccd-oci.py')
    files = data.read_source_archive(archive)
    require(data.git_tree(files) == witness['sourceGitTree'], 'SOURCE_TREE')
    for row in witness['roleClasses']:
        require(digest(files[row['sourcePath']][0]) == row['sourceDigest'], 'SOURCE_BYTES')
    out.mkdir(mode=0o700)
    jar = out / 'original-core-case-data.jar'
    with oci.layout(base) as layout:
        data.extract_original_jar(layout['expanded'], jar)
        image = {'imageId': layout['indexDigest'], 'manifestDigest': layout['manifestDigest'], 'configDigest': layout['configDigest'],
                 'archiveDigest': layout['archiveDigest'], 'jarDigest': hash_file(jar), 'sourceBuildCommit': witness['sourceCommit'],
                 'platform': 'linux/arm64', 'rootfsDiffIds': layout['config']['rootfs']['diff_ids']}
        require(image == witness['originalImage'], 'ORIGINAL_IMAGE')
    refs = [{'path': r['sourcePath'], 'digest': r['sourceDigest']} for r in witness['roleClasses']]
    require(data.class_witnesses(jar, refs) == witness['roleClasses'], 'ORIGINAL_CLASSES')
    verified[str(jar)] = witness['originalImage']['jarDigest']
    source, cp, classes, empty = [out / n for n in ['source', 'classpath', 'classes', 'empty-sourcepath']]
    for p in [source, cp, classes, empty]:
        p.mkdir(mode=0o700)
    family = [r['sourcePath'].removeprefix('src/main/java/').removesuffix('.java') for r in witness['roleClasses']]

    def target(name):
        return role_class_target(name, family)

    excluded, ordered = [], []

    def filtered(entries, read, destination, prefix='', label='application'):
        names = [e.filename for e in entries]
        require(len(names) == len(set(names)), 'DUPLICATE_ZIP_ENTRY')
        with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_STORED) as output:
            for e in entries:
                if e.is_dir() or not e.filename.startswith(prefix):
                    continue
                name = e.filename[len(prefix):]
                if target(name):
                    excluded.append({'container': label, 'entry': e.filename})
                    continue
                output.writestr(zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)), read(e))
        ordered.append({'entry': label, 'digest': hash_file(destination)})
        verified[str(destination)] = ordered[-1]['digest']

    with zipfile.ZipFile(jar) as z:
        filtered(z.infolist(), z.read, cp / 'application.zip', 'BOOT-INF/classes/')
        for i, e in enumerate(x for x in z.infolist() if x.filename.startswith('BOOT-INF/lib/') and x.filename.endswith('.jar')):
            with zipfile.ZipFile(io.BytesIO(z.read(e))) as lib:
                filtered(lib.infolist(), lib.read, cp / (str(i) + '.zip'), label=e.filename)
    classpath = [cp / 'application.zip'] + [cp / (str(i) + '.zip') for i in range(len(ordered) - 1)]
    assert_no_shadow([*classpath, processor], family)
    processor_config = source / "lombok.config"
    processor_config.write_bytes(b"config.stopBubbling = true\n")
    require(hash_file(processor_config) == witness["processorConfigurationDigest"], "PROCESSOR_CONFIGURATION")
    verified[str(processor_config)] = witness['processorConfigurationDigest']
    sources = []
    for row in witness['roleClasses']:
        p = source / row['sourcePath']
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(files[row['sourcePath']][0])
        p.chmod(0o400)
        sources.append(p)
        verified[str(p)] = row['sourceDigest']
    input_paths = [archive, base, jar, witness_path, legacy_path, canonical(__file__), ROOT / 'verify-shared-role-ccd-source.py', ROOT / 'verify-local-ccd-oci.py',
                   *(p for p, _ in tools), processor_config, *classpath, *sources]
    inputs = capture_inputs(input_paths, verified)
    command = ['/usr/bin/nice', '-n', '10', str(java / 'bin/javac'), *RECIPE, '-sourcepath', str(empty), '-classpath', os.pathsep.join(map(str, classpath)),
               '-processorpath', str(processor), '-d', str(classes), *map(str, sources)]
    (out / 'preexecution.json').write_text(json.dumps({'inputs': inputs, 'command': command, 'orderedClasspath': ordered, 'shadowExclusions': excluded}, indent=2) + '\n')
    remaining = min(120, deadline - time.monotonic())
    require(remaining > 0, 'PREPARATION_DEADLINE')
    with (out / 'javac.log').open('xb') as log:
        terminal = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=remaining, check=False,
                                  env={key: os.environ[key] for key in ['PATH', 'HOME', 'TMPDIR'] if key in os.environ})
    require(terminal.returncode == 0, 'COMPILER_FAILED')
    expected = {c['path'].removeprefix('BOOT-INF/classes/'): c['digest'] for r in witness['roleClasses'] for c in r['classes']}
    actual = {str(p.relative_to(classes)): hash_file(canonical(p)) for p in classes.rglob('*.class')}
    require(actual == expected, 'CLASS_BYTES_OR_INVENTORY')
    require(all(hash_file(canonical(p['path'])) == p['digest'] for p in inputs), 'INPUT_CHANGED')
    return {'schemaVersion': 1, 'kind': 'reproduced-standard-arm-role-source-image',
            'boundary': 'eight-reviewed-role-consumer-classes; original-standard-ARM-JAR-bytes; no-whole-image-claim',
            'sourceCommit': witness['sourceCommit'], 'sourceGitTree': witness['sourceGitTree'], 'sourceArchiveDigest': witness['sourceArchiveDigest'],
            'originalImage': image, 'roleClasses': witness['roleClasses'], 'toolchainDigests': witness['toolchainDigests'], 'compilerRecipe': RECIPE,
            'processorConfigurationDigest': witness['processorConfigurationDigest'], 'orderedClasspath': ordered, 'inputManifestDigest': digest(json.dumps(inputs, separators=(',', ':')).encode()),
            'compilerExitCode': terminal.returncode, 'inputsUnchanged': True, 'sourceComplete': False,
            'runtimeAcceptance': False, 'catalogueCredit': False, 'releaseCredit': False}


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    for name in ['source-archive', 'base-archive', 'java-home', 'lombok-jar', 'output']:
        parser.add_argument('--' + name, required=True)
    try:
        args = parser.parse_args()
        proof = reproduce(args)
        (Path(args.output) / 'source-image-binding.json').write_text(json.dumps(proof, indent=2) + '\n')
        print(json.dumps({'status': 'STANDARD_ROLE_SOURCE_IMAGE_VERIFIED', 'runtimeAcceptance': False, 'catalogueCredit': False}))
    except Exception:
        print(json.dumps({'status': 'rejected', 'code': 'STANDARD_ROLE_REPRODUCTION_FAILED'}))
        raise SystemExit(2)
