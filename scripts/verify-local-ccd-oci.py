#!/usr/bin/env python3
"""Narrow local corrected-CCD OCI verifier; no Docker, extraction or acceptance."""
import argparse
import contextlib
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tarfile
import tempfile

BASE_INDEX = 'sha256:230af88ec4791950396e7a78f2dc330018d1a259242e317f4374ec5a384d30c0'
BASE_MANIFEST = 'sha256:2b1b4208520244122d1ebfdc4fbdf7d1120fc0a1bacecb9bba06583762571e9b'
BASE = 'sha256:58a53f7013ff354a312ff4e35a5b2af81d3094600ff30622262c5100554f57da'
JAR = 'sha256:5ddd26e313cbd37dc50651155fbe7e37d1b9bc1f751c5a9185c0e26359e9c90a'
PATCH = 'sha256:41ab60a783ac59754a090cc051ffd7fb738c7d3dd087a42d69730145028088a5'
SOURCE = 'sha256:0ec9d46c267cbf9c4d8525545abe88797b93fd8b1b864dd2a64f73dde9fd9658'
PROVENANCE = 'sha256:15b637ed05be1ac24b26e36b52d0a136915a8ce6d992ec7247c643dc1985d0f8'
MAX_BLOB = 1024 * 1024 * 1024
MAX_EXPANDED = 2 * MAX_BLOB
MAX_TOTAL = 8 * MAX_BLOB
MANIFEST = 'application/vnd.oci.image.manifest.v1+json'
CONFIG = 'application/vnd.oci.image.config.v1+json'
DOCKER_INDEX = 'application/vnd.docker.distribution.manifest.list.v2+json'
DOCKER_MANIFEST = 'application/vnd.docker.distribution.manifest.v2+json'
DOCKER_CONFIG = 'application/vnd.docker.container.image.v1+json'
LAYERS = {'application/vnd.oci.image.layer.v1.tar', 'application/vnd.oci.image.layer.v1.tar+gzip', 'application/vnd.docker.image.rootfs.diff.tar.gzip'}

def require(value, code):
    if not value:
        raise ValueError(code)

def hash_file(file):
    h = hashlib.sha256()
    with open(file, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return 'sha256:' + h.hexdigest()

def regular(file):
    p = Path(file)
    require(p.is_file() and not p.is_symlink(), 'LOCAL_OCI_REGULAR_FILE_REQUIRED')
    return p

def load_json(file):
    require(Path(file).stat().st_size <= 1024 * 1024, 'LOCAL_OCI_JSON_SIZE')
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'LOCAL_OCI_DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    return json.loads(Path(file).read_text(), object_pairs_hook=unique)

def copy_bounded(source, destination, limit):
    total = 0
    while True:
        chunk = source.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        require(total <= limit, 'LOCAL_OCI_EXPANSION_LIMIT')
        destination.write(chunk)
    return total

@contextlib.contextmanager
def layout(archive):
    with _layout(archive, BASE_INDEX, BASE_MANIFEST) as value:
        yield value


@contextlib.contextmanager
def definition_layout(archive):
    # Fixed published definition-store ARM identities; not a caller-selected image mode.
    with _layout(archive,
                 'sha256:4c6b17b06d347d650fb8d26542716e1d723b7c8b8d44eee69908299cc8f4af52',
                 'sha256:cc8507b0218afe8d85b10a9dba3c42eee0a4c73abd3608b22e8fddc4e0fad900') as value:
        require(value['indexDigest'] == 'sha256:4c6b17b06d347d650fb8d26542716e1d723b7c8b8d44eee69908299cc8f4af52' and value['manifestDigest'] == 'sha256:cc8507b0218afe8d85b10a9dba3c42eee0a4c73abd3608b22e8fddc4e0fad900', 'DEFINITION_IMAGE')
        require(value['configDigest'] == 'sha256:7725e2475ded2180df9eaef000f8043c20a28d231cd4d41bbc3d2360bfdd61ca', 'DEFINITION_CONFIG')
        yield value


@contextlib.contextmanager
def _layout(archive, expected_index, expected_manifest):
    regular(archive)
    require(Path(archive).stat().st_size <= MAX_TOTAL, 'LOCAL_OCI_ARCHIVE_SIZE')
    with tempfile.TemporaryDirectory(prefix='ccd-oci-verify-') as temporary:
        root = Path(temporary)
        seen, total = set(), 0
        with tarfile.open(archive, 'r:') as tar:
            for entry in tar:
                name = entry.name
                require(name not in seen, 'LOCAL_OCI_DUPLICATE_ENTRY')
                seen.add(name)
                require(not name.startswith('/') and '..' not in name.split('/') and '\\' not in name, 'LOCAL_OCI_ENTRY_PATH')
                if entry.isdir():
                    require(name.rstrip('/') in ['blobs', 'blobs/sha256'], 'LOCAL_OCI_EXTRA_DIRECTORY')
                    continue
                require(entry.isfile(), 'LOCAL_OCI_ENTRY_TYPE')
                blob = name.startswith('blobs/sha256/') and len(name) == 77 and all(c in '0123456789abcdef' for c in name[13:])
                require(name in ['index.json', 'oci-layout'] or blob, 'LOCAL_OCI_EXTRA_ENTRY')
                require(0 <= entry.size <= MAX_BLOB, 'LOCAL_OCI_BLOB_SIZE')
                total += entry.size
                require(total <= MAX_TOTAL, 'LOCAL_OCI_TOTAL_SIZE')
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                with tar.extractfile(entry) as source, open(target, 'xb') as destination:
                    require(copy_bounded(source, destination, entry.size) == entry.size, 'LOCAL_OCI_SHORT_ENTRY')
                if blob:
                    require(hash_file(target) == 'sha256:' + name[13:], 'LOCAL_OCI_BLOB_DIGEST')
        require(load_json(root / 'oci-layout') == {'imageLayoutVersion': '1.0.0'}, 'LOCAL_OCI_LAYOUT_VERSION')
        index = load_json(root / 'index.json')
        require(index.get('schemaVersion') == 2 and len(index.get('manifests', [])) == 1, 'LOCAL_OCI_MANIFEST_COUNT')
        used = set()
        def descriptor(desc, media):
            require(isinstance(desc, dict) and desc.get('mediaType') in media and 'urls' not in desc and 'data' not in desc, 'LOCAL_OCI_DESCRIPTOR')
            digest = desc.get('digest', '')
            require(len(digest) == 71 and digest.startswith('sha256:') and all(c in '0123456789abcdef' for c in digest[7:]), 'LOCAL_OCI_DESCRIPTOR_DIGEST')
            file = root / 'blobs/sha256' / digest[7:]
            require(file.is_file() and file.stat().st_size == desc.get('size'), 'LOCAL_OCI_DESCRIPTOR_SIZE')
            used.add('blobs/sha256/' + digest[7:])
            return file
        selected = index['manifests'][0]
        index_digest = None
        if selected.get('mediaType') == DOCKER_INDEX:
            index_digest = selected.get('digest')
            require(index_digest == expected_index, 'LOCAL_OCI_BASE_INDEX_IDENTITY')
            upstream = load_json(descriptor(selected, {DOCKER_INDEX}))
            require(upstream.get('schemaVersion') == 2 and upstream.get('mediaType') == DOCKER_INDEX, 'LOCAL_OCI_INDEX_SCHEMA')
            matches = [item for item in upstream.get('manifests', []) if item.get('platform') == {'architecture':'arm64','os':'linux'}]
            require(len(matches) == 1 and matches[0].get('digest') == expected_manifest, 'LOCAL_OCI_BASE_MANIFEST_IDENTITY')
            selected = matches[0]
        manifest_file = descriptor(selected, {MANIFEST, DOCKER_MANIFEST})
        manifest = load_json(manifest_file)
        require(manifest.get('schemaVersion') == 2 and manifest.get('mediaType') in {MANIFEST, DOCKER_MANIFEST}, 'LOCAL_OCI_MANIFEST_SCHEMA')
        config_file = descriptor(manifest['config'], {CONFIG, DOCKER_CONFIG})
        config = load_json(config_file)
        require(config.get('os') == 'linux' and config.get('architecture') == 'arm64', 'LOCAL_OCI_PLATFORM')
        layers = manifest.get('layers')
        require(isinstance(layers, list) and 0 < len(layers) <= 128, 'LOCAL_OCI_LAYER_COUNT')
        require(len({item['digest'] for item in layers}) == len(layers), 'LOCAL_OCI_DUPLICATE_LAYER')
        diffs = config.get('rootfs', {}).get('diff_ids')
        require(config.get('rootfs', {}).get('type') == 'layers' and isinstance(diffs, list) and len(diffs) == len(layers), 'LOCAL_OCI_ROOTFS')
        expanded = []
        expanded_total = 0
        for n, desc in enumerate(layers):
            layer_file = descriptor(desc, LAYERS)
            target = root / ('expanded-' + str(n))
            opener = gzip.open if desc['mediaType'].endswith(('+gzip', '.gzip')) else open
            with opener(layer_file, 'rb') as source, open(target, 'xb') as destination:
                expanded_total += copy_bounded(source, destination, MAX_EXPANDED)
                require(expanded_total <= MAX_TOTAL, 'LOCAL_OCI_TOTAL_EXPANSION_LIMIT')
            require(hash_file(target) == diffs[n], 'LOCAL_OCI_DIFF_ID')
            expanded.append(target)
        require({name for name in seen if name.startswith('blobs/sha256/') and name != 'blobs/sha256/'} == used, 'LOCAL_OCI_UNREFERENCED_BLOB')
        yield {'root': root, 'indexDigest': index_digest, 'indexDocumentDigest': hash_file(root / 'index.json'), 'archiveDigest': hash_file(archive), 'manifestDigest': selected['digest'], 'manifest': manifest, 'configDigest': manifest['config']['digest'], 'config': config, 'expanded': expanded}

def jar_layer(file, expected, parents):
    seen, jars = set(), 0
    with tarfile.open(file, 'r:') as tar:
        for entry in tar:
            require(not entry.pax_headers, 'LOCAL_OCI_LAYER_EXTENDED_ATTRIBUTES')
            name = entry.name.rstrip('/')
            require(name not in seen, 'LOCAL_OCI_LAYER_DUPLICATE')
            seen.add(name)
            require(name in ['opt', 'opt/app', 'opt/app/core-case-data.jar'], 'LOCAL_OCI_LAYER_EXTRA_PATH')
            if name != 'opt/app/core-case-data.jar':
                require(entry.isdir(), 'LOCAL_OCI_LAYER_PARENT_TYPE')
                require(parents.get(name) == (stat.S_IMODE(entry.mode),entry.uid,entry.gid), 'LOCAL_OCI_PARENT_METADATA_CHANGED')
                continue
            require(entry.isfile() and entry.mode == 0o644 and entry.uid == 0 and entry.gid == 0, 'LOCAL_OCI_JAR_TYPE_MODE')
            require(entry.size <= MAX_BLOB, 'LOCAL_OCI_JAR_SIZE')
            with tar.extractfile(entry) as stream:
                h = hashlib.sha256()
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    h.update(chunk)
            require('sha256:' + h.hexdigest() == expected, 'LOCAL_OCI_JAR_DIGEST')
            jars += 1
    require(jars == 1, 'LOCAL_OCI_JAR_MISSING')

def canonical_layer_descriptor(descriptor):
    # Buildx exports the same gzip bytes with the equivalent OCI media type.
    result = dict(descriptor)
    if result.get('mediaType') == 'application/vnd.docker.image.rootfs.diff.tar.gzip':
        result['mediaType'] = 'application/vnd.oci.image.layer.v1.tar+gzip'
    return result

def verify_execution_config(base, derived):
    b = {k:v for k,v in base.items() if k not in ['rootfs','history','created']}
    d = {k:v for k,v in derived.items() if k not in ['rootfs','history','created']}
    omitted = []
    for key in ['container','container_config','docker_version']:
        if key in b and key not in d:
            del b[key];omitted.append(key)
    bc, dc = dict(b.get('config', {})), dict(d.get('config', {}))
    defaults = {'AttachStdin':False,'AttachStdout':False,'AttachStderr':False,'Tty':False,'OpenStdin':False,'StdinOnce':False,'Hostname':'','Domainname':'','Volumes':None,'OnBuild':None}
    for key, expected in defaults.items():
        if key in bc and key not in dc:
            require(type(bc[key]) is type(expected) and bc[key] == expected, 'LOCAL_OCI_NONDEFAULT_CONFIG_OMITTED')
            del bc[key];omitted.append('config.'+key)
    if 'Image' in bc and 'Image' not in dc:
        # Docker legacy parent-image bookkeeping; pinned base fixes its exact value.
        del bc['Image'];omitted.append('config.Image')
    b['config'], d['config'] = bc, dc
    require(b == d, 'LOCAL_OCI_EXECUTION_CONFIG_CHANGED')
    return sorted(omitted)

def verify_derivative(base, derived, base_digest=BASE, jar_digest=JAR):
    require(base['configDigest'] == base_digest, 'LOCAL_OCI_BASE_IDENTITY')
    b, d = base['config'], derived['config']
    require(len(derived['manifest']['layers']) == len(base['manifest']['layers']) + 1, 'LOCAL_OCI_DERIVATIVE_LAYER_COUNT')
    require([canonical_layer_descriptor(item) for item in derived['manifest']['layers'][:-1]] == [canonical_layer_descriptor(item) for item in base['manifest']['layers']], 'LOCAL_OCI_BASE_LAYER_PREFIX')
    require(d['rootfs']['diff_ids'][:-1] == b['rootfs']['diff_ids'], 'LOCAL_OCI_BASE_DIFF_PREFIX')
    omitted = verify_execution_config(b, d)
    bh, dh = b.get('history', []), d.get('history', [])
    require(dh[:len(bh)] == bh and len(dh) == len(bh) + 1 and not dh[-1].get('empty_layer', False), 'LOCAL_OCI_HISTORY_CHANGED')
    require('COPY' in dh[-1].get('created_by', '') and 'core-case-data.jar' in dh[-1].get('created_by', ''), 'LOCAL_OCI_COPY_HISTORY')
    parents = {}
    for layer in base['expanded']:
        with tarfile.open(layer,'r:') as tar:
            for entry in tar:
                name=entry.name.removeprefix('./').rstrip('/')
                if name in ['opt','opt/app']:
                    require(entry.isdir(),'LOCAL_OCI_BASE_PARENT_TYPE')
                    parents[name]=(stat.S_IMODE(entry.mode),entry.uid,entry.gid)
    jar_layer(derived['expanded'][-1], jar_digest, parents)
    return {'schemaVersion':1,'profile':'ccd-results-internal-id-fix-feasibility','kind':'verified-local-oci-ccd-derivative','platform':'linux/arm64','baseArchiveDigest':base['archiveDigest'],'baseManifestDigest':base['manifestDigest'],'baseConfigDigest':base['configDigest'],'archiveDigest':derived['archiveDigest'],'manifestDigest':derived['manifestDigest'],'indexDocumentDigest':derived['indexDocumentDigest'],'configDigest':derived['configDigest'],'rootfsDiffIds':d['rootfs']['diff_ids'],'executionConfig':d.get('config',{}),'jarDigest':jar_digest,'omittedLegacyConfigFields':omitted,'gzipMediaTypeNormalizedLayerIndexes':[i for i,(left,right) in enumerate(zip(base['manifest']['layers'],derived['manifest']['layers'])) if left['mediaType'] != right['mediaType']],'runtimeAcceptance':False,'catalogueCredit':False,'releaseCredit':False}

def verify_artifact(root):
    root = Path(root)
    for name, expected in [('core-case-data.jar',JAR),('correction.patch',PATCH),('source-inventory.json',SOURCE)]:
        require(hash_file(regular(root / name)) == expected, 'LOCAL_OCI_ARTIFACT_SEAL')
    require(hash_file(regular(root / 'provenance.json')) == PROVENANCE, 'LOCAL_OCI_PROVENANCE_SEAL')
    p = load_json(root / 'provenance.json')
    s = p.get('source', {})
    require(s.get('commit') == '5c5ff0b941dcbc7e661e8aa9e38dc51d7c30ffb3' and s.get('gitTree') == '5b4b765f015949e62fc2f4fb9fa61ff8fdbb1300' and s.get('repository') == 'hmcts/ccd-data-store-api', 'LOCAL_OCI_SOURCE_PROVENANCE')
    require(s.get('patchDigest') == PATCH and s.get('correctedSourceInventoryDigest') == SOURCE and p.get('artifact',{}).get('digest') == JAR, 'LOCAL_OCI_PROVENANCE_SEALS')
    return hash_file(root / 'provenance.json')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--base',required=True);parser.add_argument('--derived');parser.add_argument('--artifact-root',required=True);parser.add_argument('--materialize-base')
    args=parser.parse_args()
    provenance=verify_artifact(args.artifact_root)
    with layout(args.base) as base:
        require(base['configDigest']==BASE and base['indexDigest']==BASE_INDEX and base['manifestDigest']==BASE_MANIFEST,'LOCAL_OCI_BASE_IDENTITY')
        if args.materialize_base:
            target=Path(args.materialize_base);target.mkdir(mode=0o700)
            for name in ['oci-layout','index.json','blobs']:
                if (base['root']/name).is_dir():shutil.copytree(base['root']/name,target/name)
                else:shutil.copyfile(base['root']/name,target/name)
        if args.derived:
            with layout(args.derived) as derived:receipt=verify_derivative(base,derived)
        else:receipt={'baseArchiveDigest':base['archiveDigest'],'baseIndexDigest':base['indexDigest'],'baseManifestDigest':base['manifestDigest'],'baseConfigDigest':base['configDigest']}
    receipt['artifactProvenanceDigest']=provenance
    print(json.dumps(receipt,separators=(',',':')))

if __name__=='__main__':
    try:main()
    except (ValueError,KeyError,OSError,tarfile.TarError,json.JSONDecodeError,TypeError,AttributeError,IndexError,EOFError) as error:
        code=str(error) if isinstance(error,ValueError) and str(error).startswith('LOCAL_OCI_') else 'LOCAL_OCI_VERIFICATION_FAILED'
        print(json.dumps({'error':code}))
        raise SystemExit(1)
