import { readStoredSourceShapeDates, assertStoredSourceShapeDates } from './exui-source-shape-dates.mjs';
import { SOURCE_SHAPE_ROWS, validateSourceShapeFault, assertObservedSourceShape } from './exui-source-shape-contract.mjs';
import {verifyLocalCcdRuntimeProfile,assertLocalCcdRuntimeScope} from './exui-local-ccd-runtime-profile.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import {
  validateEventCapabilityPair,
  validateCourtadminReadPair,
  COURTADMIN_READ_MUTATION,
  READONLY_READ_MUTATION,
  READONLY_UPDATE_MUTATION,
  COURTADMIN_UPDATE_MUTATION,
  validateCourtadminUpdatePair,
  validateReadonlyUpdatePair,
  validateReadonlyReadPair,
  EVENT_CAPABILITY_SCOPE,
  EVENT_CAPABILITY_MUTATION,
  EVENT_CAPABILITY_SOURCE_DIGEST,
  EVENT_CAPABILITY_PROOFS,
} from "./exui-ccd-event-capability.mjs";

export const CCD_IMAGES = {
 data:'sha256:230af88ec4791950396e7a78f2dc330018d1a259242e317f4374ec5a384d30c0',
 definition:'sha256:4c6b17b06d347d650fb8d26542716e1d723b7c8b8d44eee69908299cc8f4af52',
 profile:'sha256:bc8b584e7e8cfd043211a4940b8c4777a7df3cae6f36fa328e2a5ef8880b0cc3',
 s2s:'sha256:beb0c921e1c42151e24f7a8957c52c382ee41189ba015ba0cd681f582cff7117',
 idam:'sha256:c52d1d8891a215c5358640f8e17754fd828789c5bc3a87ba5ebb1c49341e253f',
 database:'sha256:19edba91a88d4a3d532e11d16c8cfa4b0e26e67d1b90467220cd5672c6cbd0f7',
 client:'sha256:c0122351f25f04facee976f9db7214789eabadb489f4e4aea9cd00a0d6af77c4'
};
export function ccdImagePins(platform = 'linux/arm64', { elasticsearch = false } = {}) {
  assert.equal(typeof elasticsearch, 'boolean', 'CCD_ELASTICSEARCH_SELECTION_REQUIRED');
  assert(['linux/arm64', 'linux/amd64'].includes(platform), 'UNSUPPORTED_CCD_PLATFORM');
  const pins = platform === 'linux/arm64'
    ? Object.fromEntries(
      Object.entries(CCD_IMAGES).map(([name, image]) => [
        name,
        { reference: image, manifestDigest: image },
      ]),
    )
    : JSON.parse(
    fs.readFileSync(
      new URL('../fixtures/ccd/linux-amd64-images.json', import.meta.url),
    ),
  );
  assert.deepEqual(
    Object.keys(pins).sort(),
    Object.keys(CCD_IMAGES).sort(),
    'CCD_IMAGE_PROFILE_INVENTORY',
  );
  if (elasticsearch)
    pins.elasticsearch = JSON.parse(fs.readFileSync(new URL('../fixtures/ccd/elasticsearch-images.json', import.meta.url)))[platform];
  for (const [name, pin] of Object.entries(pins)) {
    if (platform === 'linux/arm64' && name !== 'elasticsearch') continue;
    assert(
      pin.platform === platform &&
        /^sha256:[a-f0-9]{64}$/.test(pin.manifestDigest) &&
        /^sha256:[a-f0-9]{64}$/.test(pin.configDigest) &&
        pin.reference.endsWith('@' + pin.manifestDigest),
      'CCD_IMAGE_PROFILE_INVALID',
    );
  }
  return pins;
}
export function assertCcdImageIdentity(info, pin, platform) {
  assert(
    info &&
      (info.Id === pin.manifestDigest ||
        (pin.configDigest && info.Id === pin.configDigest)) &&
      info.Architecture === platform.split('/')[1] &&
      ((platform === 'linux/arm64' && !pin.platform) || info.Os === 'linux') &&
      info.RepoDigests?.some((ref) => ref.endsWith('@' + pin.manifestDigest)),
    'CCD_IMAGE_IDENTITY_MISMATCH',
  );
}
export function ccdRuntimeImageIds(state) {
  let local;
  if(state.localCcdProfile) {
    assertLocalCcdRuntimeScope(state);
    local=verifyLocalCcdRuntimeProfile(state.localCcdProfile);
    assert.equal(state.images?.data?.id,local.imageId,'LOCAL_CCD_RUNTIME_IMAGE_DRIFT');
  }
  const platform = state.platform ?? 'linux/arm64',
    pins = ccdImagePins(platform, { elasticsearch: state.elasticsearch ?? false });
  return Object.fromEntries(
    Object.entries(pins).map(([name, pin]) => {
      if(name==='data'&&local)return [name,local.imageId];
      if (platform === 'linux/arm64' && name !== 'elasticsearch') {
        if (state.images)
          assert.equal(
            state.images[name]?.id,
            pin.manifestDigest,
            'CCD_IMAGE_IDENTITY_MISMATCH',
          );
        return [name, pin.manifestDigest];
      }
      const info = state.images?.[name];
      assertCcdImageIdentity(
        {
          Id: info?.id,
          Os: 'linux',
          Architecture: info?.architecture,
          RepoDigests: info?.repoDigests,
        },
        pin,
        platform,
      );
      return [name, info.id];
    }),
  );
}
const fixtureRoot=fileURLToPath(new URL('../fixtures/ccd/',import.meta.url));
const password='SyntheticHarnessPassword17';
export const CCD_FIXTURE_SELECTIONS = Object.freeze([
  "nested-prl",
  "event-capability-baseline",
  "event-capability-mutant",
  "event-capability-read-mutant",
  "event-capability-readonly-read-mutant",
  "event-capability-readonly-update-mutant",
  "event-capability-courtadmin-update-mutant",
  ...SOURCE_SHAPE_ROWS.map(row => `event-capability-shape-${row.id}-mutant`),
]);
const sourceActors = Object.freeze({
  courtadmin: "caseworker-privatelaw-courtadmin",
  judge: "caseworker-privatelaw-judge",
  readonly: "caseworker-privatelaw-readonly",
});
function fixtureSelection(
  state,
  requested = state?.fixtureSelection ?? "nested-prl",
) {
  assert(
    CCD_FIXTURE_SELECTIONS.includes(requested),
    "CCD_FIXTURE_SELECTION_REQUIRED",
  );
  assert.equal(
    state ? (state.fixtureSelection ?? "nested-prl") : requested,
    requested,
    "CCD_FIXTURE_SELECTION_MISMATCH",
  );
  return requested;
}

export function docker(args,input) {
 const result=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:32*1024*1024,timeout:90000});
 if(result.error||result.status!==0) throw new Error(`DOCKER_COMMAND_FAILED ${args.slice(0,2).join(' ')} ${result.error?.message||result.stderr}`);
 return result.stdout.trim();
}
export function validateCcdDefinition(value,key='') {
 if(Array.isArray(value)) return value.forEach(item=>validateCcdDefinition(item,key));
 if(value&&typeof value==='object') return Object.entries(value).forEach(([name,item])=>validateCcdDefinition(item,name));
 if(typeof value==='string'&&value&&(/^[a-z][a-z0-9+.-]*:\/\//i.test(value)||/callback/i.test(key))) {
  let url;try{url=new URL(value);}catch{throw new Error('INVALID_CCD_CALLBACK_DESTINATION');}
  if(url.origin!=='http://127.0.0.1:3101'||url.username||url.password) throw new Error('UNDECLARED_CCD_DESTINATION');
 }
}
export function sidecarArguments({owner,namespace,image,service,env}) {
 if(!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('PINNED_CCD_IMAGE_REQUIRED');
 if(!/^[a-f0-9]{64}$/.test(namespace)||!/^harness-[a-z0-9-]+$/.test(owner)||!/^\w+$/.test(service)) throw new Error('OWNED_CCD_NAMESPACE_REQUIRED');
 for(const value of Object.values(env)) if(/^https?:\/\//.test(value)&&new URL(value).hostname!=='127.0.0.1') throw new Error('NONLOCAL_CCD_ENVIRONMENT');
 return ['run','-d','--name',`${owner}-${service}`,'--label',`exui.harness.owner=${owner}`,'--label',`exui.harness.service=${service}`,'--network',`container:${namespace}`,'--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','512','--memory','1536m',...Object.entries(env).flatMap(([k,v])=>['-e',`${k}=${v}`]),image];
}
const transport=`const chunks=[];for await(const c of process.stdin)chunks.push(c);const s=JSON.parse(Buffer.concat(chunks));let body=s.body;const headers=s.headers||{};if(s.file){delete headers['content-type'];const f=new FormData();f.set('file',new Blob([Buffer.from(s.file,'base64')]),'nested-prl.xlsx');body=f;}else if(body&&typeof body!=='string'){headers['content-type']='application/json';body=JSON.stringify(body);}const r=await fetch(s.url,{method:s.method||'GET',headers,body,signal:AbortSignal.timeout(15000)});console.log(JSON.stringify({status:r.status,body:await r.text()}));`;
export function ccdRequest(state,port,route,options={}) {
 if(![4451,4452,4453,4502,5000,...(state?.elasticsearch === true ? [9200] : [])].includes(port)||!route.startsWith('/')) throw new Error('INVALID_CCD_REQUEST_DESTINATION');
 const result=JSON.parse(docker(['exec','-i',state.containers.client,'node','--input-type=module','-e',transport],JSON.stringify({url:`http://127.0.0.1:${port}${route}`,...options})));
 try {result.body=JSON.parse(result.body);}catch{} return result;
}
const save=(state)=>fs.writeFileSync(path.join(state.output,'runtime.json'),JSON.stringify(state,null,2)+'\n');
export async function startCcdRuntime(output,{runDocker=docker,request=ccdRequest,fixtureSelection:selection='nested-prl',isCancelled=()=>false,platform='linux/arm64',elasticsearch=false,localCcdProfile}={}) {
 fixtureSelection(null,selection);
 let local;
 if(localCcdProfile!==undefined) { assertLocalCcdRuntimeScope({platform,elasticsearch,fixtureSelection:selection});local=verifyLocalCcdRuntimeProfile(localCcdProfile,{docker:runDocker}); }
 const pins=ccdImagePins(platform,{elasticsearch}),images=Object.fromEntries(Object.entries(pins).map(([name,pin])=>[name,pin.manifestDigest]));
 if(local)images.data=local.imageId;
 const checkCancellation=()=>assert(!isCancelled(),'CCD_START_CANCELLED');
 checkCancellation();
 fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
 try{fs.mkdirSync(output);}catch(error){if(error.code==='EEXIST')throw new Error('CCD_FRESH_OUTPUT_REQUIRED');throw error;}
 const state={schemaVersion:1,ready:false,owner:`harness-${crypto.randomBytes(8).toString('hex')}`,output:path.resolve(output),containers:{},images:{},caseType:'HarnessNestedPRL',jurisdiction:'HARNESS',policy:'real CCD RBAC; synthetic IDAM simulator; no ABAC/provider credit'};
 if(local) {state.policy='local corrected CCD results feasibility; synthetic IDAM; no catalogue or release credit';state.localCcdProfile=local.profilePath;state.localOnly=true;state.runtimeAcceptance=false;state.catalogueCredit=false;state.releaseCredit=false;}
 if(platform!=='linux/arm64')state.platform=platform;
 if(elasticsearch)state.elasticsearch=true;
 if(selection!=='nested-prl')state.fixtureSelection=selection;
 const resources=Object.fromEntries(Object.entries(images).map(([service,image])=>[service,{name:`${state.owner}-${service}`,image}]));
 const recovery=()=>({owner:state.owner,output:state.output,...(state.platform?{platform}:{}),...(elasticsearch?{elasticsearch:true}:{}),...(local?{localCcdProfile:local.profilePath}:{}),resources});
 fs.writeFileSync(path.join(state.output,'recovery.json'),JSON.stringify(recovery(),null,2)+'\n',{flag:'wx'});
 save(state);
 prepareCcdImport(fixtureRoot,selection);
 for(const [service,pin] of Object.entries(pins)) {
  const info=service==='data'&&local?local.info:JSON.parse(runDocker(['image','inspect',pin.reference]))[0];
  if(!(service==='data'&&local))assertCcdImageIdentity(info,pin,platform);
  images[service]=info.Id;resources[service].image=info.Id;
  state.images[service]={id:info.Id,architecture:info.Architecture,repoDigests:info.RepoDigests};
 }
 fs.writeFileSync(path.join(state.output,'recovery.json'),JSON.stringify(recovery(),null,2)+'\n');
 state.namespace=runDocker(['create',...(platform==='linux/amd64'?['--user','999:999']:[]),'--name',`${state.owner}-database`,'--label',`exui.harness.owner=${state.owner}`,'--label','exui.harness.service=database','--network','none','--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=512m,uid=999,gid=999,mode=0700','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e',`DB_USERNAME=ccd`,'-e',`DB_PASSWORD=${password}`,images.database,'postgres','-c','listen_addresses=127.0.0.1']);
 state.containers.database=state.namespace; save(state);runDocker(['start',state.namespace]);
 function run(service,env,args=[]) { const command=sidecarArguments({owner:state.owner,namespace:state.namespace,image:images[service],service,env});command.splice(0,2,'create');if(service==='elasticsearch')command.splice(-1,0,'--user','1000:0','--tmpfs','/usr/share/elasticsearch/data:rw,nosuid,size=512m,uid=1000,gid=0,mode=0700');state.containers[service]=runDocker([...command,...args]);save(state);runDocker(['start',state.containers[service]]); }
 run('client',{},['node','-e','setInterval(()=>{},2147483647)']);
 const probes=JSON.parse(runDocker(['exec',state.containers.client,'node','-e',`const net=require('net');Promise.all(['1.1.1.1','192.168.65.254','host.docker.internal'].map(host=>new Promise(resolve=>{const s=net.connect({host,port:443});s.setTimeout(700);s.on('connect',()=>{s.destroy();resolve({host,connected:true})});s.on('error',()=>resolve({host,connected:false}));s.on('timeout',()=>{s.destroy();resolve({host,connected:false})});}))).then(v=>console.log(JSON.stringify(v)));`]));
 if(probes.some(p=>p.connected)) throw new Error('CCD_NETWORK_ESCAPE');state.forbiddenProbes=probes;save(state);
 for(let i=0;i<90;i++) {
  checkCancellation();
  let ready=false;
  try{runDocker(['exec',state.namespace,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;}catch{}
  checkCancellation();
  if(ready)break;
  await new Promise(r=>setTimeout(r,1000));
 }
 checkCancellation();
 if(platform==='linux/amd64') {
  // Match ccd-docker's synthetic database inventory without a host-built image or mounts.
  const databases=['idam','ccd_user_profile','ccd_definition','ccd_data','evidence','role_assignment','ts_translation_service','cpo_case_payment_orders'];
  const sql=`CREATE USER ccd WITH PASSWORD '${password}';\n`+databases.map(name=>`CREATE DATABASE ${name} WITH OWNER = ccd;`).join('\n');
  runDocker(['exec','-i',state.namespace,'psql','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-U','postgres'],sql);
 }
 runDocker(['exec',state.namespace,'psql','-U','postgres','-c',`ALTER USER ccd WITH PASSWORD '${password}';`]);
 if(elasticsearch) {
  run('elasticsearch',{'cluster.name':state.owner,'network.host':'127.0.0.1','http.port':'9200','transport.port':'9300','discovery.type':'single-node','xpack.security.enabled':'false','action.auto_create_index':'.security*,.watches,.triggered_watches,.watcher-history-*,.logstash_dead_letter,.ml*',ES_JAVA_OPTS:'-Xms256m -Xmx512m'});
  let healthy=false;
  for(let i=0;i<120;i++) {
   checkCancellation();
   try {
    const response=request(state,9200,'/_cluster/health?wait_for_status=yellow&timeout=1s');
    healthy=response.status===200&&response.body.cluster_name===state.owner&&['yellow','green'].includes(response.body.status)&&response.body.timed_out===false&&response.body.number_of_nodes===1;
   }catch{}
   checkCancellation();
   if(healthy)break;
   await new Promise(r=>setTimeout(r,1000));
  }
  if(!healthy)throw new Error('CCD_UNHEALTHY_9200');
 }
 const common={SERVER_ADDRESS:'127.0.0.1',JAVA_TOOL_OPTIONS:'-XX:MaxRAMPercentage=65',REFORM_ENVIRONMENT:'local',REFORM_TEAM:'ccd',APPINSIGHTS_INSTRUMENTATIONKEY:'',APPLICATIONINSIGHTS_CONNECTION_STRING:'',IDAM_S2S_URL:'http://127.0.0.1:4502',IDAM_USER_URL:'http://127.0.0.1:5000'};
 run('idam',{...common,SERVER_PORT:'5000',SIMULATOR_OPENID_BASE_URL:'http://127.0.0.1:5000',SIMULATOR_OPENID_BASE_URL_OUTSIDE_NETWORK:'http://127.0.0.1:5000',...(platform==='linux/amd64'?{SIMULATOR_JWT_ISSUER:'http://127.0.0.1:5000/o'}:{})});
 run('s2s',{...common,SERVER_PORT:'4502',JWT_KEY:'U3ludGhldGljSGFybmVzc0tleUZvckxvY2FsVXNlT25seVN5bnRoZXRpY0hhcm5lc3NLZXlGb3JMb2NhbFVzZU9ubHk=',TESTING_SUPPORT_ENABLED:'true',MICROSERVICEKEYS_CCD_GW:'AAAAAAAAAAAAAAAA',MICROSERVICEKEYS_CCD_DATA:'AAAAAAAAAAAAAAAA',MICROSERVICEKEYS_CCD_DEFINITION:'AAAAAAAAAAAAAAAA',MICROSERVICEKEYS_CCD_ADMIN:'AAAAAAAAAAAAAAAA',MICROSERVICEKEYS_XUI_WEBAPP:'AAAAAAAAAAAAAAAA'});
 const db=(prefix)=>({[prefix+'_DB_HOST']:'127.0.0.1',[prefix+'_DB_PORT']:'5432',[prefix+'_DB_USERNAME']:'ccd',[prefix+'_DB_PASSWORD']:password,[prefix+'_DB_USE_SSL']:'false'});
 run('profile',{...common,...db('USER_PROFILE'),REFORM_SERVICE_NAME:'ccd-user-profile-api'});
 run('definition',{...common,...db('DEFINITION_STORE'),DEFINITION_STORE_IDAM_KEY:'AAAAAAAAAAAAAAAA',DEFINITION_STORE_S2S_AUTHORISED_SERVICES:'ccd_data,ccd_gw,ccd_admin,xui_webapp',USER_PROFILE_HOST:'http://127.0.0.1:4453',REFORM_SERVICE_NAME:'ccd-definition-store-api',ELASTIC_SEARCH_ENABLED:String(elasticsearch),...(elasticsearch?{ELASTIC_SEARCH_HOST:'127.0.0.1',ELASTIC_SEARCH_FAIL_ON_IMPORT:'true'}:{})});
 run('data',{...common,...db('DATA_STORE'),...(platform==='linux/amd64'?{OIDC_ALLOWED_ISSUERS:'http://127.0.0.1:5000/o'}:{}),DATA_STORE_IDAM_KEY:'AAAAAAAAAAAAAAAA',DATA_STORE_TOKEN_SECRET:'synthetic-isolated-ccd-event-token-secret',DATA_STORE_S2S_AUTHORISED_SERVICES:'ccd_gw,xui_webapp,ccd_data',DEFINITION_STORE_HOST:'http://127.0.0.1:4451',USER_PROFILE_HOST:'http://127.0.0.1:4453',IDAM_API_BASE_URL:'http://127.0.0.1:5000',IDAM_OIDC_URL:'http://127.0.0.1:5000',REFORM_SERVICE_NAME:'ccd-data-store-api',ELASTIC_SEARCH_ENABLED:String(elasticsearch),...(elasticsearch?{ELASTIC_SEARCH_HOSTS:'127.0.0.1:9200',ELASTIC_SEARCH_DATA_NODES_HOSTS:'http://127.0.0.1:9200'}:{}),ENABLE_ATTRIBUTE_BASED_ACCESS_CONTROL:'false',ENABLE_PSEUDO_ROLE_ASSIGNMENTS_GENERATION:'false',ENABLE_PSEUDO_ACCESS_PROFILES_GENERATION:'false',TESTING_SUPPORT_ENABLED:'true',MIGRATIONS_ENDPOINT_ENABLED:'false',CCD_DEFAULTPRINTURL:'http://127.0.0.1:3101/print',CASE_DOCUMENT_AM_URL:'http://127.0.0.1:3101',REFERENCE_DATA_API_URL:'http://127.0.0.1:3101',ROLE_ASSIGNMENT_URL:'http://127.0.0.1:3101'});
 for(const port of [5000,4502,4453,4451,4452]) {
  let healthy=false;
  for(let i=0;i<120;i++) {
   checkCancellation();
   try{healthy=request(state,port,port===4452?'/health/readiness':'/health').status===200;}catch{}
   checkCancellation();
   if(healthy)break;
   await new Promise(r=>setTimeout(r,1000));
  }
  if(!healthy)throw new Error(`CCD_UNHEALTHY_${port}`);
 }
 checkCancellation();
 state.ready=true;save(state);return state;
}
const digest=(value)=>'sha256:'+crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export function assertObservedCcdDefinition(receipt,observed) {
 assert.equal(digest(observed),receipt.observedDefinitionDigest,'CCD_IMPORTED_DEFINITION_DRIFT');
 assert.equal(observed.version?.number,receipt.definitionVersion,'CCD_IMPORTED_VERSION_DRIFT');
}
export function assertObservedEventCapabilityDefinition(observed, source) {
  const sheets = source.sheets;
  const acls = (actual, expected) => {
    assert(Array.isArray(actual), "CCD_EVENT_ACL_MISMATCH");
    const projected = actual
      .map((row) => ({
        role: row.role,
        create: row.create,
        read: row.read,
        update: row.update,
        delete: row.delete,
      }))
      .sort((a, b) => a.role.localeCompare(b.role));
    const wanted = expected
      .map((row) => ({
        role: row.UserRole,
        create: row.CRUD.includes("C"),
        read: row.CRUD.includes("R"),
        update: row.CRUD.includes("U"),
        delete: row.CRUD.includes("D"),
      }))
      .sort((a, b) => a.role.localeCompare(b.role));
    assert.deepEqual(projected, wanted, "CCD_EVENT_ACL_MISMATCH");
  };
  assert.equal(observed.id, "HarnessNestedPRL", "CCD_EVENT_CASE_TYPE_MISMATCH");
  acls(observed.acls, sheets.AuthorisationCaseType);
  assert.deepEqual(
    observed.states.map((row) => row.id),
    ["JUDICIAL_REVIEW"],
    "CCD_EVENT_STATE_MISMATCH",
  );
  acls(observed.states[0].acls, sheets.AuthorisationCaseState);
  assert.deepEqual(
    observed.events.map((row) => row.id).sort(),
    sheets.CaseEvent.map((row) => row.ID).sort(),
    "CCD_EVENT_SELECTION_MISMATCH",
  );
  for (const field of sheets.CaseField) {
    const actual = observed.case_fields.find((row) => row.id === field.ID);
    assert(actual, "CCD_EVENT_FIELD_MISSING");
    acls(
      actual.acls,
      sheets.AuthorisationCaseField.filter(
        (row) => row.CaseFieldID === field.ID,
      ),
    );
  }
  for (const event of sheets.CaseEvent) {
    const actual = observed.events.find((row) => row.id === event.ID);
    acls(
      actual.acls,
      sheets.AuthorisationCaseEvent.filter(
        (row) => row.CaseEventID === event.ID,
      ),
    );
    assert.equal(actual.name, event.Name, "CCD_EVENT_NAME_MISMATCH");
    assert.deepEqual(
      actual.pre_states,
      event["PreConditionState(s)"]?.split(";") ?? [],
      "CCD_EVENT_PRECONDITION_MISMATCH",
    );
    assert.deepEqual(
      actual.post_states.map((row) => row.post_state_reference),
      [event.PostConditionState],
      "CCD_EVENT_POSTCONDITION_MISMATCH",
    );
    assert.equal(actual.show_summary, true, "CCD_EVENT_SUMMARY_MISSING");
    for (const key of [
      "callback_url_about_to_start_event",
      "callback_url_about_to_submit_event",
      "callback_url_submitted_event",
    ])
      assert(!actual[key], "CCD_EVENT_CALLBACK_UNEXPECTED");
    for (const field of sheets.CaseEventToFields.filter(
      (row) => row.CaseEventID === event.ID,
    )) {
      const metadata = actual.case_fields.find(
        (row) => row.case_field_id === field.CaseFieldID,
      );
      assert(metadata, "CCD_EVENT_FIELD_MISSING");
      assert.equal(
        metadata.display_context,
        field.DisplayContext,
        "CCD_EVENT_DISPLAY_MISMATCH",
      );
      assert.equal(
        metadata.show_condition ?? null,
        field.FieldShowCondition ?? null,
        "CCD_EVENT_CONDITION_MISMATCH",
      );
      assert.equal(
        metadata.show_summary_change_option,
        field.ShowSummaryChangeOption === "Y",
        "CCD_EVENT_CHANGE_MISMATCH",
      );
      for (const element of sheets.EventToComplexTypes.filter(
        (row) =>
          row.CaseEventID === event.ID && row.CaseFieldID === field.CaseFieldID,
      )) {
        const child = metadata.case_fields_complex.find(
          (row) => row.reference === element.ListElementCode,
        );
        assert(child, "CCD_EVENT_CHILD_MISSING");
        assert.equal(
          child.displayContext,
          element.DisplayContext,
          "CCD_EVENT_DISPLAY_MISMATCH",
        );
        assert.equal(
          child.showCondition ?? null,
          element.FieldShowCondition ?? null,
          "CCD_EVENT_CONDITION_MISMATCH",
        );
      }
    }
  }
  for (const contract of SOURCE_SHAPE_ROWS) {
    const row = contract.sheet === 'CaseField'
      ? sheets.CaseField.find(item => item.ID === contract.reference)
      : sheets.EventToComplexTypes.find(item => item.CaseEventID === 'serviceOfDocuments' && item.CaseFieldID === 'sodAdditionalRecipientsList' && item.ListElementCode === contract.reference);
    assert(row, 'CCD_SHAPE_SOURCE_CONTEXT_REQUIRED');
    assertObservedSourceShape(observed,contract.id,row[contract.faultColumn] === contract.faultValue);
  }

}
export function verifyCcdContainerIdentity(state,inspectContainer=(id)=>JSON.parse(docker(['inspect',id]))[0]) {
 const images=ccdRuntimeImageIds(state);
 assert.deepEqual(Object.keys(state.containers).sort(),Object.keys(images).sort(),'CCD_RUNTIME_SERVICE_INVENTORY_MISMATCH');
 assert.equal(state.containers.database,state.namespace,'CCD_RUNTIME_NAMESPACE_MISMATCH');
 for(const [service,id] of Object.entries(state.containers)) {
  const info=inspectContainer(id);
  assert.equal(info.Image,images[service],'CCD_RUNTIME_IMAGE_MISMATCH');
  if(state.platform==='linux/amd64'&&service==='database')assert.equal(info.Config.User,'999:999','CCD_DATABASE_USER_MISMATCH');
  assert.equal(info.Config.Labels?.['exui.harness.owner'],state.owner,'CCD_RUNTIME_OWNER_MISMATCH');
  assert.equal(info.Config.Labels?.['exui.harness.service'],service,'CCD_RUNTIME_SERVICE_MISMATCH');
  assert.equal(info.HostConfig.Privileged||false,false,'CCD_RUNTIME_PRIVILEGED');
  assert.notEqual(info.HostConfig.PidMode,'host','CCD_RUNTIME_HOST_PID');
  assert((info.Mounts||[]).every(m=>m.Type==='tmpfs'),'CCD_RUNTIME_STORAGE_MOUNT');
  assert.equal(info.HostConfig.NetworkMode,service==='database'?'none':`container:${state.namespace}`,'CCD_RUNTIME_NAMESPACE_MISMATCH');
  assert.equal(info.State.Running,true,'CCD_RUNTIME_NOT_RUNNING');
  assert.deepEqual(info.HostConfig.Binds||[],[],'CCD_RUNTIME_HOST_MOUNT');
  assert.deepEqual(info.HostConfig.PortBindings||{}, {}, 'CCD_RUNTIME_PUBLISHED_PORT');
 }
}
export function loadCcdRuntimeForReuse(output,inspectContainer,{elasticsearch,localCcdProfile}={}) {
 const state=JSON.parse(fs.readFileSync(path.join(output,'runtime.json')));
 assert.equal(state.localCcdProfile,localCcdProfile,'LOCAL_CCD_EXPLICIT_REUSE_REQUIRED');
 assert.equal(path.resolve(state.output||output),path.resolve(output),'CCD_RUNTIME_OUTPUT_MISMATCH');
 if(elasticsearch!==undefined)assert.equal(state.elasticsearch??false,elasticsearch,'CCD_RUNTIME_ELASTICSEARCH_MISMATCH');
 verifyCcdContainerIdentity(state,inspectContainer);
 return state;
}
export function verifyCcdRuntimeIdentity(
  state,
  { fixtureSelection: requested, inspectContainer, request = ccdRequest, runDocker = docker } = {},
) {
  assert(!state?.localCcdProfile,'LOCAL_CCD_NATIVE_ACCEPTANCE_FORBIDDEN');
  const selection = fixtureSelection(state, requested);
  const prepared = prepareCcdImport(fixtureRoot, selection);
  verifyCcdContainerIdentity(state, inspectContainer);
  const receipt = JSON.parse(
    fs.readFileSync(path.join(state.output, "definition-import.json")),
  );
  assert.equal(
    receipt.fixtureSelection ?? "nested-prl",
    selection,
    "CCD_FIXTURE_SELECTION_MISMATCH",
  );
  assert.equal(
    digest(prepared.file),
    receipt.fixtureDigest,
    "CCD_FIXTURE_DRIFT",
  );
  if (selection !== "nested-prl") {
    assert.deepEqual(
      receipt.binding,
      prepared.binding,
      "CCD_IMPORT_BINDING_MISMATCH",
    );
    assert(
      [200, 201].includes(receipt.status),
      "CCD_IMPORT_RECEIPT_STATUS_REQUIRED",
    );
    assert.equal(
      receipt.sourceRevision,
      prepared.source.provenance.sourceRevision,
      "CCD_EVENT_SOURCE_BINDING_MISMATCH",
    );
    assert.equal(
      receipt.sourceProjectionDigest,
      EVENT_CAPABILITY_SOURCE_DIGEST,
      "CCD_EVENT_SOURCE_BINDING_MISMATCH",
    );
  }
  const observer = ccdCredentials(state, "observer", { request });
  const observed = request(
    state,
    4451,
    "/api/data/case-type/HarnessNestedPRL",
    { headers: observer.headers },
  );
  validateCcdDefinition(observed.body);
  assert.equal(observed.status, 200, "CCD_DEFINITION_UNAVAILABLE");
  assertObservedCcdDefinition(receipt, observed.body);
  if (selection !== "nested-prl") {
    assertObservedEventCapabilityDefinition(observed.body, prepared.source);
    assertStoredSourceShapeDates(receipt.storedSourceShapeDates,state,receipt.definitionVersion);
    assert.deepEqual(readStoredSourceShapeDates(state,receipt.definitionVersion,{runDocker,inspect:current=>verifyCcdContainerIdentity(current,inspectContainer)}),receipt.storedSourceShapeDates,'SHAPE_STORED_DATE_LIVE_DRIFT');
  }
  return {
    fixtureDigest: receipt.fixtureDigest,
    observedDefinitionDigest: receipt.observedDefinitionDigest,
    definitionVersion: receipt.definitionVersion,
    images: state.images,
    ...(selection === "nested-prl" ? {} : { fixtureSelection: selection }),
  };
}
export function stopCcdRuntime(state, { runDocker = docker } = {}) {
 const services=Object.keys(state.containers).filter(service=>service!=='database').reverse();
 if(state.containers.database)services.push('database');
 for(const service of services) {
  const id=state.containers[service];
  const info=JSON.parse(runDocker(['inspect',id]))[0];
  if(info.Config.Labels?.['exui.harness.owner']!==state.owner) throw new Error('CCD_CLEANUP_OWNER_MISMATCH');
  runDocker(['rm','-f','-v',id]);
 }
 state.ready=false;state.stoppedAt=new Date().toISOString();save(state);
}
export function ccdCredentials(
  state,
  persona = "allowed",
  { request = ccdRequest } = {},
) {
  const email = `${persona}@harness.example.com`;
  const sourceRole = Object.hasOwn(sourceActors, persona)
    ? sourceActors[persona]
    : undefined;
  if (sourceRole)
    assert(
      fixtureSelection(state).startsWith("event-capability-"),
      "CCD_SOURCE_ACTOR_SCOPE_REQUIRED",
    );
  const roles = sourceRole
    ? ["caseworker", "caseworker-harness", sourceRole]
    : [
        "caseworker",
        "caseworker-harness",
        `caseworker-harness-${persona}`,
        ...(persona === "observer" ? ["ccd-import", "ccd-import-all"] : []),
      ];
  const created = request(state, 5000, "/testing-support/accounts", {
    method: "POST",
    body: {
      email,
      forename: "Synthetic",
      surname: persona,
      password,
      roles: roles.map((code) => ({ code })),
    },
  });
  if (![201, 200, 409].includes(created.status))
    throw new Error(`CCD_IDENTITY_FAILED_${created.status}`);
  const token = request(state, 5000, "/o/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "ccd_gateway",
      client_secret: "ccd_gateway_secret",
      username: email,
      password,
      scope: "openid profile roles",
      redirect_uri: "http://127.0.0.1:3100/oauth2/callback",
    }).toString(),
  });
  if (!token.body.access_token)
    throw new Error(`CCD_TOKEN_FAILED_${token.status}`);
  const user = request(state, 5000, "/details", {
    headers: { Authorization: `Bearer ${token.body.access_token}` },
  });
  if (sourceRole) {
    assert.equal(user.status, 200, "CCD_SOURCE_ACTOR_DETAILS_REQUIRED");
    assert(
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        user.body.id,
      ),
      "CCD_SOURCE_ACTOR_IDENTITY_REQUIRED",
    );
    assert(Array.isArray(user.body.roles), "CCD_SOURCE_ACTOR_ROLES_MISMATCH");
    assert.deepEqual(
      [...user.body.roles].sort(),
      [...roles].sort(),
      "CCD_SOURCE_ACTOR_ROLES_MISMATCH",
    );
  }
  const service = request(state, 4502, "/testing-support/lease", {
    method: "POST",
    body: { microservice: "ccd_gw" },
  });
  if (service.status !== 200)
    throw new Error(`CCD_S2S_FAILED_${service.status}`);
  return {
    userId: user.body.id,
    headers: {
      Authorization: `Bearer ${token.body.access_token}`,
      ServiceAuthorization: service.body,
      "content-type": "application/json",
      accept: "application/json",
    },
    email,
    ...(sourceRole ? { roles: [...user.body.roles] } : {}),
  };
}
export function prepareCcdImport(
  directory = fixtureRoot,
  selection = "nested-prl",
) {
  fixtureSelection(null, selection);
  if (selection !== "nested-prl") {
    assert.equal(
      path.resolve(directory),
      path.resolve(fixtureRoot),
      "CCD_EVENT_FIXED_FIXTURE_DIRECTORY_REQUIRED",
    );
    const root = path.join(fixtureRoot, "event-capability");
    const pair = Object.fromEntries(
      ["baseline", "mutant", "read-mutant", "readonly-read-mutant", "readonly-update-mutant", "courtadmin-update-mutant", ...SOURCE_SHAPE_ROWS.map(row => `shape-${row.id}-mutant`)].map((name) => [
        name,
        JSON.parse(fs.readFileSync(path.join(root, name + ".json"))),
      ]),
    );
    const transformation = validateEventCapabilityPair(
      pair.baseline,
      pair.mutant,
    );
    const binding = JSON.parse(
      fs.readFileSync(path.join(root, "binding.json")),
    );
    for (const row of SOURCE_SHAPE_ROWS) assert.deepEqual(binding[`shape-${row.id}-transformation`],validateSourceShapeFault(row.id,pair.baseline,pair[`shape-${row.id}-mutant`]),'CCD_SHAPE_TRANSFORMATION_MISMATCH');
    assert.equal(binding.courtadminUpdateMutationId, COURTADMIN_UPDATE_MUTATION, "CCD_COURTADMIN_UPDATE_MUTATION_BINDING_MISMATCH");
    assert.deepEqual(binding.courtadminUpdateTransformation, validateCourtadminUpdatePair(pair.baseline, pair["courtadmin-update-mutant"]), "CCD_COURTADMIN_UPDATE_BINDING_TRANSFORMATION_MISMATCH");
    assert.equal(binding.readonlyUpdateMutationId, READONLY_UPDATE_MUTATION, "CCD_READONLY_UPDATE_MUTATION_BINDING_MISMATCH");
    assert.deepEqual(binding.readonlyUpdateTransformation, validateReadonlyUpdatePair(pair.baseline, pair["readonly-update-mutant"]), "CCD_READONLY_UPDATE_BINDING_TRANSFORMATION_MISMATCH");
    assert.equal(binding.readonlyReadMutationId, READONLY_READ_MUTATION, "CCD_READONLY_MUTATION_BINDING_MISMATCH");
    assert.deepEqual(binding.readonlyReadTransformation, validateReadonlyReadPair(pair.baseline, pair["readonly-read-mutant"]), "CCD_READONLY_BINDING_TRANSFORMATION_MISMATCH");
    assert.equal(binding.readMutationId, COURTADMIN_READ_MUTATION, "CCD_READ_MUTATION_BINDING_MISMATCH");
    assert.deepEqual(
      binding.readTransformation,
      validateCourtadminReadPair(pair.baseline, pair["read-mutant"]),
      "CCD_READ_BINDING_TRANSFORMATION_MISMATCH",
    );
    assert.deepEqual(
      binding.transformation,
      transformation,
      "CCD_EVENT_BINDING_TRANSFORMATION_MISMATCH",
    );
    assert.deepEqual(
      binding.proofs,
      EVENT_CAPABILITY_PROOFS,
      "CCD_EVENT_BINDING_PROOFS_MISMATCH",
    );
    assert.equal(
      binding.sourceRevision,
      pair.baseline.provenance.sourceRevision,
      "CCD_EVENT_SOURCE_BINDING_MISMATCH",
    );
    assert.equal(binding.schemaVersion, 1, "CCD_IMPORT_BINDING_VERSION");
    assert.equal(
      binding.scope,
      EVENT_CAPABILITY_SCOPE,
      "CCD_EVENT_BINDING_SCOPE_MISMATCH",
    );
    assert.equal(
      binding.mutationId,
      EVENT_CAPABILITY_MUTATION,
      "CCD_EVENT_BINDING_MUTATION_MISMATCH",
    );
    assert.equal(
      binding.sourceProjectionDigest,
      EVENT_CAPABILITY_SOURCE_DIGEST,
      "CCD_EVENT_SOURCE_BINDING_MISMATCH",
    );
    for (const name of ["baseline", "mutant", "read-mutant", "readonly-read-mutant", "readonly-update-mutant", "courtadmin-update-mutant", ...SOURCE_SHAPE_ROWS.map(row => `shape-${row.id}-mutant`)]) {
      assert.equal(
        digest(fs.readFileSync(path.join(root, name + ".json"))),
        binding[name].sourceDigest,
        "CCD_SOURCE_BINDING_MISMATCH",
      );
      assert.equal(
        digest(fs.readFileSync(path.join(root, name + ".xlsx"))),
        binding[name].workbookDigest,
        "CCD_WORKBOOK_BINDING_MISMATCH",
      );
      validateCcdDefinition(pair[name].sheets);
    }
    const variant =
      selection.slice("event-capability-".length);
    return {
      file: fs.readFileSync(path.join(root, variant + ".xlsx")),
      binding: {
        schemaVersion: 1,
        ...binding[variant],
        sourceProjectionDigest: binding.sourceProjectionDigest,
      },
      source: pair[variant],
      fixtureSelection: selection,
    };
  }

  const source = fs.readFileSync(path.join(directory, "nested-prl.json"));
  const file = fs.readFileSync(path.join(directory, "nested-prl.xlsx"));
  const binding = JSON.parse(
    fs.readFileSync(path.join(directory, "nested-prl.binding.json")),
  );
  assert.equal(binding.schemaVersion, 1, "CCD_IMPORT_BINDING_VERSION");
  assert.equal(
    digest(source),
    binding.sourceDigest,
    "CCD_SOURCE_BINDING_MISMATCH",
  );
  assert.equal(
    digest(file),
    binding.workbookDigest,
    "CCD_WORKBOOK_BINDING_MISMATCH",
  );
  validateCcdDefinition(JSON.parse(source).sheets);
  return { file, binding };
}
export function importCcdDefinition(
  state,
  {
    fixtureDirectory = fixtureRoot,
    fixtureSelection: requested,
    inspectContainer,
    request = ccdRequest,
    runDocker = docker,
  } = {},
) {
  assert(!state?.localCcdProfile,'LOCAL_CCD_NATIVE_ACCEPTANCE_FORBIDDEN');
  const selection = fixtureSelection(state, requested);
  const prepared = prepareCcdImport(fixtureDirectory, selection);
  const { file, binding } = prepared;
  verifyCcdContainerIdentity(state, inspectContainer);
  const observer = ccdCredentials(state, "observer", { request });
  for (const role of [
    "caseworker",
    "caseworker-harness",
    "caseworker-harness-allowed",
    "caseworker-harness-observer",
    "caseworker-harness-denied",
    "ccd-import",
    ...(selection === "nested-prl" ? [] : Object.values(sourceActors)),
  ]) {
    const registered = request(state, 4451, "/api/user-role", {
      method: "PUT",
      headers: observer.headers,
      body: { role, security_classification: "PUBLIC" },
    });
    if (![200, 201, 205].includes(registered.status))
      throw new Error(`CCD_ROLE_FAILED_${registered.status}`);
  }
  const imported = request(state, 4451, "/import", {
    method: "POST",
    headers: observer.headers,
    file: file.toString("base64"),
  });
  fs.writeFileSync(
    path.join(state.output, "definition-import.json"),
    JSON.stringify(
      {
        binding,
        status: imported.status,
        body: imported.body,
        fixtureDigest:
          "sha256:" + crypto.createHash("sha256").update(file).digest("hex"),
        images: state.images,
        sourceRevision: "694b9951e94369f1394380506960c4f04f25755d",
        ...(selection === "nested-prl"
          ? {}
          : {
              fixtureSelection: selection,
              sourceProjectionDigest: EVENT_CAPABILITY_SOURCE_DIGEST,
            }),
      },
      null,
      2,
    ),
  );
  if (imported.status !== 201 && imported.status !== 200)
    throw new Error(`CCD_IMPORT_FAILED_${imported.status}`);
  const observed = request(
    state,
    4451,
    "/api/data/case-type/HarnessNestedPRL",
    { headers: observer.headers },
  );
  validateCcdDefinition(observed.body);
  assert.equal(observed.status, 200);
  assert.equal(observed.body.id, state.caseType);
  const nested = observed.body.case_fields.find(
    (f) => f.id === "sodAdditionalRecipientsList",
  );
  assert.equal(nested.field_type.collection_field_type.id, "ServeOrgDetails");
  const event = observed.body.events.find((e) => e.id === "create");
  assert(
    event.case_fields
      .find((f) => f.case_field_id === "sodAdditionalRecipientsList")
      .case_fields_complex.some(
        (f) =>
          f.showCondition ===
          'sodAdditionalRecipientsList.serveByPostOrEmail="email"',
      ),
    "CCD_NESTED_CONDITION_MISSING",
  );
  if (selection !== "nested-prl")
    assertObservedEventCapabilityDefinition(observed.body, prepared.source);
  const receiptFile = path.join(state.output, "definition-import.json");
  const receipt = JSON.parse(fs.readFileSync(receiptFile));
  Object.assign(receipt, {
    observedDefinitionDigest: digest(observed.body),
    definitionVersion: observed.body.version.number,
  });
  if (selection !== "nested-prl") receipt.storedSourceShapeDates=readStoredSourceShapeDates(state,receipt.definitionVersion,{runDocker,inspect:current=>verifyCcdContainerIdentity(current,inspectContainer)});
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + "\n");
  fs.writeFileSync(
    path.join(state.output, "observed-definition.json"),
    JSON.stringify(observed.body, null, 2) + "\n",
  );
  state.definitionImported = true;
  save(state);
  return imported;
}
export function proveCcdPolicy(state) {
 verifyCcdContainerIdentity(state);
 const actor=ccdCredentials(state),observer=ccdCredentials(state,'observer'),denied=ccdCredentials(state,'denied');
 const trigger=ccdRequest(state,4452,`/caseworkers/${actor.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/event-triggers/create/token`,{headers:actor.headers});
 assert.equal(trigger.status,200,JSON.stringify(trigger.body));
 const data={protectedValue:'synthetic-protected-original',sodAdditionalRecipientsList:[{value:{serveByPostOrEmail:'email',emailInformation:{emailName:'Synthetic recipient',emailAddress:'recipient@harness.example.com'}}}]};
 const created=ccdRequest(state,4452,`/caseworkers/${actor.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases`,{method:'POST',headers:actor.headers,body:{data,event:{id:'create',summary:'Synthetic Harness case'},event_token:trigger.body.token,ignore_warning:false}});
 assert.equal(created.status,201,JSON.stringify(created.body));
 state.caseId=String(created.body.id);save(state);
 const route=`/caseworkers/${observer.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${state.caseId}`;
 const before=ccdRequest(state,4452,route,{headers:observer.headers});assert.equal(before.status,200);
 assert.deepEqual(before.body.case_data.sodAdditionalRecipientsList.map(r=>r.value),data.sodAdditionalRecipientsList.map(r=>r.value));
 const historyBefore=ccdRequest(state,4452,route+'/events',{headers:observer.headers});assert.equal(historyBefore.status,200);
 const noRead=ccdRequest(state,4452,route.replace(observer.userId,denied.userId),{headers:denied.headers});assert([403,404].includes(noRead.status));assert(!JSON.stringify(noRead.body).includes(data.protectedValue));
 const deniedEvent=ccdRequest(state,4452,`/caseworkers/${denied.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${state.caseId}/event-triggers/update/token`,{headers:denied.headers});assert([200,403,404].includes(deniedEvent.status));if(deniedEvent.status===200)assert.deepEqual(deniedEvent.body.case_details.case_data,{});
 const write=ccdRequest(state,4452,`/caseworkers/${denied.userId}/jurisdictions/HARNESS/case-types/HarnessNestedPRL/cases/${state.caseId}/events`,{method:'POST',headers:denied.headers,body:{data:{protectedValue:'must-never-persist'},event:{id:'update'},event_token:deniedEvent.body.token,ignore_warning:false}});assert([403,404].includes(write.status),JSON.stringify(write));
 const after=ccdRequest(state,4452,route,{headers:observer.headers});assert.equal(after.status,200);assert.deepEqual(after.body,before.body);
 const historyAfter=ccdRequest(state,4452,route+'/events',{headers:observer.headers});assert.equal(historyAfter.status,200);assert.deepEqual(historyAfter.body,historyBefore.body);
 const identity=verifyCcdRuntimeIdentity(state);
 const receipt={identity,historyBefore:historyBefore.body,historyAfter:historyAfter.body,legitimateAuditOnlyChanges:[],caseId:state.caseId,boundary:'real-ccd',policy:state.policy,allowedCreate:created.status,observerRead:before.status,deniedRead:noRead.status,deniedEvent:deniedEvent.status,deniedWrite:write.status,independentStateUnchanged:true,readback:after.body};
 fs.writeFileSync(path.join(state.output,'policy-proof.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
