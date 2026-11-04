import assert from "node:assert/strict";
import { callbackFailureCode } from "./exui-recipient-callback-diagnostics.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { deriveRecipientCallbackImport } from "./exui-recipient-callback-fixture.mjs";
import { assertFreshCandidateDerivationOutput } from "./exui-candidate-artifact.mjs";
import { digestBytes } from "./exui-evidence-io.mjs";
import { ccdCredentials, ccdRequest, verifyCcdContainerIdentity, validateCcdDefinition } from "./exui-ccd-runtime.mjs";
const fixtureRoot = fileURLToPath(new URL("../fixtures/ccd/", import.meta.url));
export async function prepareRecipientCallbackImport(output,{variant="baseline",rowFacets=false}={}) {
  assert(["baseline","binding-omitted"].includes(variant),"CALLBACK_IMPORT_VARIANT_REQUIRED");
  const derivative = deriveRecipientCallbackImport(variant,rowFacets);
  const destination = await assertFreshCandidateDerivationOutput({ baseline: { candidateRoot: fixtureRoot }, manifestPath: path.join(fixtureRoot,"event-capability.source.json"), output });
  fs.mkdirSync(destination, {mode:0o700});
  const definition = path.join(destination,"definition.json"), workbook = path.join(destination,"definition.xlsx");
  fs.writeFileSync(definition,JSON.stringify(derivative.fixture,null,2)+"\n",{flag:"wx",mode:0o600});
  const result=spawnSync("python3",[path.join(fixtureRoot,"workbook.py"),definition,workbook],{encoding:"utf8",timeout:30000,maxBuffer:1024*1024});
  assert(!result.error&&result.status===0,"CALLBACK_WORKBOOK_FAILED");fs.chmodSync(workbook,0o600);
  const seal={schemaVersion:1,kind:"recipient-callback-import",...(rowFacets?{rowFacets:true,syntheticPredecessor:"protectedValue:READONLY:serviceOfDocumentsharnessBefore:order1"}:{}),...(variant==="binding-omitted"?{variant,mutation:"omit-page2-mid-event-binding"}:{}),binding:derivative.binding,definitionDigest:digestBytes(fs.readFileSync(definition)),workbookDigest:digestBytes(fs.readFileSync(workbook)),runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
  fs.writeFileSync(path.join(destination,"binding.json"),JSON.stringify(seal,null,2)+"\n",{flag:"wx",mode:0o600});
  return seal;
}
// Schema reference: definition-store c37c9b84, DisplayApiController and WizardPage(Collection).
// Source reference is not assumed to identify the retained image; unknown shapes fail.
export function validateObservedRecipientCallback(definition, pages, binding, variant="baseline") {
  assert(["baseline","binding-omitted"].includes(variant),"CALLBACK_IMPORT_VARIANT_REQUIRED");
  assert.equal(definition?.id,"HarnessNestedPRL","CALLBACK_IMPORTED_CASE_TYPE");
  assert(Number.isInteger(definition?.version?.number),"CALLBACK_IMPORTED_VERSION");
  validateCcdDefinition(definition);
  assert.equal(pages?.case_type_id,"HarnessNestedPRL","CALLBACK_PAGE_CASE_TYPE");
  assert.equal(pages?.event_id,binding.eventId,"CALLBACK_PAGE_EVENT");
  assert(Array.isArray(pages.wizard_pages),"CALLBACK_PAGE_SCHEMA");
  // AbstractDisplayGroupParser (c37c9b84) groups by eventId + source PageID,
  // then persists that key as the group reference; confirmed by real descriptor.
  const selected=pages.wizard_pages.filter(page=>page.id===binding.eventId+String(binding.pageId));
  assert.equal(selected.length,1,"CALLBACK_PAGE_REQUIRED");
  assert(Array.isArray(selected[0].wizard_page_fields) && selected[0].wizard_page_fields.filter(field => field.case_field_id === binding.fieldId).length === 1,"CALLBACK_PAGE_FIELD_REQUIRED");
  if(variant==="baseline")assert.equal(selected[0].callback_url_mid_event,binding.normalizedUrl,"CALLBACK_PAGE_URL");
  else assert(selected[0].callback_url_mid_event==null||selected[0].callback_url_mid_event==="","CALLBACK_PAGE_URL");
  assert(pages.wizard_pages.filter(page=>page.callback_url_mid_event).length===(variant==="baseline"?1:0),"CALLBACK_EXTRA_PAGE_ENDPOINT");
  // A mid-event derivative must not silently gain an event-stage callback.
  assert(Array.isArray(definition.events),"CALLBACK_EVENTS_SCHEMA");
  for(const event of definition.events) for(const [key,value] of Object.entries(event))
    if(/callback/i.test(key)) assert(value==null||value==="","CALLBACK_UNEXPECTED_EVENT_STAGE");
}
export async function importRecipientCallback(state,{fixtureDirectory,request=ccdRequest,inspectContainer,variant="baseline",rowFacets=false}={}) {
  assert(typeof fixtureDirectory==="string","CALLBACK_IMPORT_DIRECTORY_REQUIRED");
  const temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),"callback-import-canonical-"));
  let seal,workbook;
  try {
    const canonical=path.join(temp,"definition"); await prepareRecipientCallbackImport(canonical,{variant,rowFacets});
    for(const file of ["definition.json","definition.xlsx","binding.json"])
      assert.deepEqual(fs.readFileSync(path.join(fixtureDirectory,file)),fs.readFileSync(path.join(canonical,file)),"CALLBACK_IMPORT_SEAL_MISMATCH");
    seal=JSON.parse(fs.readFileSync(path.join(canonical,"binding.json")));workbook=fs.readFileSync(path.join(canonical,"definition.xlsx"));
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
  verifyCcdContainerIdentity(state,inspectContainer);
  const output=path.join(state.output,"recipient-callback-import");fs.mkdirSync(output,{mode:0o700});
  const receipt={schemaVersion:1,kind:"recipient-callback-import-feasibility",caseType:"HarnessNestedPRL",seal,owner:state.owner,namespace:state.namespace,images:state.images,status:"in-progress",observations:{},runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false};
  const save=()=>fs.writeFileSync(path.join(output,"receipt.json"),JSON.stringify(receipt,null,2)+"\n",{mode:0o600});save();
  try {
    const observer=ccdCredentials(state,"observer",{request});
    for(const role of ["caseworker","caseworker-harness","caseworker-harness-allowed","caseworker-harness-observer","caseworker-harness-denied","ccd-import","caseworker-privatelaw-courtadmin","caseworker-privatelaw-judge","caseworker-privatelaw-readonly"]){
      const response=request(state,4451,"/api/user-role",{method:"PUT",headers:observer.headers,body:{role,security_classification:"PUBLIC"}});
      assert([200,201,205].includes(response.status),"CALLBACK_IMPORT_ROLE_FAILED");
    }
    receipt.observations.import=request(state,4451,"/import",{method:"POST",headers:observer.headers,file:workbook.toString("base64")});save();
    assert([200,201].includes(receipt.observations.import.status),"CALLBACK_IMPORT_REJECTED");
    for(const [name,route] of [["definition","/api/data/case-type/HarnessNestedPRL"],["pages","/api/display/wizard-page-structure/case-types/HarnessNestedPRL/event-triggers/serviceOfDocuments"]]){
      receipt.observations[name]=request(state,4451,route,{headers:observer.headers});save();
      assert.equal(receipt.observations[name].status,200,"CALLBACK_IMPORT_READBACK_FAILED");
    }
    validateObservedRecipientCallback(receipt.observations.definition.body,receipt.observations.pages.body,seal.binding,variant);
    receipt.status="import-and-callback-descriptor-observed";save();return receipt;
  } catch(error){receipt.status="failed";receipt.failure=callbackFailureCode(error);save();throw error;}
}
