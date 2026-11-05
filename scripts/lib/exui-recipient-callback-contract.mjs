import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digestBytes} from './exui-evidence-io.mjs';
import {deriveRecipientCallbackImport} from './exui-recipient-callback-fixture.mjs';
export {CALLBACK_SCOPE} from './exui-recipient-callback-fixture.mjs';
export const CALLBACK_PHASE='recipientCallback';
export const CALLBACK_OBLIGATION='configuration-shape:4872034ffec23e993a49315123c3a22472baf5411d8010f31d3d01644f23cd94';
export const CALLBACK_PROOF='callback-recipient-row';
export const CALLBACK_MUTATION='ccd-omit-recipient-mid-event';
export const CALLBACK_MUTANT_PROOF='callback-recipient-binding-omitted';
export const CALLBACK_FAILURE='recipient-callback-binding';
export const CALLBACK_ATTRIBUTES=Object.freeze(['LiveFrom','CaseTypeID','CaseEventID','CaseFieldID','DisplayContext','PageID','PageDisplayOrder','PageFieldDisplayOrder','ShowSummaryChangeOption','FieldShowCondition','CallBackURLMidEvent'].sort());
export const callbackVariant=id=>{assert(['baseline',CALLBACK_MUTATION].includes(id),'CALLBACK_NATIVE_INVOCATION');return id==='baseline'?'baseline':'binding-omitted';};
export function callbackCanonicalImport(variant='baseline') {
  const baseline=deriveRecipientCallbackImport('baseline',true);
  const row=baseline.fixture.sheets.CaseEventToFields.filter(row=>row.CaseFieldID===baseline.binding.fieldId&&row.CaseEventID===baseline.binding.eventId);
  assert.equal(row.length,1,'CALLBACK_NATIVE_SOURCE_ROW');
  assert.deepEqual(Object.keys(row[0]).sort(),CALLBACK_ATTRIBUTES,'CALLBACK_NATIVE_UNCLASSIFIED_FACET');
  const {fixture,binding}=deriveRecipientCallbackImport(variant,true);
  const definition=Buffer.from(JSON.stringify(fixture,null,2)+'\n');
  const root=fileURLToPath(new URL(`../fixtures/ccd/recipient-callback-native/${variant}/`,import.meta.url));
  const read=name=>{const file=path.join(root,name);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'CALLBACK_NATIVE_FIXTURE_ALIAS');return fs.readFileSync(file);};
  assert.deepEqual(read('definition.json'),definition,'CALLBACK_NATIVE_SOURCE_DEFINITION');
  const workbook=read('definition.xlsx');
  const seal={schemaVersion:1,kind:'recipient-callback-import',rowFacets:true,syntheticPredecessor:'protectedValue:READONLY:serviceOfDocumentsharnessBefore:order1',...(variant==='binding-omitted'?{variant,mutation:'omit-page2-mid-event-binding'}:{}),binding,definitionDigest:digestBytes(definition),workbookDigest:digestBytes(workbook),runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
  assert.deepEqual(read('binding.json'),Buffer.from(JSON.stringify(seal,null,2)+'\n'),'CALLBACK_NATIVE_SOURCE_SEAL');
  return {fixture,binding,definition,workbook,seal};
}
export function callbackMutationContract() {
  const before=callbackCanonicalImport(),after=callbackCanonicalImport('binding-omitted');
  const expected=structuredClone(before.fixture);
  delete expected.sheets.CaseEventToFields.find(row=>row.CaseFieldID===before.binding.fieldId&&row.CaseEventID===before.binding.eventId).CallBackURLMidEvent;
  assert.deepEqual(after.fixture,expected,'CALLBACK_NATIVE_SINGLE_CELL_REQUIRED');
  return {target:before.binding.sourcePath,sourceRowDigest:before.binding.sourceRowDigest,column:'CallBackURLMidEvent',before:before.binding.normalizedUrl,after:null,beforeDigest:before.seal.workbookDigest,afterDigest:after.seal.workbookDigest};
}
