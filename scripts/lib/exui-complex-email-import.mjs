import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deriveComplexEmailFixture, complexEmailMetadataSql, validateComplexEmailMetadata } from './exui-complex-email-text.mjs';
import { assertFreshCandidateDerivationOutput } from './exui-candidate-artifact.mjs';
import { digestBytes, writeJsonAtomic } from './exui-evidence-io.mjs';
import { ccdCredentials, ccdRequest, docker, verifyCcdContainerIdentity, validateCcdDefinition } from './exui-ccd-runtime.mjs';

const fixtureRoot = fileURLToPath(new URL('../fixtures/ccd/', import.meta.url));
const one = (rows, predicate) => {const selected=rows.filter(predicate);assert.equal(selected.length,1,'COMPLEX_EMAIL_DESCRIPTOR_ROW');return selected[0];};

export function validateComplexEmailDefinition(definition, variant) {
  deriveComplexEmailFixture(variant);
  assert.equal(definition.id,'HarnessNestedPRL','COMPLEX_EMAIL_CASE_TYPE');
  assert(Number.isSafeInteger(definition.version?.number)&&definition.version.number>0,'COMPLEX_EMAIL_VERSION_REQUIRED');
  validateCcdDefinition(definition);
  const root=one(definition.case_fields,row=>row.id==='sodAdditionalRecipientsList');
  assert.equal(root.field_type.type,'Collection','COMPLEX_EMAIL_COLLECTION');
  const parent=root.field_type.collection_field_type;
  assert.deepEqual([parent.id,parent.type],['ServeOrgDetails','Complex'],'COMPLEX_EMAIL_PARENT');
  const branch=one(parent.complex_fields,row=>row.id==='emailInformation');
  assert.deepEqual([branch.field_type.id,branch.field_type.type],['EmailInformation','Complex'],'COMPLEX_EMAIL_PARENT');
  const leaf=one(branch.field_type.complex_fields,row=>row.id==='emailAddress');
  assert.equal(leaf.label,'Email address','COMPLEX_EMAIL_LABEL');
  assert.deepEqual([leaf.field_type.id,leaf.field_type.type],[variant==='email-type'?'Email':'Text',variant==='email-type'?'Email':'Text'],'COMPLEX_EMAIL_FIELD_TYPE');
  assert.equal(leaf.security_classification,'PUBLIC','COMPLEX_EMAIL_CLASSIFICATION');
  assert(leaf.live_from==null&&leaf.live_until==null,'COMPLEX_EMAIL_UNEXPECTED_DATE');
  const probe=one(definition.case_fields,row=>row.id==='harnessEmailTypeProbe');
  assert.deepEqual(probe.field_type,branch.field_type,'COMPLEX_EMAIL_PROBE_TYPE');
  return {version:definition.version.number,leafDigest:digestBytes(JSON.stringify(leaf)),catalogueCredit:false};
}

export async function prepareComplexEmailImport(output,variant) {
  const derivative=deriveComplexEmailFixture(variant);
  const destination=await assertFreshCandidateDerivationOutput({baseline:{candidateRoot:fixtureRoot},manifestPath:path.join(fixtureRoot,'event-capability.source.json'),output});
  fs.mkdirSync(destination,{mode:0o700});
  const json=path.join(destination,'definition.json'),xlsx=path.join(destination,'definition.xlsx');
  fs.writeFileSync(json,JSON.stringify(derivative.fixture,null,2)+'\n',{flag:'wx',mode:0o600});
  const generated=spawnSync('python3',[path.join(fixtureRoot,'workbook.py'),json,xlsx],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  assert(!generated.error&&generated.status===0,'COMPLEX_EMAIL_WORKBOOK_FAILED');fs.chmodSync(xlsx,0o600);
  const seal={schemaVersion:1,kind:'complex-email-import',variant,binding:derivative.binding,definitionDigest:digestBytes(fs.readFileSync(json)),workbookDigest:digestBytes(fs.readFileSync(xlsx)),runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
  writeJsonAtomic(path.join(destination,'binding.json'),seal);return seal;
}

export async function importComplexEmail(state,{fixtureDirectory,variant,request=ccdRequest,inspect=verifyCcdContainerIdentity,runDocker=docker}) {
  const seal=JSON.parse(fs.readFileSync(path.join(fixtureDirectory,'binding.json')));
  const derived=deriveComplexEmailFixture(variant);
  assert.deepEqual(seal.binding,derived.binding,'COMPLEX_EMAIL_IMPORT_BINDING');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixtureDirectory,'definition.json'))),derived.fixture,'COMPLEX_EMAIL_IMPORT_SOURCE');
  assert.deepEqual([seal.kind,seal.variant,seal.runtimeAcceptance,seal.catalogueCredit,seal.releaseCredit],['complex-email-import',variant,false,false,false],'COMPLEX_EMAIL_IMPORT_SEAL');
  const workbook=fs.readFileSync(path.join(fixtureDirectory,'definition.xlsx'));
  assert.equal(digestBytes(workbook),seal.workbookDigest,'COMPLEX_EMAIL_WORKBOOK_DIGEST');
  assert.equal(digestBytes(fs.readFileSync(path.join(fixtureDirectory,'definition.json'))),seal.definitionDigest,'COMPLEX_EMAIL_DEFINITION_DIGEST');
  inspect(state);
  const output=path.join(state.output,'complex-email-import');fs.mkdirSync(output,{mode:0o700});
  const receipt={schemaVersion:1,kind:'complex-email-import-feasibility',status:'in-progress',owner:state.owner,namespace:state.namespace,images:state.images,seal,observations:{},runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
  const save=()=>writeJsonAtomic(path.join(output,'receipt.json'),receipt);
  try {
    const observer=ccdCredentials(state,'observer',{request});
    receipt.observations.import=request(state,4451,'/import',{method:'POST',headers:observer.headers,file:workbook.toString('base64')});save();
    assert([200,201].includes(receipt.observations.import.status),'COMPLEX_EMAIL_IMPORT_REJECTED');
    receipt.observations.definition=request(state,4451,'/api/data/case-type/HarnessNestedPRL',{headers:observer.headers});save();
    assert.equal(receipt.observations.definition.status,200,'COMPLEX_EMAIL_DESCRIPTOR_FAILED');
    const descriptor=validateComplexEmailDefinition(receipt.observations.definition.body,variant);
    inspect(state);
    const raw=runDocker(['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_definition'],complexEmailMetadataSql(descriptor.version));
    inspect(state);assert(typeof raw==='string'&&Buffer.byteLength(raw)<16384,'COMPLEX_EMAIL_METADATA_RESPONSE');
    receipt.metadata=validateComplexEmailMetadata(JSON.parse(raw),{owner:state.owner,namespace:state.namespace,version:descriptor.version},variant);
    receipt.descriptor=descriptor;receipt.status='import-and-complex-metadata-observed';save();return receipt;
  } catch(error) {receipt.status='failed';save();throw error;}
}
