import assert from 'node:assert/strict';
import fs from 'node:fs';
import { digestBytes } from './exui-evidence-io.mjs';
import { buildSharedPolicyContracts } from './exui-shared-policy-contracts.mjs';
import { validateEventCapabilitySource, EVENT_CAPABILITY_SOURCE_DIGEST } from './exui-ccd-event-capability.mjs';

import {SHARED_NESTED_ID,SHARED_NESTED_CONTRACT_DIGEST} from './exui-shared-nested-scope.mjs';
export {SHARED_NESTED_SCOPE,SHARED_NESTED_ID,SHARED_NESTED_MUTATIONS,SHARED_NESTED_FAULT,SHARED_NESTED_PROOF,SHARED_NESTED_FACETS} from './exui-shared-nested-scope.mjs';
export const sharedNestedContract=()=>buildSharedPolicyContracts().find(row=>row.id===SHARED_NESTED_ID);
const read = name => fs.readFileSync(new URL('../fixtures/ccd/'+name,import.meta.url));
const sortRows = rows => rows.toSorted((a,b)=>JSON.stringify([a.ID,a.CaseFieldID,a.ListElementCode]).localeCompare(JSON.stringify([b.ID,b.CaseFieldID,b.ListElementCode])));
export function bindSharedNestedSourceFixture(fixture = JSON.parse(read('nested-prl.json')), source = JSON.parse(read('event-capability.source.json'))) {
  assert.equal(digestBytes(JSON.stringify(sharedNestedContract())),SHARED_NESTED_CONTRACT_DIGEST,'SHARED_NESTED_CONTRACT_CHANGED');
  validateEventCapabilitySource(source);
  const sourceRows = suffix => source.sources.find(row=>row.path.endsWith(suffix)).rows.map(row=>row.row);
  const types = ['ServeOrgDetails','EmailInformation','PostalInformation'];
  const complex = sourceRows('ComplexTypes/ManageOrders/OrderDetails/ComplexTypes.json').filter(row=>types.includes(row.ID));
  assert.deepEqual(sortRows(fixture.sheets.ComplexTypes),sortRows(complex),'SHARED_NESTED_SOURCE_TYPES');
  const field = sourceRows('CaseField/ServiceOfDocuments/CaseField.json').find(row=>row.ID==='sodAdditionalRecipientsList');
  assert.deepEqual(fixture.sheets.CaseField.find(row=>row.ID===field.ID),{...field,CaseTypeID:'HarnessNestedPRL'},'SHARED_NESTED_SOURCE_COLLECTION');
  const original = sourceRows('CaseEventToComplexTypes/ServiceOfDocuments/AdditionalRecipients/CaseEventToComplexTypes.json');
  for (const event of ['create','update']) {
    const expected=original.map(row=>({...row,CaseTypeID:'HarnessNestedPRL',CaseEventID:event}));
    assert.deepEqual(sortRows(fixture.sheets.EventToComplexTypes.filter(row=>row.CaseEventID===event)),sortRows(expected),'SHARED_NESTED_SOURCE_OVERRIDES');
  }
  assert.deepEqual(sortRows(fixture.sheets.FixedLists),sortRows(sourceRows('FixedLists.json').filter(row=>row.ID==='DeliveryByEnum')),'SHARED_NESTED_SOURCE_CHOICES');
  const binding=JSON.parse(read('nested-prl.binding.json'));
  assert.equal(digestBytes(read('nested-prl.json')),binding.sourceDigest,'SHARED_NESTED_FIXTURE_SEAL');
  assert.equal(digestBytes(read('nested-prl.xlsx')),binding.workbookDigest,'SHARED_NESTED_WORKBOOK_SEAL');
  return {sourceRevision:source.revision,sourceProjectionDigest:EVENT_CAPABILITY_SOURCE_DIGEST,fixtureDigest:binding.sourceDigest,workbookDigest:binding.workbookDigest,normalization:'HARNESS/HarnessNestedPRL; synthetic create/update and ACLs; source child types, labels, order and conditions retained; source page2 selector/business callback excluded'};
}
export function sharedNestedValues(channel,count) {
  assert(['email','post'].includes(channel)&&[1,2].includes(count),'SHARED_NESTED_SHAPE');
  return Array.from({length:count},(_,index)=>({serveByPostOrEmail:channel,...(channel==='email'?{emailInformation:{emailName:`Synthetic nested ${count} email ${index+1}`,emailAddress:`nested-${count}-${index+1}@harness.example.com`}}:{postalInformation:{postalName:`Synthetic nested ${count} post ${index+1}`,postalAddress:{AddressLine1:`Synthetic nested street ${index+1}`,AddressLine2:`Synthetic nested suite ${index+1}`,AddressLine3:`Synthetic nested third ${count}-${index+1}`,PostTown:`Synthetic nested town ${index+1}`,County:`Synthetic nested county ${index+1}`,PostCode:index?'M1 1AA':'SW1A 1AA',Country:'United Kingdom'}}})}));
}

export function assertSharedNestedObservedDefinition(observed) {
  bindSharedNestedSourceFixture();
  const fixture=JSON.parse(read('nested-prl.json'));
  assert.equal(observed.id,'HarnessNestedPRL','SHARED_NESTED_OBSERVED_TYPE');
  const roots=observed.case_fields.filter(row=>row.id==='sodAdditionalRecipientsList');
  assert.equal(roots.length,1,'SHARED_NESTED_OBSERVED_COLLECTION');
  assert.equal(roots[0].label,'Recipient','SHARED_NESTED_OBSERVED_LABEL');
  assert.equal(roots[0].field_type.type,'Collection','SHARED_NESTED_OBSERVED_COLLECTION');
  const types=new Map();
  const visit=type=>{if(!type)return;types.set(type.id,type);for(const field of type.complex_fields??[])visit(field.field_type);};
  visit(roots[0].field_type.collection_field_type);
  for(const id of ['ServeOrgDetails','EmailInformation','PostalInformation']) {
    const type=types.get(id),source=fixture.sheets.ComplexTypes.filter(row=>row.ID===id);
    assert(type&&type.type==='Complex','SHARED_NESTED_OBSERVED_COMPLEX');
    assert.deepEqual(type.complex_fields.map(row=>row.id).sort(),source.map(row=>row.ListElementCode).sort(),'SHARED_NESTED_OBSERVED_CHILDREN');
    for(const expected of source) {
      const field=type.complex_fields.find(row=>row.id===expected.ListElementCode);
      assert.equal(field.label,(expected.ElementLabel??'').trim(),'SHARED_NESTED_OBSERVED_LABEL');
      const typeId=expected.FieldTypeParameter?`${expected.FieldType}-${expected.FieldTypeParameter}`:expected.FieldType;
      assert.equal(field.field_type.id,typeId,'SHARED_NESTED_OBSERVED_FIELD_TYPE');
    }
  }
  const choices=types.get('FixedRadioList-DeliveryByEnum').fixed_list_items;
  assert.deepEqual(choices.map(row=>({code:row.code,label:row.label})),fixture.sheets.FixedLists.map(row=>({code:row.ListElementCode,label:row.ListElement})),'SHARED_NESTED_OBSERVED_CHOICES');
  for(const eventId of ['create','update']) {
    const event=observed.events.find(row=>row.id===eventId);assert(event,'SHARED_NESTED_OBSERVED_EVENT');
    assert.equal(event.show_summary,true,'SHARED_NESTED_OBSERVED_SUMMARY');
    const root=event.case_fields.find(row=>row.case_field_id==='sodAdditionalRecipientsList');
    assert.equal(root.display_context,'COMPLEX','SHARED_NESTED_OBSERVED_CONTEXT');
    assert.equal(root.show_summary_change_option,true,'SHARED_NESTED_OBSERVED_CHANGE');
    const rows=fixture.sheets.EventToComplexTypes.filter(row=>row.ID==='ServeOrgDetails'&&row.CaseEventID===eventId);
    assert.equal(root.case_fields_complex.length,rows.length,'SHARED_NESTED_OBSERVED_OVERRIDE_SELECTION');
    for(const expected of rows) {
      const matches=root.case_fields_complex.filter(row=>row.reference===expected.ListElementCode);assert.equal(matches.length,1,'SHARED_NESTED_OBSERVED_REFERENCE');
      assert.deepEqual({label:matches[0].label,order:matches[0].order,context:matches[0].displayContext,condition:matches[0].showCondition??null},{label:expected.EventElementLabel.trim(),order:Number(expected.FieldDisplayOrder),context:expected.DisplayContext,condition:expected.FieldShowCondition??null},'SHARED_NESTED_OBSERVED_OVERRIDE');
    }
  }
  return {caseType:observed.id,version:observed.version.number,source:bindSharedNestedSourceFixture(),opaqueDependencies:['AddressUK underlying type source equivalence is not asserted; actual control/payload/persistence is exercised']};
}

