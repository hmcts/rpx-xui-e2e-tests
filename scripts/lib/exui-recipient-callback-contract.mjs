import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {digestBytes} from './exui-evidence-io.mjs';
import {deriveRecipientCallbackImport} from './exui-recipient-callback-fixture.mjs';
export const CALLBACK_SCOPE='exui-ccd-recipient-callback-pilot';
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
  const temporary=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'callback-native-workbook-'));
  try {
    const source=path.join(temporary,'definition.json'),output=path.join(temporary,'definition.xlsx');
    fs.writeFileSync(source,definition,{mode:0o600});
    const result=spawnSync('python3',[fileURLToPath(new URL('../fixtures/ccd/workbook.py',import.meta.url)),source,output],{encoding:'utf8',timeout:30000,maxBuffer:1048576});
    assert(!result.error&&result.status===0,'CALLBACK_NATIVE_WORKBOOK');
    const workbook=fs.readFileSync(output);
    const seal={schemaVersion:1,kind:'recipient-callback-import',rowFacets:true,syntheticPredecessor:'protectedValue:READONLY:serviceOfDocumentsharnessBefore:order1',...(variant==='binding-omitted'?{variant,mutation:'omit-page2-mid-event-binding'}:{}),binding,definitionDigest:digestBytes(definition),workbookDigest:digestBytes(workbook),runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
    return {fixture,binding,definition,workbook,seal};
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}
export function callbackMutationContract() {
  const before=callbackCanonicalImport(),after=callbackCanonicalImport('binding-omitted');
  const expected=structuredClone(before.fixture);
  delete expected.sheets.CaseEventToFields.find(row=>row.CaseFieldID===before.binding.fieldId&&row.CaseEventID===before.binding.eventId).CallBackURLMidEvent;
  assert.deepEqual(after.fixture,expected,'CALLBACK_NATIVE_SINGLE_CELL_REQUIRED');
  return {target:before.binding.sourcePath,sourceRowDigest:before.binding.sourceRowDigest,column:'CallBackURLMidEvent',before:before.binding.normalizedUrl,after:null,beforeDigest:before.seal.workbookDigest,afterDigest:after.seal.workbookDigest};
}
