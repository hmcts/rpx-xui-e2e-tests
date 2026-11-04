import hashlib
import gzip
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('verifier',Path(__file__).with_name('verify-local-ccd-oci.py'))
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
def sha(b):return 'sha256:'+hashlib.sha256(b).hexdigest()
def encoded(value):return json.dumps(value,separators=(',',':')).encode()
def tar(entries):
    stream=io.BytesIO()
    with tarfile.open(fileobj=stream,mode='w') as archive:
        for name,data,kind in entries:
            info=tarfile.TarInfo(name);info.mode=0o644
            if kind=='link':info.type=tarfile.SYMTYPE;info.linkname='/etc/passwd'
            else:info.size=len(data)
            archive.addfile(info,io.BytesIO(data) if kind!='link' else None)
    return stream.getvalue()
def image(layers,config,extra=None,compressed=False):
    blobs={}
    def blob(data,media):
        digest=sha(data);blobs['blobs/sha256/'+digest[7:]]=data
        return {'mediaType':media,'digest':digest,'size':len(data)}
    manifest={'schemaVersion':2,'mediaType':v.MANIFEST,'config':blob(encoded(config),v.CONFIG),'layers':[blob(gzip.compress(layer,mtime=0) if compressed else layer,'application/vnd.oci.image.layer.v1.tar+gzip' if compressed else 'application/vnd.oci.image.layer.v1.tar') for layer in layers]}
    desc=blob(encoded(manifest),v.MANIFEST)
    entries=[('oci-layout',encoded({'imageLayoutVersion':'1.0.0'}),'file'),('index.json',encoded({'schemaVersion':2,'manifests':[desc]}),'file')]+[(name,data,'file') for name,data in blobs.items()]
    return tar(entries+(extra or [])),sha(encoded(config))
class Verifier(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.base_layer=tar([('base.txt',b'base','file')]);self.jar=b'synthetic-test-jar';self.added=tar([('opt/app/core-case-data.jar',self.jar,'file')])
        self.base_config={'architecture':'arm64','os':'linux','config':{'User':'1000','Entrypoint':['java'],'Env':['A=B']},'rootfs':{'type':'layers','diff_ids':[sha(self.base_layer)]},'history':[{'created_by':'base'}]}
        self.derived_config={**self.base_config,'rootfs':{'type':'layers','diff_ids':[sha(self.base_layer),sha(self.added)]},'history':self.base_config['history']+[{'created_by':'COPY core-case-data.jar /opt/app/core-case-data.jar'}]}
    def verify(self,config=None,added=None,extra=None):
        base,baseid=image([self.base_layer],self.base_config);derived,_=image([self.base_layer,added or self.added],config or self.derived_config,extra)
        (self.root/'base.tar').write_bytes(base);(self.root/'derived.tar').write_bytes(derived)
        with v.layout(self.root/'base.tar') as b,v.layout(self.root/'derived.tar') as d:
            return v.verify_derivative(b,d,baseid,sha(self.jar))
    def test_original_docker_index_chain(self):
        base,baseid=image([self.base_layer],self.base_config,compressed=True)
        with tarfile.open(fileobj=io.BytesIO(base)) as archive:
            entries={item.name:archive.extractfile(item).read() for item in archive}
        manifest=json.loads(entries['index.json'])['manifests'][0]
        manifest['platform']={'architecture':'arm64','os':'linux'}
        upstream=encoded({'schemaVersion':2,'mediaType':v.DOCKER_INDEX,'manifests':[manifest]})
        indexid=sha(upstream)
        entries['blobs/sha256/'+indexid[7:]]=upstream
        entries['index.json']=encoded({'schemaVersion':2,'manifests':[{'mediaType':v.DOCKER_INDEX,'digest':indexid,'size':len(upstream)}]})
        file=self.root/'nested.tar';file.write_bytes(tar([(name,data,'file') for name,data in entries.items()]))
        old=(v.BASE_INDEX,v.BASE_MANIFEST)
        try:
            v.BASE_INDEX=indexid;v.BASE_MANIFEST=manifest['digest']
            with v.layout(file) as result:
                self.assertEqual(result['configDigest'],baseid)
                self.assertEqual(result['indexDigest'],indexid)
                with self.assertRaisesRegex(ValueError,'BASE_IDENTITY'):v.verify_derivative(result,result,sha(b'wrong-config'))
            v.BASE_MANIFEST=sha(b'foreign-child')
            with self.assertRaisesRegex(ValueError,'BASE_MANIFEST_IDENTITY'):
                with v.layout(file):pass
            v.BASE_INDEX=sha(b'foreign-index')
            with self.assertRaisesRegex(ValueError,'BASE_INDEX_IDENTITY'):
                with v.layout(file):pass
        finally:v.BASE_INDEX,v.BASE_MANIFEST=old
    def test_added_layer_rejects_extended_attributes(self):
        for name in ['opt/app/core-case-data.jar','opt','opt/app']:
            for attribute in ['SCHILY.xattr.security.capability','SCHILY.acl.access','SCHILY.xattr.trusted.overlay.opaque']:
                with self.subTest(name=name,attribute=attribute):
                    stream=io.BytesIO()
                    with tarfile.open(fileobj=stream,mode='w',format=tarfile.PAX_FORMAT) as archive:
                        entry=tarfile.TarInfo(name);entry.mode=0o644;entry.pax_headers={attribute:'unexpected'}
                        if name.endswith('.jar'):
                            entry.size=len(self.jar);archive.addfile(entry,io.BytesIO(self.jar))
                        else:
                            entry.type=tarfile.DIRTYPE;archive.addfile(entry)
                    layer=stream.getvalue()
                    config={**self.derived_config,'rootfs':{'type':'layers','diff_ids':[sha(self.base_layer),sha(layer)]}}
                    with self.assertRaisesRegex(ValueError,'EXTENDED_ATTRIBUTES'):self.verify(config,layer)
    def test_positive(self):
        result=self.verify();self.assertFalse(result['runtimeAcceptance']);self.assertFalse(result['catalogueCredit']);self.assertEqual(result['jarDigest'],sha(self.jar))
    def test_changed_entrypoint(self):
        config={**self.derived_config,'config':{**self.base_config['config'],'Entrypoint':['evil']}}
        with self.assertRaisesRegex(ValueError,'EXECUTION_CONFIG'):self.verify(config)
    def test_wrong_platform(self):
        with self.assertRaisesRegex(ValueError,'PLATFORM'):self.verify({**self.derived_config,'architecture':'amd64'})
    def test_wrong_jar(self):
        layer=tar([('opt/app/core-case-data.jar',b'wrong','file')]);config={**self.derived_config,'rootfs':{'type':'layers','diff_ids':[sha(self.base_layer),sha(layer)]}}
        with self.assertRaisesRegex(ValueError,'JAR_DIGEST'):self.verify(config,layer)
    def test_extra_layer_file(self):
        layer=tar([('opt/app/core-case-data.jar',self.jar,'file'),('extra',b'bad','file')]);config={**self.derived_config,'rootfs':{'type':'layers','diff_ids':[sha(self.base_layer),sha(layer)]}}
        with self.assertRaisesRegex(ValueError,'EXTRA_PATH'):self.verify(config,layer)
    def test_wrong_diff_id(self):
        config={**self.derived_config,'rootfs':{'type':'layers','diff_ids':[sha(self.base_layer),sha(b'wrong')]}}
        with self.assertRaisesRegex(ValueError,'DIFF_ID'):self.verify(config)
    def test_symlink_jar(self):
        layer=tar([('opt/app/core-case-data.jar',b'','link')]);config={**self.derived_config,'rootfs':{'type':'layers','diff_ids':[sha(self.base_layer),sha(layer)]}}
        with self.assertRaisesRegex(ValueError,'JAR_TYPE_MODE'):self.verify(config,layer)
    def test_duplicate_archive(self):
        with self.assertRaisesRegex(ValueError,'DUPLICATE_ENTRY'):self.verify(extra=[('index.json',b'{}','file')])
    def test_traversal_archive(self):
        with self.assertRaisesRegex(ValueError,'ENTRY_PATH'):self.verify(extra=[('../escape',b'bad','file')])
    def test_unreferenced_blob(self):
        with self.assertRaisesRegex(ValueError,'UNREFERENCED_BLOB'):self.verify(extra=[('blobs/sha256/'+sha(b'extra')[7:],b'extra','file')])
    def test_expansion_bound(self):
        before=v.MAX_EXPANDED;v.MAX_EXPANDED=1024
        try:
            with self.assertRaisesRegex(ValueError,'EXPANSION_LIMIT'):self.verify()
        finally:v.MAX_EXPANDED=before
    def test_rewritten_history(self):
        with self.assertRaisesRegex(ValueError,'HISTORY_CHANGED'):self.verify({**self.derived_config,'history':[{'created_by':'other'},{'created_by':'COPY core-case-data.jar'}]})
    def test_gzip_positive(self):
        base,baseid=image([self.base_layer],self.base_config,compressed=True)
        derived,_=image([self.base_layer,self.added],self.derived_config,compressed=True)
        (self.root/'base.tar').write_bytes(base);(self.root/'derived.tar').write_bytes(derived)
        with v.layout(self.root/'base.tar') as b,v.layout(self.root/'derived.tar') as d:
            self.assertEqual(v.verify_derivative(b,d,baseid,sha(self.jar))['jarDigest'],sha(self.jar))
            with self.assertRaisesRegex(ValueError,'BASE_IDENTITY'):v.verify_derivative(b,d,sha(b'foreign'),sha(self.jar))
    def test_false_provenance_never_satisfies_fixed_artifact_seals(self):
        (self.root/'core-case-data.jar').write_bytes(self.jar)
        with self.assertRaisesRegex(ValueError,'ARTIFACT_SEAL'):v.verify_artifact(self.root)
    def test_layer_traversal(self):
        layer=tar([('../opt/app/core-case-data.jar',self.jar,'file')]);config={**self.derived_config,'rootfs':{'type':'layers','diff_ids':[sha(self.base_layer),sha(layer)]}}
        with self.assertRaisesRegex(ValueError,'EXTRA_PATH'):self.verify(config,layer)
if __name__=='__main__':unittest.main()
