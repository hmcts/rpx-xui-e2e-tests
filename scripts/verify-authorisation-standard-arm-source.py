#!/usr/bin/env python3
"""Fresh fixed Auth consumer classes; no runtime, row or catalogue admission."""
import argparse
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import zipfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
WITNESS = ROOT / 'fixtures/ccd/authorisation-standard-arm-source-witnesses.json'
SEAL = 'sha256:57b181ddb848d02b50d0d4c9232401b179ea145bb17bfaffeb7dc3a9e7384b22'
FLAGS = {'sourceComplete': False, 'runtimeAcceptance': False, 'catalogueCredit': False, 'releaseCredit': False}
RECIPE = ['-J-Xmx1G', '-J-XX:ActiveProcessorCount=2', '-g', '-parameters', '-encoding', 'UTF-8', '--release', '21', '-implicit:none']


def require(value, code):
    if not value:
        raise ValueError('AUTH_SOURCE_' + code)


def hash_file(file):
    import hashlib
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return 'sha256:' + h.hexdigest()


def load_helpers():
    require(WITNESS.is_file() and not WITNESS.is_symlink() and hash_file(WITNESS) == SEAL, 'WITNESS_SEAL')
    witness = json.loads(WITNESS.read_bytes())
    modules = {}
    for relative, expected in witness['helperDigests'].items():
        file = ROOT.parent / relative
        require(file.is_file() and file.resolve() == file and hash_file(file) == expected, 'HELPER_BYTES')
        spec = importlib.util.spec_from_file_location(file.stem, file)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        modules[file.name] = module
    return witness, modules


class Cancellation:
    def __init__(self):
        self.cancelled = False
        self.previous = {}

    def interrupt(self, _number, _frame):
        self.cancelled = True

    def install(self):
        for number in [signal.SIGINT, signal.SIGTERM]:
            self.previous[number] = signal.signal(number, self.interrupt)

    def restore(self):
        for number, previous in self.previous.items():
            signal.signal(number, previous)

    def check(self):
        require(not self.cancelled, 'CANCELLED')


def filtered_classpath(jar, output, families, role, cancel):
    """Retain the original dependency order, excluding every selected family."""
    ordered, excluded, paths = [], [], []

    def filtered(archive, destination, label, prefix=''):
        cancel.check()
        entries = archive.infolist()
        require(len({entry.filename for entry in entries}) == len(entries), 'DUPLICATE_ZIP_ENTRY')
        with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_STORED) as target:
            for entry in entries:
                cancel.check()
                if entry.is_dir() or not entry.filename.startswith(prefix):
                    continue
                name = entry.filename[len(prefix):]
                if role.role_class_target(name, families):
                    excluded.append({'container': label, 'entry': entry.filename})
                    continue
                target.writestr(zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)), archive.read(entry))
        destination.chmod(0o400)
        paths.append(destination)
        ordered.append({'entry': label, 'digest': hash_file(destination)})

    with zipfile.ZipFile(jar) as archive:
        filtered(archive, output / 'application.zip', 'application', 'BOOT-INF/classes/')
        for index, entry in enumerate(e for e in archive.infolist()
                                      if e.filename.startswith('BOOT-INF/lib/') and e.filename.endswith('.jar')):
            with zipfile.ZipFile(io.BytesIO(archive.read(entry))) as nested:
                filtered(nested, output / (str(index) + '.zip'), entry.filename)
    role.assert_no_shadow(paths, families)
    return paths, ordered, excluded


def verify_classes(directory, witness, role):
    expected = {item['path'].removeprefix('BOOT-INF/classes/'): item['digest']
                for row in witness['consumerClasses'] for item in row['classes']}
    require(expected, 'EMPTY_CLASS_INVENTORY')
    actual = {str(file.relative_to(directory)): hash_file(role.canonical(file))
              for file in directory.rglob('*.class')}
    require(actual == expected, 'CLASS_BYTES_OR_INVENTORY')
    return actual


def compile_owned(command, source, java, log, receipt, compiler, cancel, timeout):
    cancel.check()
    code = compiler.run_fixed_compiler(command, cwd=source,
        env={'PATH': str(java / 'bin') + ':/usr/bin:/bin', 'JAVA_HOME': str(java), 'LANG': 'en_US.UTF-8'},
        log=log, receipt=receipt, timeout=timeout, launch=subprocess.Popen)
    cancel.check()
    terminal = json.loads(receipt.read_bytes())
    require(code == 0 and terminal.get('code') == 0 and terminal.get('signal') is None
            and terminal.get('started') is True and terminal.get('observed') is True
            and terminal.get('cancelled') is False and terminal.get('forced') is False
            and type(terminal.get('pid')) is int and terminal['pid'] > 0, 'COMPILER_TERMINAL')
    return terminal


def reproduce(args):
    cancel = Cancellation()
    cancel.install()
    started = time.monotonic()
    try:
        result = reproduce_fixed(args, cancel, started)
    finally:
        cancel.restore()
    cancel.check()
    return result


def reproduce_fixed(args, cancel, started):
    cancel.check()
    witness, modules = load_helpers()
    role = modules['verify-shared-role-standard-arm-source.py']
    data = modules['verify-shared-role-ccd-source.py']
    oci = modules['verify-local-ccd-oci.py']
    compiler = modules['verify-complex-email-application-source.py']
    legacy_file = role.canonical(ROOT / 'fixtures/ccd/shared-role-standard-arm-source-witnesses.json')
    require(hash_file(legacy_file) == role.SEAL, 'ROLE_WITNESS_UNCHANGED')
    legacy = json.loads(legacy_file.read_bytes())
    rows = witness['consumerClasses']
    require(len(rows) == 19 and rows[:8] == legacy['roleClasses']
            and len({row['sourcePath'] for row in rows}) == 19, 'FIXED_FAMILY_INVENTORY')
    for key in ['sourceCommit', 'sourceGitTree', 'sourceArchiveDigest', 'originalImage', 'toolchainDigests', 'processorConfigurationDigest']:
        require(witness[key] == legacy[key], 'ORIGINAL_ROLE_INPUTS')
    archive, base = role.canonical(args.source_archive), role.canonical(args.base_archive)
    java, processor = role.canonical(args.java_home, True), role.canonical(args.lombok_jar)
    verified = {str(WITNESS): SEAL, str(legacy_file): role.SEAL,
                str(archive): witness['sourceArchiveDigest'], str(base): witness['originalImage']['archiveDigest']}
    tools = [(java / key.lstrip('/'), value) for key, value in witness['toolchainDigests'].items() if key.startswith('/')]
    tools.append((processor, witness['toolchainDigests']['lombok-1.18.46.jar']))
    verified.update({str(ROOT.parent / name): value for name, value in witness['helperDigests'].items()})
    for file, expected in tools:
        verified[str(role.canonical(file))] = expected
    # Verify all external bytes before creating output or invoking any compiler.
    for file, expected in verified.items():
        cancel.check()
        require(hash_file(role.canonical(file)) == expected, 'INPUT_BYTES')
    files = data.read_source_archive(archive)
    require(data.git_tree(files) == witness['sourceGitTree'], 'SOURCE_TREE')
    for row in rows:
        require(data.digest(files[row['sourcePath']][0]) == row['sourceDigest'], 'SOURCE_BYTES')
    cancel.check()
    out = Path(args.output)
    require(not os.path.lexists(out), 'FRESH_OUTPUT')
    compiler.prepare_output(out, [ROOT.parent, archive, base, java, processor])
    jar = out / 'original-core-case-data.jar'
    with oci.layout(base) as layout:
        cancel.check()
        data.extract_original_jar(layout['expanded'], jar)
        image = {'imageId': layout['indexDigest'], 'manifestDigest': layout['manifestDigest'],
                 'configDigest': layout['configDigest'], 'archiveDigest': layout['archiveDigest'],
                 'jarDigest': hash_file(jar), 'sourceBuildCommit': witness['sourceCommit'],
                 'platform': 'linux/arm64', 'rootfsDiffIds': layout['config']['rootfs']['diff_ids']}
        require(image == witness['originalImage'], 'ORIGINAL_IMAGE')
    cancel.check()
    refs = [{'path': row['sourcePath'], 'digest': row['sourceDigest']} for row in rows]
    require(data.class_witnesses(jar, refs) == rows, 'ORIGINAL_CLASSES')
    verified[str(jar)] = image['jarDigest']
    source, cp, classes, empty = [out / name for name in ['source', 'classpath', 'classes', 'empty-sourcepath']]
    for directory in [source, cp, classes, empty]:
        directory.mkdir(mode=0o700)
    families = [row['sourcePath'].removeprefix('src/main/java/').removesuffix('.java') for row in rows]
    classpath, ordered, excluded = filtered_classpath(jar, cp, families, role, cancel)
    role.assert_no_shadow([processor], families)
    verified.update({str(file): entry['digest'] for file, entry in zip(classpath, ordered)})
    processor_config = source / 'lombok.config'
    processor_config.write_bytes(b'config.stopBubbling = true\n')
    verified[str(processor_config)] = witness['processorConfigurationDigest']
    sources = []
    for row in rows:
        file = source / row['sourcePath']
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(files[row['sourcePath']][0])
        file.chmod(0o400)
        sources.append(file)
        verified[str(file)] = row['sourceDigest']
    pins = role.capture_inputs([*verified, role.canonical(__file__)], verified)
    command = ['/usr/bin/nice', '-n', '10', str(java / 'bin/javac'), *RECIPE,
               '-sourcepath', str(empty), '-classpath', os.pathsep.join(map(str, classpath)),
               '-processorpath', str(processor), '-d', str(classes), *map(str, sources)]
    compiler.save(out / 'preexecution.json', {'kind': 'fixed-authorisation-consumer-preexecution',
        'witnessDigest': SEAL, 'inputs': pins, 'command': command, 'orderedClasspath': ordered,
        'shadowExclusions': excluded, **FLAGS})
    remaining = min(120, 180 - (time.monotonic() - started))
    require(remaining > 0, 'PREPARATION_DEADLINE')
    with (out / 'javac.log').open('xb') as log:
        os.fchmod(log.fileno(), 0o600)
        terminal = compile_owned(command, source, java, log, out / 'compiler-shutdown.json', compiler, cancel, remaining)
    cancel.check()
    actual = verify_classes(classes, witness, role)
    role.capture_inputs([row['path'] for row in pins], {row['path']: row['digest'] for row in pins})
    cancel.check()
    result = {'schemaVersion': 1, 'kind': 'reproduced-authorisation-standard-arm-consumers',
        'boundary': 'nineteen-selected-source-families; original-standard-ARM-JAR-bytes; no-whole-image-or-runtime-claim',
        'obligationId': witness['obligationId'], 'witnessDigest': SEAL,
        'sourceCommit': witness['sourceCommit'], 'sourceGitTree': witness['sourceGitTree'],
        'sourceArchiveDigest': witness['sourceArchiveDigest'], 'originalImage': image,
        'consumerClasses': rows, 'toolchainDigests': witness['toolchainDigests'],
        'compilerRecipe': RECIPE, 'processorConfigurationDigest': witness['processorConfigurationDigest'],
        'orderedClasspath': ordered, 'inputManifestDigest': data.digest(json.dumps(pins, separators=(',', ':')).encode()),
        'compilerTerminal': terminal, 'compilerReceiptDigest': hash_file(out / 'compiler-shutdown.json'),
        'reproducedClassCount': len(actual), 'inputsUnchanged': True,
        'durationMs': round((time.monotonic() - started) * 1000), **FLAGS}
    return result


if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    for option in ['source-archive', 'base-archive', 'java-home', 'lombok-jar', 'output']:
        parser.add_argument('--' + option, required=True)
    try:
        args = parser.parse_args()
        proof = reproduce(args)
        # A signal after reproduction still has Python's normal terminating effect.
        with (Path(args.output) / 'source-image-binding.json').open('x') as target:
            os.fchmod(target.fileno(), 0o600)
            json.dump(proof, target, indent=2)
            target.write('\n')
        print(json.dumps({'status': 'AUTH_SOURCE_CLASSES_REPRODUCED', **FLAGS}))
    except Exception:
        print(json.dumps({'status': 'rejected', 'code': 'AUTH_SOURCE_REPRODUCTION_FAILED', **FLAGS}))
        raise SystemExit(2)
