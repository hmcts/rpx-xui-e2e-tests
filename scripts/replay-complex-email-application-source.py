#!/usr/bin/env python3
"""Read-only publication replay of the single sealed definition application proof."""
import argparse
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import sys
import tarfile
import zipfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


binding = load('application_replay_binding', ROOT / 'verify-complex-email-application-source.py')
require, digest, FLAGS = binding.require, binding.digest, binding.FLAGS
FILES = ['definition-image-binding.json', 'image-inputs.json', 'class-proof/preexecution.json',
         'class-proof/result.json', 'class-proof/compiler-shutdown.json', 'class-proof/compiler-version-shutdown.json']
ARCHIVE_DIGEST = 'sha256:4343d615ca395974e5651e7eae06296e4a19ce161c40d5b4ba18bf242eb24eb4'


def canonical(value, directory=False):
    file = Path(value)
    require(file.is_absolute() and str(file) == os.path.normpath(str(file)) and file.resolve() == file
            and not file.is_symlink() and (file.is_dir() if directory else file.is_file()), 'REPLAY_PATH')
    return file


def checked(pins):
    require(len({row['path'] for row in pins}) == len(pins), 'REPLAY_DUPLICATE_INPUT')
    for row in pins:
        file = canonical(row['path'])
        require(digest(file.read_bytes()) == row['digest'], 'REPLAY_INPUT_DRIFT')


def closed(terminal):
    require({'started', 'observed', 'pid', 'code', 'signal', 'cancelled', 'forced'} <= set(terminal)
            and terminal.get('started') is True and terminal.get('observed') is True
            and type(terminal.get('pid')) is int and terminal['pid'] > 0
            and type(terminal.get('code')) is int and terminal['code'] == 0 and terminal.get('signal') is None
            and terminal.get('cancelled') is False and terminal.get('forced') is False, 'REPLAY_COMPILER_TERMINAL')


def classes(root, expected):
    canonical(str(root), directory=True)
    # Reject directory aliases as well as leaf symlinks, including extra non-class links.
    for folder, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            require(not (Path(folder) / name).is_symlink(), 'REPLAY_CLASS_ALIAS')
    result = binding.compare_output(root, expected)
    require(not any(result[k] for k in ['missing', 'extra', 'mismatches'])
            and result['matches'] == len(expected), 'REPLAY_CLASS_BYTES')
    return result


def result_contract(result, observed):
    require(result.get('kind') == 'fixed-ccd-application-class-reproduction', 'REPLAY_RESULT_KIND')
    require(result.get('status') == 'APPLICATION_CLASS_BYTES_IDENTICAL' and result.get('sourceFiles') == 560
            and result.get('expectedClasses') == 635 and type(result.get('compilerExitCode')) is int and result['compilerExitCode'] == 0
            and result.get('inputsUnchanged') is True, 'REPLAY_RESULT')
    require(all(result.get(key) == observed[key] for key in ['missing', 'extra', 'mismatches', 'matches']), 'REPLAY_RESULT_BYTES')
    require(all(result.get(key) is False for key in FLAGS), 'REPLAY_CREDIT')


def replay(request):
    require(type(request.get('schemaVersion')) is int and request['schemaVersion'] == 1, 'REPLAY_SCHEMA')
    proof = request['sourceProof']
    directory = canonical(proof['directory'], directory=True)
    producer = canonical(request['producerRoot'], directory=True)
    producer_files = dict(request['producerFiles'])
    closed(proof['terminal'])
    require(request['sourcePreparation'] == {key: proof[key] for key in ['prepared', 'tools']}, 'REPLAY_PREPARATION')
    require(directory.name == 'source-proof' and directory.stat().st_uid == os.getuid() and directory.stat().st_mode & 0o077 == 0, 'REPLAY_PROOF_DIRECTORY')
    require(set(proof['files']) == set(FILES), 'REPLAY_RECEIPT_SET')
    receipt_pins = [{'path': str(directory / name), 'digest': proof['files'][name]} for name in FILES]
    checked(receipt_pins)
    read = lambda name: json.loads(canonical(str(directory / name)).read_bytes())
    pre, result, association = [read(name) for name in ['class-proof/preexecution.json', 'class-proof/result.json', 'definition-image-binding.json']]
    image_inputs = read('image-inputs.json')
    for name in ['class-proof/compiler-shutdown.json', 'class-proof/compiler-version-shutdown.json']:
        terminal = read(name); closed(terminal)
        require(all(terminal.get(key) is False for key in FLAGS), 'REPLAY_CREDIT')
    require(digest(binding.WITNESS.read_bytes()) == binding.WITNESS_DIGEST, 'WITNESS_SEAL')
    witness = json.loads(binding.WITNESS.read_bytes())
    expected = {item['entry']: item['digest'] for row in witness['sources'] for item in row['classes']}
    require(len(witness['sources']) == 560 and len(expected) == 635, 'FIXED_INVENTORY')
    require(pre.get('kind') == 'fixed-ccd-application-class-reproduction', 'REPLAY_PROTOCOL')
    require(pre['sourceCommit'] == witness['sourceCommit'] and pre['sourceTree'] == witness['sourceTree']
            and pre['sourceArchiveDigest'] == witness['sourceArchiveDigest'] and pre['imageJarDigest'] == witness['imageJarDigest']
            and pre['expectedImageIndexDigest'] == witness['imageIndexDigest'] and pre['witnessDigest'] == binding.WITNESS_DIGEST, 'REPLAY_SOURCE_IDENTITY')
    prepared = proof['prepared']
    require(set(prepared) == {'python', 'sourceArchive', 'definitionArchive', 'javaHome', 'lombok', 'mapstruct'}, 'REPLAY_PREPARED_KEYS')
    java = canonical(prepared['javaHome']['path'], directory=True)
    require(prepared['javaHome']['digest'] is None, 'REPLAY_JAVA_HOME')
    tools = [{'path': str(java / row['path']), 'digest': row['digest']} for row in witness['javaFiles']]
    tools += [{'path': prepared[row['name']]['path'], 'digest': row['digest']} for row in witness['processors']]
    require(proof['tools'] == tools, 'REPLAY_TOOL_PROFILE')
    require(prepared['sourceArchive']['digest'] == witness['sourceArchiveDigest']
            and prepared['definitionArchive']['digest'] == ARCHIVE_DIGEST, 'REPLAY_ARCHIVE_PROFILE')
    for row in witness['processors']:
        require(prepared[row['name']]['digest'] == row['digest'], 'REPLAY_PROCESSOR')
    prepared_pins = [row for row in prepared.values() if row['digest'] is not None]
    checked(prepared_pins); checked(tools)
    helper_names = ['verify-complex-email-application-source.py', 'verify-shared-role-ccd-source.py',
                    'verify-definition-image-binding.py', 'verify-local-ccd-oci.py']
    helper_pins = [{'path': str(producer / 'scripts' / name), 'digest': producer_files['scripts/' + name]} for name in helper_names]
    witness_pin = {'path': str(producer / 'scripts/fixtures/ccd/complex-email-application-class-witnesses.json'), 'digest': binding.WITNESS_DIGEST}
    require(producer_files['scripts/fixtures/ccd/complex-email-application-class-witnesses.json'] == binding.WITNESS_DIGEST, 'REPLAY_PRODUCER_WITNESS')
    checked(helper_pins + [witness_pin])
    local_helpers = [{'path': str(ROOT / name), 'digest': producer_files['scripts/' + name]} for name in helper_names]
    checked(local_helpers)
    jar = directory / 'original-case-definition-store-api.jar'
    jar_pin = {'path': str(jar), 'digest': witness['imageJarDigest']}
    # These lists are reconstructed, not accepted from a self-consistent receipt.
    immutable = tools + [prepared['sourceArchive'], jar_pin, witness_pin, helper_pins[0], helper_pins[1]]
    image_pins = [prepared['sourceArchive'], prepared['definitionArchive'], witness_pin] + tools + [helper_pins[2], helper_pins[3], helper_pins[0], helper_pins[1]]
    require(pre['immutableInputs'] == immutable and image_inputs['immutableInputs'] == image_pins, 'REPLAY_IMMUTABLE_INPUTS')
    checked(immutable); checked(image_pins)
    inner = directory / 'class-proof'
    actual = [{'path': str(inner / 'classpath' / (str(i) + '-' + Path(row['entry']).name + '.zip')), 'digest': row['digest']} for i, row in enumerate(witness['classpath'])]
    actual += [{'path': str(inner / 'source' / row['source']), 'digest': row['sourceDigest']} for row in witness['sources']]
    require(len(actual) == 772 and pre['actualCompiledInputs'] == actual, 'REPLAY_COMPILED_INPUTS')
    checked(actual)
    source_archive = load('application_replay_archive', binding.ARCHIVE_HELPER)
    files = source_archive.read_source_archive(Path(prepared['sourceArchive']['path']))
    require(source_archive.git_tree(files) == witness['sourceTree'], 'REPLAY_SOURCE_TREE')
    actual_sources = {name for name in files if (name.startswith('src/main/java/') or '/src/main/java/' in name) and name.endswith('.java')}
    require(actual_sources == {row['source'] for row in witness['sources']}, 'REPLAY_SOURCE_SET')
    for row in witness['sources']:
        require(digest(files[row['source']][0]) == row['sourceDigest'], 'REPLAY_SOURCE_FILE')
    for row in witness['packaging']:
        require(digest(files[row['path']][0]) == row['digest'], 'REPLAY_PACKAGING')
    require(set(re.findall(r"^include '([^']+)'", files['settings.gradle'][0].decode(), re.M)) == {row['sourceModule'] for row in witness['moduleInventory']} | {'aat', 'integration-tests'}, 'REPLAY_PROJECTS')
    inventories = {}
    with zipfile.ZipFile(jar) as archive:
        require(len(set(archive.namelist())) == len(archive.namelist()) and not any(name.startswith('BOOT-INF/classes/') and name.endswith('.class') for name in archive.namelist()), 'REPLAY_JAR_ENTRIES')
        require('build.commit=' + witness['sourceCommit'] in archive.read('META-INF/build-info.properties').decode().splitlines(), 'REPLAY_BUILD_COMMIT')
        require([json.loads(line[2:]) for line in archive.read('BOOT-INF/classpath.idx').decode().splitlines()] == [row['entry'] for row in witness['classpath']], 'REPLAY_CLASSPATH_ORDER')
        for row in witness['classpath']:
            data = archive.read(row['entry']); require(digest(data) == row['digest'], 'REPLAY_JAR_CLASSPATH')
            with zipfile.ZipFile(io.BytesIO(data)) as nested:
                require(len(set(nested.namelist())) == len(nested.namelist()), 'REPLAY_NESTED_DUPLICATE')
                inventories[row['entry']] = {name for name in nested.namelist() if name.endswith('.class')}
                for name in inventories[row['entry']] & set(expected):
                    require(digest(nested.read(name)) == expected[name], 'REPLAY_JAR_CLASS')
    modules = ['BOOT-INF/lib/' + row['imageModule'] for row in witness['moduleInventory']]
    binding.check_class_inventory(inventories, {item['entry']: row['module'] for row in witness['sources'] for item in row['classes']}, modules)
    command = [str(java / 'bin/javac'), '-g', '-parameters', '-encoding', 'UTF-8', '--release', '21', '-implicit:none', '-sourcepath', str(inner / 'empty-sourcepath'), '-classpath', os.pathsep.join([row['path'] for row in actual[:212]] + [prepared['lombok']['path']]), '-processorpath', os.pathsep.join([prepared['lombok']['path'], prepared['mapstruct']['path']]), '-processor', 'lombok.launch.AnnotationProcessorHider$AnnotationProcessor,org.mapstruct.ap.MappingProcessor', '-d', str(inner / 'classes'), '-s', str(inner / 'generated'), *[row['path'] for row in actual[212:]]]
    require(pre['command'] == command, 'REPLAY_COMPILER_RECIPE')
    require(not list(canonical(str(inner / 'empty-sourcepath'), directory=True).iterdir()), 'REPLAY_SOURCEPATH')
    require(canonical(str(inner / 'compiler-version.log')).read_text().strip() == witness['compilerVersion'], 'REPLAY_COMPILER_VERSION')
    expected_association = {'kind': 'fixed-standard-arm-definition-image-jar-association', 'platform': 'linux/arm64', 'archiveDigest': ARCHIVE_DIGEST, 'imageIndexDigest': witness['imageIndexDigest'], 'platformManifestDigest': witness['imagePlatformManifestDigest'], 'configDigest': witness['imageConfigDigest'], 'launchTarget': '/opt/app/case-definition-store-api.jar', 'jarDigest': witness['imageJarDigest'], 'sourceCommit': witness['sourceCommit'], 'classProofPreexecutionDigest': proof['files']['class-proof/preexecution.json'], 'classProofResultDigest': proof['files']['class-proof/result.json'], 'status': 'APPLICATION_CLASS_BYTES_IDENTICAL'}
    require(request['definitionImage'] == witness['imageIndexDigest'] and all(association.get(k) == v for k, v in expected_association.items()), 'REPLAY_IMAGE_ASSOCIATION')
    # Fixed archive bytes seal the complete graph/overlay; inspect its config without extraction.
    config_name = 'blobs/sha256/' + witness['imageConfigDigest'].split(':')[1]
    with tarfile.open(prepared['definitionArchive']['path'], 'r:') as archive:
        matches = [entry for entry in archive.getmembers() if entry.name.removeprefix('./') == config_name]
        require(len(matches) == 1 and matches[0].isfile() and not matches[0].pax_headers and 0 < matches[0].size < 1024 * 1024, 'REPLAY_IMAGE_CONFIG')
        config_bytes = archive.extractfile(matches[0]).read()
        require(digest(config_bytes) == witness['imageConfigDigest'], 'REPLAY_IMAGE_CONFIG')
        config = json.loads(config_bytes)
    require(config['os'] == 'linux' and config['architecture'] == 'arm64' and config['config']['WorkingDir'] == '/opt/app'
            and config['config']['Entrypoint'] == ['/usr/bin/java', '-jar'] and config['config']['Cmd'] == ['case-definition-store-api.jar']
            and association['rootfsDiffIds'] == config['rootfs']['diff_ids'], 'REPLAY_IMAGE_LAUNCH')
    require(all(value.get(flag) is False for value in [pre, image_inputs, association] for flag in FLAGS), 'REPLAY_CREDIT')
    observed = classes(inner / 'classes', expected); result_contract(result, observed)
    checked(receipt_pins); checked(prepared_pins); checked(immutable); checked(image_pins); checked(actual); checked(local_helpers)
    require(classes(inner / 'classes', expected) == observed, 'REPLAY_OUTPUT_DRIFT')
    return {'kind': 'complex-email-source-replay', 'status': 'PASS', 'sourceFiles': 560, 'applicationClasses': 635, 'compiledInputs': 772, 'imageIndexDigest': witness['imageIndexDigest'], 'sourceCommit': witness['sourceCommit'], **FLAGS}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-digest', required=True)
    args = parser.parse_args()
    try:
        raw = sys.stdin.buffer.read(4 * 1024 * 1024 + 1)
        require(len(raw) <= 4 * 1024 * 1024 and digest(raw) == args.expected_digest, 'REPLAY_EXPECTED_PIN')
        print(json.dumps(replay(json.loads(raw))))
        return 0
    except (ValueError, OSError, KeyError, TypeError, IndexError, zipfile.BadZipFile, tarfile.TarError):
        print(json.dumps({'status': 'BLOCKED', 'code': 'COMPLEX_APPLICATION_REPLAY_REJECTED', **FLAGS}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
