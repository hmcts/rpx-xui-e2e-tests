import assert from 'node:assert/strict';
import fs from 'node:fs';
import { digestBytes } from './exui-evidence-io.mjs';
import { deriveSelectorEventRowFixture } from './exui-selector-event-row-contract.mjs';
export const PERSONAL_SERVICE_ID = 'configuration-shape:9ac2fb1c2dec3b07cd2dfb2bafcb2aa9fd4a0adfe8745e202e5616335f291df8';
export const PERSONAL_SERVICE_VARIANTS = Object.freeze(['baseline', 'optional']);
export const PERSONAL_SERVICE_LABEL = 'Does this document need to be personally served on the respondent?';
export const PERSONAL_SERVICE_FAILURE = 'PERSONAL_SERVICE_REQUIRED_ANSWER';
export const PERSONAL_SERVICE_FIELD = 'sodServeToRespondentOptions';
export const PERSONAL_SERVICE_OPTIONS = Object.freeze([{code:'Yes',label:'Yes',order:1},{code:'No',label:'No',order:2},{code:'NotApplicable',label:'Not applicable',order:3}]);
const sourceDigest = 'sha256:17a534edb9ab49d36958f72e502d3bc5752a58b9621fa6dea0a6244f99e1b79c';
const sourceRow = Object.freeze({LiveFrom:'01/09/2024',CaseTypeID:'PRLAPPS',CaseEventID:'serviceOfDocuments',CaseFieldID:PERSONAL_SERVICE_FIELD,DisplayContext:'MANDATORY',PageID:2,PageDisplayOrder:2,PageFieldDisplayOrder:2,ShowSummaryChangeOption:'Y'});
export const PERSONAL_SERVICE_ATTRIBUTES = Object.freeze(Object.keys(sourceRow).sort());
export function personalServiceRow(fixture) {
 const rows=fixture.sheets.CaseEventToFields.filter(r=>r.CaseEventID==='serviceOfDocuments'&&r.CaseFieldID===PERSONAL_SERVICE_FIELD);
 assert.equal(rows.length,1,'PERSONAL_SERVICE_EXACT_ROW');return rows[0];
}
export function derivePersonalServiceFixture(variant='baseline') {
 assert(PERSONAL_SERVICE_VARIANTS.includes(variant),'PERSONAL_SERVICE_VARIANT');
 const bytes=fs.readFileSync(new URL('../fixtures/ccd/personal-service.source.json',import.meta.url));
 assert.equal(digestBytes(bytes),sourceDigest,'PERSONAL_SERVICE_SOURCE_BYTES');
 const source=JSON.parse(bytes),[event,field,list]=source.sources;
 assert.equal(source.revision,'694b9951e94369f1394380506960c4f04f25755d','PERSONAL_SERVICE_SOURCE_REVISION');
 assert.deepEqual(event.rows.map(x=>x.row),[sourceRow],'PERSONAL_SERVICE_SOURCE_ROW');
 const catalogue=JSON.parse(fs.readFileSync(new URL('../fixtures/exui-configuration-source.json',import.meta.url),'utf8'));
 for(const item of [event,field]) {
  const matches=catalogue.sources.filter(x=>x.repository==='prl-ccd-definitions'&&x.path===item.path);
  assert.equal(matches.length,1,'PERSONAL_SERVICE_CATALOGUE_SOURCE');
  assert.equal(matches[0].revision,source.revision,'PERSONAL_SERVICE_CATALOGUE_REVISION');
  assert.equal('sha256:'+matches[0].fileDigest,item.fileDigest,'PERSONAL_SERVICE_CATALOGUE_DIGEST');
  for(const selected of item.rows)assert.deepEqual(matches[0].document[selected.index],selected.row,'PERSONAL_SERVICE_CATALOGUE_ROW');
 }
 const derivative=deriveSelectorEventRowFixture(),fixture=derivative.fixture;
 // A declared synthetic read-only summary control proves CYA stays healthy.
 fixture.sheets.CaseEventToFields.find(r=>r.CaseEventID==='serviceOfDocuments'&&r.CaseFieldID==='protectedValue').ShowSummaryChangeOption='Y';
 assert(!fixture.sheets.CaseField.some(r=>r.ID===PERSONAL_SERVICE_FIELD),'PERSONAL_SERVICE_DUPLICATE_FIELD');
 assert(!fixture.sheets.FixedLists.some(r=>r.ID==='YesNoNotApplicable'),'PERSONAL_SERVICE_DUPLICATE_LIST');
 fixture.sheets.CaseField.push({...field.rows[0].row,CaseTypeID:'HarnessNestedPRL'});
 fixture.sheets.FixedLists.push(...list.rows.map(x=>structuredClone(x.row)));
 fixture.sheets.CaseEventToFields.push({...sourceRow,CaseTypeID:'HarnessNestedPRL'}, {...sourceRow,CaseTypeID:'HarnessNestedPRL',CaseEventID:'create',DisplayContext:'OPTIONAL'});
 // Synthetic bootstrap/observer permissions are support, not source ACL credit.
 fixture.sheets.AuthorisationCaseField.push(...fixture.sheets.AuthorisationCaseField.filter(r=>r.CaseFieldID==='sodAdditionalRecipients').map(r=>({...r,CaseFieldID:PERSONAL_SERVICE_FIELD})));
 if(variant==='optional')personalServiceRow(fixture).DisplayContext='OPTIONAL';
 return {fixture,callbackBinding:derivative.callbackBinding,binding:{schemaVersion:1,kind:'personal-service-source-binding',obligationId:PERSONAL_SERVICE_ID,variant,sourceRepository:source.repository,sourceRevision:source.revision,sourcePath:event.path,sourceFileDigest:event.fileDigest,sourceRowDigest:event.rows[0].rowDigest,sourceIndex:event.rows[0].index,sourceSnapshotDigest:sourceDigest,sourceAttributes:PERSONAL_SERVICE_ATTRIBUTES,caseType:'HarnessNestedPRL',sourceCaseType:'PRLAPPS',eventId:'serviceOfDocuments',fieldId:PERSONAL_SERVICE_FIELD,pageId:'serviceOfDocuments2',pageOrder:2,fieldOrder:2,liveFrom:'2024-09-01',supportingSources:[field,list].map(s=>({path:s.path,fileDigest:s.fileDigest,rows:s.rows.map(r=>({index:r.index,rowDigest:r.rowDigest}))})),supportingContext:'controlled-predecessor-selector-bootstrap-acl-no-business-callbacks',activationClaim:false,sourceComplete:false,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false}};
}
export function validatePersonalServiceFixture(value,variant) {assert.deepEqual(value,derivePersonalServiceFixture(variant),'PERSONAL_SERVICE_CANONICAL_FIXTURE');return value.binding;}
