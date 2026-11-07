exports.descriptorPacket=async variant=>{
  const {deriveMandatoryEmailEventRows}=await import('../lib/exui-mandatory-email-event-rows.mjs');
  const derivation=deriveMandatoryEmailEventRows(variant);
  const case_fields_complex=derivation.binding.rows.map(r=>({reference:r.normalizedRow.ListElementCode,label:'',order:Number(r.normalizedRow.FieldDisplayOrder),displayContext:r.normalizedRow.DisplayContext,showCondition:r.normalizedRow.FieldShowCondition}));
  return{derivation,definition:{id:'HarnessNestedPRL',version:{number:3},events:[{id:'serviceOfDocuments',case_fields:[{case_field_id:'sodAdditionalRecipientsList',case_fields_complex}]}],case_fields:[{id:'sodAdditionalRecipientsList',field_type:{type:'Collection',collection_field_type:{id:'ServeOrgDetails',complex_fields:[{id:'emailInformation',field_type:{id:'EmailInformation',complex_fields:[{id:'emailName',label:'Name',field_type:{type:'Text'}},{id:'emailAddress',label:'Email address',field_type:{type:'Text'}}]}}]}}}]},pages:{case_type_id:'HarnessNestedPRL',event_id:'serviceOfDocuments',wizard_pages:[{id:'serviceOfDocuments2',order:2,callback_url_mid_event:null,wizard_page_fields:[{case_field_id:'sodAdditionalRecipientsList',order:8}]}]}};
};
exports.rawPacket=async(root,variant)=>{
  const fs=require('node:fs'),path=require('node:path');
  const {prepareRecipientCallbackImport}=await import('../lib/exui-recipient-callback-import.mjs');
  const {captureMandatoryEmailPrepared,mandatoryEmailRawFiles}=await import('../lib/exui-mandatory-email-event-evidence.mjs');
  const {validateMandatoryEmailDescriptors}=await import('../lib/exui-mandatory-email-event-facets.mjs');
  const {digestBytes}=await import('../lib/exui-evidence-io.mjs');
  const {packet}=require('./exui-mandatory-email-event-observation.mock.cjs');
  const x=await exports.descriptorPacket(variant),owner='synthetic-mandatory-owner',namespace='a'.repeat(64),images={definition:{id:'sha256:'+'b'.repeat(64)}};
  const directory=path.join(root,variant);fs.mkdirSync(directory,{mode:0o700});
  const seal=await prepareRecipientCallbackImport(directory+'/fixture',{variant:'binding-omitted',rowFacets:true,mandatoryEmailEventVariant:variant});
  const rows=['emailInformation.emailAddress','emailInformation.emailName'].map(reference=>({case_type:'HarnessNestedPRL',version:3,event:'serviceOfDocuments',field:'sodAdditionalRecipientsList',reference,live_from:'2024-09-01',sql_type:'date'}));
  const date={rows,owner,namespace,images};
  const facets={descriptor:validateMandatoryEmailDescriptors(x.definition,x.pages,x.derivation),date};
  const selected=variant==='baseline'?['name','address']:[variant.split('-')[0]],journal=[];let proof;
  const observations=[];
  for(const [index,row]of selected.entries()){
    proof=await packet(variant,row);const observation=proof.observed;
    if(index===1)for(const control of [observation.filled,observation.empty]){
      const old=control.caseId,id=String(BigInt(old)+2n);control.caseId=id;control.before.state.id=id;control.after.state.id=id;
      if(control.submission)control.submission.path=control.submission.path.replace(old,id);
      if(control.path)control.path=control.path.replace(old,id);
    }
    observations.push(observation);
    // Match the awaited journey: filled trigger/save precede the empty case trigger.
    for(const c of [observation.filled,observation.empty]){
      journal.push({method:'GET',path:`/data/internal/cases/${c.caseId}/event-triggers/serviceOfDocuments`,status:200,actorId:proof.actorId});
      if(c===observation.filled||variant!=='baseline')journal.push({method:'POST',path:`/data/cases/${c.caseId}/events`,status:201,actorId:proof.actorId});
    }
  }
  const input={kind:'mandatory-email-event-ui-feasibility',scenario:'mandatory-email-event',variant,mandatoryEmailEventBinding:x.derivation.binding,mandatoryEmailEventFacets:facets,credentials:{courtadmin:{userId:proof.actorId,roles:['caseworker','caseworker-harness','caseworker-privatelaw-courtadmin']}},ccd:{owner,namespace,images}};
  const write=(name,value)=>{fs.mkdirSync(path.dirname(directory+'/'+name),{recursive:true,mode:0o700});fs.writeFileSync(directory+'/'+name,JSON.stringify(value)+'\n',{mode:0o600});};
  write('input.json',input);write('runtime/recipient-callback-import/receipt.json',{status:'import-and-callback-descriptor-observed',seal,owner,namespace,images,runtimeAcceptance:false,catalogueCredit:false,releaseCredit:false,observations:{import:{status:201},definition:{status:200,body:x.definition},pages:{status:200,body:x.pages}}});
  write('runtime/recipient-callback-import/mandatory-email-stored-dates.json',date);
  const held=captureMandatoryEmailPrepared(directory);
  write('baseline/report.json',proof.report);write('baseline/framework-terminal.json',proof.terminal);
  for(const o of observations)write(`baseline/mandatory-email-${o.row}-observation.json`,o);
  fs.writeFileSync(directory+'/baseline/ccd-requests.jsonl',journal.map(r=>JSON.stringify(r)+'\n').join(''),{mode:0o600});
  const files=Object.fromEntries(mandatoryEmailRawFiles(variant).map(name=>[name,digestBytes(fs.readFileSync(directory+'/'+name))]));
  return{directory,expected:{variant,derivation:x.derivation,actorId:proof.actorId,owner,namespace,images,definitionVersion:3,terminal:proof.terminal,held,files},observations};
};
