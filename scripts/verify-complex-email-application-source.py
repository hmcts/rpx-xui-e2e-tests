#!/usr/bin/env python3
"""Reproduce one fixed CCD application's Java classes; never grants Harness credit."""
import argparse
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
WITNESS = ROOT / 'fixtures/ccd/complex-email-application-class-witnesses.json'
WITNESS_DIGEST = 'sha256:defb7e908eddcc192e389bff882ac868a637b2a02dc884a8c65da54034f8ddb3'
ARCHIVE_HELPER = ROOT / 'verify-shared-role-ccd-source.py'
FLAGS = {'sourceComplete': False, 'runtimeAcceptance': False, 'catalogueCredit': False, 'releaseCredit': False}


def require(condition, code):
    if not condition:
        raise ValueError('COMPLEX_APPLICATION_' + code)


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def check_inputs(pins):
    for row in pins:
        file = Path(row['path'])
        require(file.is_file() and not file.is_symlink(), 'INPUT_REQUIRED')
        require(digest(file.read_bytes()) == row['digest'], 'INPUT_DRIFT')


def prepare_output(output, readonly):
    require(output.is_absolute() and output.parent.is_dir() and output.parent.resolve() == output.parent, 'OUTPUT_PARENT')
    for original in readonly:
        original = original.resolve()
        require(output != original and original not in output.parents and output not in original.parents, 'OUTPUT_OVERLAP')
    require(not output.exists(), 'FRESH_OUTPUT')
    output.mkdir(mode=0o700)


def save(file, value):
    with file.open('x') as target:
        os.fchmod(target.fileno(), 0o600)
        json.dump(value, target, indent=2)
        target.write('\n')


def check_class_inventory(archives, expected_modules, application_modules):
    require(expected_modules and application_modules, 'EMPTY_EXPECTED')
    for module, names in archives.items():
        if module not in application_modules:
            require(not any(name.startswith('uk/gov/hmcts/ccd/definition/store/') for name in names), 'UNLISTED_APPLICATION_MODULE')
    actual = {name for module in application_modules for name in archives.get(module, set())}
    require(actual == set(expected_modules), 'COMPLETE_CLASS_INVENTORY')
    for name, module in expected_modules.items():
        require(name in archives.get(module, set()), 'CLASS_MODULE_MISMATCH')
        require(sum(name in names for names in archives.values()) == 1, 'SHADOWED_APPLICATION_CLASS')


def compare_output(output, expected):
    require(expected, 'EMPTY_EXPECTED')
    actual = {}
    for file in output.rglob('*.class'):
        require(file.is_file() and not file.is_symlink(), 'OUTPUT_CLASS_REQUIRED')
        actual[str(file.relative_to(output))] = digest(file.read_bytes())
    return {
        'missing': sorted(set(expected) - set(actual)),
        'extra': sorted(set(actual) - set(expected)),
        'mismatches': [name for name in sorted(set(expected) & set(actual)) if actual[name] != expected[name]],
        'matches': sum(actual.get(name) == hashed for name, hashed in expected.items()),
    }


def verify_definition(args):
    require(args.image_jar is None, 'AMBIGUOUS_IMAGE_INPUT')
    require(all(getattr(args, name).is_absolute() for name in ['source_archive', 'definition_archive', 'java_home', 'lombok', 'mapstruct', 'output']), 'ABSOLUTE_INPUTS_REQUIRED')
    require(str(args.output) == os.path.normpath(str(args.output)) and not os.path.lexists(args.output), 'FRESH_OUTPUT')
    require(digest(WITNESS.read_bytes()) == WITNESS_DIGEST, 'WITNESS_SEAL')
    witness = json.loads(WITNESS.read_bytes())
    helper_path = ROOT / 'verify-definition-image-binding.py'
    oci_path = ROOT / 'verify-local-ccd-oci.py'
    pins = [{'path': str(args.source_archive), 'digest': witness['sourceArchiveDigest']},
            {'path': str(args.definition_archive), 'digest': 'sha256:4343d615ca395974e5651e7eae06296e4a19ce161c40d5b4ba18bf242eb24eb4'},
            {'path': str(WITNESS), 'digest': WITNESS_DIGEST}]
    pins += [{'path': str(args.java_home / row['path']), 'digest': row['digest']} for row in witness['javaFiles']]
    pins += [{'path': str(getattr(args, row['name'])), 'digest': row['digest']} for row in witness['processors']]
    pins += [{'path': str(p), 'digest': digest(p.read_bytes())} for p in [helper_path, oci_path, Path(__file__).resolve(), ARCHIVE_HELPER]]
    check_inputs(pins)
    prepare_output(args.output, [ROOT.parent, args.java_home, args.source_archive, args.definition_archive, args.lombok, args.mapstruct])
    save(args.output / 'image-inputs.json', {'immutableInputs': pins, **FLAGS})
    spec = importlib.util.spec_from_file_location('definition_binding', helper_path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    jar, association = helper.bind_archive(args.definition_archive, args.output, witness, require, digest)
    check_inputs(pins)
    inner = copy.copy(args)
    inner.definition_archive = None
    inner.image_jar = jar
    inner.output = args.output / 'class-proof'
    result = verify(inner)
    check_inputs(pins + [{'path': str(jar), 'digest': witness['imageJarDigest']}])
    association.update({'classProofPreexecutionDigest': digest((inner.output / 'preexecution.json').read_bytes()),
                        'classProofResultDigest': digest((inner.output / 'result.json').read_bytes()),
                        'status': result['status'], 'scope': 'fixed original image JAR plus eight application modules; not whole image/runtime/admission', **FLAGS})
    save(args.output / 'definition-image-binding.json', association)
    return result


def verify(args):
    if getattr(args, 'definition_archive', None) is not None:
        return verify_definition(args)
    require(all(getattr(args, name).is_absolute() for name in ['source_archive', 'image_jar', 'java_home', 'lombok', 'mapstruct', 'output']), 'ABSOLUTE_INPUTS_REQUIRED')
    require(digest(WITNESS.read_bytes()) == WITNESS_DIGEST, 'WITNESS_SEAL')
    witness = json.loads(WITNESS.read_bytes())
    expected = {entry['entry']: entry['digest'] for row in witness['sources'] for entry in row['classes']}
    expected_modules = {entry['entry']: row['module'] for row in witness['sources'] for entry in row['classes']}
    require(len(witness['sources']) == 560 and len(expected) == 635
            and sum(len(row['classes']) for row in witness['sources']) == 635, 'FIXED_INVENTORY')
    tools = [{'path': str(args.java_home / row['path']), 'digest': row['digest']} for row in witness['javaFiles']]
    processors = {'lombok': args.lombok, 'mapstruct': args.mapstruct}
    tools.extend({'path': str(processors[row['name']]), 'digest': row['digest']} for row in witness['processors'])
    immutable = tools + [
        {'path': str(args.source_archive), 'digest': witness['sourceArchiveDigest']},
        {'path': str(args.image_jar), 'digest': witness['imageJarDigest']},
        {'path': str(WITNESS), 'digest': WITNESS_DIGEST},
        {'path': str(Path(__file__).resolve()), 'digest': digest(Path(__file__).read_bytes())},
        {'path': str(ARCHIVE_HELPER), 'digest': digest(ARCHIVE_HELPER.read_bytes())},
    ]
    check_inputs(immutable)
    spec = importlib.util.spec_from_file_location('source_archive', ARCHIVE_HELPER)
    archive = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(archive)
    files = archive.read_source_archive(args.source_archive)
    require(archive.git_tree(files) == witness['sourceTree'], 'SOURCE_TREE')
    actual_sources = {name for name in files if (name.startswith('src/main/java/') or '/src/main/java/' in name) and name.endswith('.java')}
    require(actual_sources == {row['source'] for row in witness['sources']}, 'COMPLETE_SOURCE_INVENTORY')
    for row in witness['sources']:
        require(digest(files[row['source']][0]) == row['sourceDigest'], 'SOURCE_FILE')
    for row in witness['packaging']:
        require(digest(files[row['path']][0]) == row['digest'], 'PACKAGING_SOURCE')
    modules = witness['moduleInventory']
    projects = set(re.findall(r"^include '([^']+)'", files['settings.gradle'][0].decode(), re.M))
    require(projects == {row['sourceModule'] for row in modules} | {'aat', 'integration-tests'}, 'SOURCE_PROJECTS')
    require(not any(name.startswith(('aat/src/main/java/', 'integration-tests/src/main/java/')) for name in actual_sources), 'TEST_PROJECT_APPLICATION_SOURCE')
    prepare_output(args.output, [ROOT.parent, args.java_home, args.source_archive, args.image_jar, args.lombok, args.mapstruct])
    source = args.output / 'source'
    source.mkdir(mode=0o700)
    for name, (data, _mode) in files.items():
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        target.chmod(0o444)
    library = args.output / 'classpath'
    library.mkdir(mode=0o700)
    classpath, actual_inputs, inventories = [], [], {}
    application_modules = ['BOOT-INF/lib/' + row['imageModule'] for row in modules]
    with zipfile.ZipFile(args.image_jar) as jar:
        require(len(set(jar.namelist())) == len(jar.namelist()), 'DUPLICATE_JAR_ENTRY')
        require(not any(name.startswith('BOOT-INF/classes/') and name.endswith('.class') for name in jar.namelist()), 'UNEXPECTED_OUTER_APPLICATION_CLASS')
        require('build.commit=' + witness['sourceCommit'] in jar.read('META-INF/build-info.properties').decode().splitlines(), 'BUILD_COMMIT')
        names = [json.loads(line[2:]) for line in jar.read('BOOT-INF/classpath.idx').decode().splitlines()]
        require(names == [row['entry'] for row in witness['classpath']] and len(names) == len(set(names)) == 212, 'CLASSPATH_ORDER')
        for index, (name, pin) in enumerate(zip(names, witness['classpath'])):
            require(name.startswith('BOOT-INF/lib/') and len(Path(name).parts) == 3 and '..' not in name, 'CLASSPATH_PATH')
            data = jar.read(name)
            require(digest(data) == pin['digest'], 'CLASSPATH_DIGEST')
            target = library / (str(index) + '-' + Path(name).name + '.zip')
            target.write_bytes(data)
            target.chmod(0o400)
            classpath.append(str(target))
            actual_inputs.append({'path': str(target), 'digest': pin['digest']})
            with zipfile.ZipFile(io.BytesIO(data)) as nested:
                require(len(set(nested.namelist())) == len(nested.namelist()), 'DUPLICATE_NESTED_ENTRY')
                inventories[name] = {entry for entry in nested.namelist() if entry.endswith('.class')}
                for entry in inventories[name] & set(expected):
                    require(digest(nested.read(entry)) == expected[entry], 'IMAGE_CLASS_DIGEST')
    check_class_inventory(inventories, expected_modules, application_modules)
    for row in modules:
        require(len(inventories['BOOT-INF/lib/' + row['imageModule']]) == row['classes']
                and sum(item['source'].startswith(row['sourceModule'] + '/src/main/java/') for item in witness['sources']) == row['sources'], 'MODULE_COUNT')
    sources = [str(source / row['source']) for row in witness['sources']]
    actual_inputs.extend({'path': str(source / row['source']), 'digest': row['sourceDigest']} for row in witness['sources'])
    compiler = args.java_home / 'bin/javac'
    environment = {'PATH': str(args.java_home / 'bin') + ':/usr/bin:/bin', 'JAVA_HOME': str(args.java_home), 'LANG': 'en_US.UTF-8'}
    version = subprocess.run([str(compiler), '-version'], env=environment, capture_output=True, timeout=30, check=False)
    require(version.returncode == 0 and version.stdout.decode().strip() == witness['compilerVersion'], 'COMPILER_VERSION')
    classes, generated, empty = [args.output / name for name in ['classes', 'generated', 'empty-sourcepath']]
    for directory in [classes, generated, empty]: directory.mkdir(mode=0o700)
    command = [str(compiler), '-g', '-parameters', '-encoding', 'UTF-8', '--release', '21', '-implicit:none',
               '-sourcepath', str(empty), '-classpath', os.pathsep.join(classpath + [str(args.lombok)]),
               '-processorpath', os.pathsep.join([str(args.lombok), str(args.mapstruct)]),
               '-processor', 'lombok.launch.AnnotationProcessorHider$AnnotationProcessor,org.mapstruct.ap.MappingProcessor',
               '-d', str(classes), '-s', str(generated), *sources]
    preexecution = {'kind': 'fixed-ccd-application-class-reproduction', 'sourceCommit': witness['sourceCommit'],
                    'sourceTree': witness['sourceTree'], 'sourceArchiveDigest': witness['sourceArchiveDigest'],
                    'expectedImageIndexDigest': witness['imageIndexDigest'], 'imageJarDigest': witness['imageJarDigest'],
                    'imageBinding': 'fixed reviewed image JAR digest; no running-image or whole-image claim',
                    'witnessDigest': WITNESS_DIGEST, 'immutableInputs': immutable, 'actualCompiledInputs': actual_inputs,
                    'command': command, **FLAGS}
    save(args.output / 'preexecution.json', preexecution)
    check_inputs(immutable + actual_inputs)
    with (args.output / 'javac.log').open('x') as log:
        os.fchmod(log.fileno(), 0o600)
        result = subprocess.run(command, cwd=source, env=environment, stdout=log, stderr=subprocess.STDOUT, timeout=180, check=False)
    observed = compare_output(classes, expected)
    unchanged = True
    try:
        check_inputs(immutable + actual_inputs)
    except ValueError:
        unchanged = False
    passed = result.returncode == 0 and unchanged and not any(observed[key] for key in ['missing', 'extra', 'mismatches'])
    observed.update({'kind': preexecution['kind'], 'status': 'APPLICATION_CLASS_BYTES_IDENTICAL' if passed else 'BLOCKED',
                     'compilerExitCode': result.returncode, 'inputsUnchanged': unchanged, 'sourceFiles': 560,
                     'expectedClasses': 635, 'scope': 'eight source-project application modules only; excludes third-party/Boot loader/resources/configuration/original-build provenance/activation/admission', **FLAGS})
    save(args.output / 'result.json', observed)
    return observed


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, epilog='Uses fixed cached inputs only. No downloads, image builds or Harness credit.')
    for name in ['source-archive', 'java-home', 'lombok', 'mapstruct', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    image = parser.add_mutually_exclusive_group(required=True)
    image.add_argument('--image-jar', type=Path)
    image.add_argument('--definition-archive', type=Path)
    try:
        result = verify(parser.parse_args())
        print(json.dumps({key: result[key] for key in ['status', 'sourceFiles', 'expectedClasses', 'matches', *FLAGS]}))
        sys.exit(0 if result['status'] == 'APPLICATION_CLASS_BYTES_IDENTICAL' else 2)
    except (ValueError, OSError, KeyError, TypeError, IndexError, zipfile.BadZipFile, subprocess.SubprocessError) as error:
        code = str(error) if isinstance(error, ValueError) and str(error).startswith('COMPLEX_APPLICATION_') else 'COMPLEX_APPLICATION_EVIDENCE_REJECTED'
        print(json.dumps({'status': 'BLOCKED', 'code': code, **FLAGS}))
        sys.exit(2)
