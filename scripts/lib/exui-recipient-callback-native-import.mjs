import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {digestBytes,writeJsonAtomic} from './exui-evidence-io.mjs';
import {CALLBACK_SCOPE,callbackCanonicalImport} from './exui-recipient-callback-contract.mjs';
import {prepareRecipientCallbackImport,importRecipientCallback,validateObservedRecipientCallback} from './exui-recipient-callback-import.mjs';
import {canonicalRecipientCallbackPages} from './exui-recipient-callback-fixture.mjs';
import {validateCallbackRowDescriptors,validateCallbackStoredDate,readCallbackStoredDate} from './exui-recipient-callback-facets.mjs';
import {ccdCredentials,ccdRequest,verifyCcdContainerIdentity} from './exui-ccd-runtime.mjs';
const nativeFile='recipient-callback-native-import.json';
const supportFile='recipient-callback-import/receipt.json';
const dateFile='recipient-callback-import/stored-row-date.json';
const regular=(root,name)=>{const file=path.join(root,name);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'CALLBACK_NATIVE_IMPORT_ALIAS');return fs.readFileSync(file);};
export function callbackNativeImportRecord(support,date,state,variant,supportDigest,dateDigest) {
 const expected=callbackCanonicalImport(variant);
 assert.equal(support.kind,'recipient-callback-import-feasibility','CALLBACK_NATIVE_SUPPORT_KIND');
 assert.equal(support.status,'import-and-callback-descriptor-observed','CALLBACK_NATIVE_IMPORT_STATUS');
 assert.equal(support.runtimeAcceptance,false,'CALLBACK_NATIVE_SUPPORT_CREDIT');assert.equal(support.catalogueCredit,false,'CALLBACK_NATIVE_SUPPORT_CREDIT');assert.equal(support.releaseCredit,false,'CALLBACK_NATIVE_SUPPORT_CREDIT');
 assert.deepEqual(support.seal,expected.seal,'CALLBACK_NATIVE_SEAL_MISMATCH');
 assert.equal(support.owner,state.owner,'CALLBACK_NATIVE_IMPORT_OWNER');assert.equal(support.namespace,state.namespace,'CALLBACK_NATIVE_IMPORT_NAMESPACE');assert.deepEqual(support.images,state.images,'CALLBACK_NATIVE_IMPORT_IMAGES');
 assert([200,201].includes(support.observations.import.status),'CALLBACK_NATIVE_IMPORT_STATUS');
 for(const name of ['definition','pages'])assert.equal(support.observations[name].status,200,'CALLBACK_NATIVE_DESCRIPTOR_STATUS');
 const definition=support.observations.definition.body,pages=support.observations.pages.body;
 validateObservedRecipientCallback(definition,pages,expected.binding,variant);
 const descriptor=validateCallbackRowDescriptors(definition,pages),version=definition.version.number;
 assert.deepEqual(date,validateCallbackStoredDate(date.rows,version),'CALLBACK_NATIVE_DATE_BINDING');
 assert(/^sha256:[a-f0-9]{64}$/.test(supportDigest)&&/^sha256:[a-f0-9]{64}$/.test(dateDigest),'CALLBACK_NATIVE_IMPORT_DIGEST');
 return {schemaVersion:1,kind:'native-recipient-callback-definition',releaseScopeId:CALLBACK_SCOPE,variant,owner:state.owner,namespace:state.namespace,images:state.images,fixtureDigest:expected.seal.workbookDigest,definitionVersion:version,observedDefinitionDigest:digestBytes(JSON.stringify(definition)),observedPagesDigest:digestBytes(JSON.stringify(canonicalRecipientCallbackPages(pages))),sourceBinding:expected.binding,materialAttributes:Object.keys(descriptor.expected.row).sort(),supportImportArtifact:{path:supportFile,digest:supportDigest},storedDateArtifact:{path:dateFile,digest:dateDigest},descriptorFacets:descriptor,datePreservation:date};
}
export function readNativeCallbackImport(root,state,variant) {
 const receipt=JSON.parse(regular(root,nativeFile));
 assert.equal(receipt.kind,'native-recipient-callback-definition','CALLBACK_NATIVE_IMPORT_REQUIRED');
 const support=regular(root,supportFile),date=regular(root,dateFile);
 assert.deepEqual(receipt,callbackNativeImportRecord(JSON.parse(support),JSON.parse(date),state,variant,digestBytes(support),digestBytes(date)),'CALLBACK_NATIVE_IMPORT_BINDING');
 return receipt;
}
export async function importNativeCallbackDefinition(state,variant='baseline',options={}) {
 assert(!fs.existsSync(path.join(state.output,nativeFile)),'CALLBACK_NATIVE_FRESH_IMPORT_REQUIRED');
 const fixtureDirectory=path.join(state.output,'callback-fixture');
 await prepareRecipientCallbackImport(fixtureDirectory,{variant,rowFacets:true});
 const support=await importRecipientCallback(state,{...options,fixtureDirectory,variant,rowFacets:true});
 const date=readCallbackStoredDate(state,support.observations.definition.body.version.number,options.dateTransport);
 const receipt=callbackNativeImportRecord(support,date,state,variant,digestBytes(regular(state.output,supportFile)),digestBytes(regular(state.output,dateFile)));
 writeJsonAtomic(path.join(state.output,nativeFile),receipt);
 return receipt;
}
export function verifyNativeCallbackRuntime(state,variant,{request=ccdRequest,inspectContainer,dateTransport}={}) {
 verifyCcdContainerIdentity(state,inspectContainer);
 const receipt=readNativeCallbackImport(state.output,state,variant);
 const observer=ccdCredentials(state,'observer',{request});
 for(const [name,route,key] of [['definition','/api/data/case-type/HarnessNestedPRL','observedDefinitionDigest'],['pages','/api/display/wizard-page-structure/case-types/HarnessNestedPRL/event-triggers/serviceOfDocuments','observedPagesDigest']]){
  const response=request(state,4451,route,{headers:observer.headers});assert.equal(response.status,200,'CALLBACK_NATIVE_DESCRIPTOR_STATUS');
  assert.equal(digestBytes(JSON.stringify(name==='pages'?canonicalRecipientCallbackPages(response.body):response.body)),receipt[key],'CALLBACK_NATIVE_DESCRIPTOR_DRIFT');
 }
 const date=readCallbackStoredDate(state,receipt.definitionVersion,dateTransport);
 assert.deepEqual(date,receipt.datePreservation,'CALLBACK_NATIVE_DATE_DRIFT');
 verifyCcdContainerIdentity(state,inspectContainer);
 return receipt;
}
