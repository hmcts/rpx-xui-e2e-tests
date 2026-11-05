const test = require('node:test');
const assert = require('node:assert/strict');
const runtime = import('./lib/exui-ccd-runtime.mjs');
test('CCD sidecars require a pinned image, owned namespace and loopback configuration', async () => {
 const {sidecarArguments, validateCcdDefinition, CCD_IMAGES} = await runtime;
 assert.throws(() => sidecarArguments({owner:'harness-test', namespace:'abc', image:'latest', service:'data', env:{}}), /PINNED/);
 assert.throws(() => sidecarArguments({owner:'harness-test', namespace:'host', image:CCD_IMAGES.data, service:'data', env:{}}), /NAMESPACE/);
 const args=sidecarArguments({owner:'harness-test',namespace:'a'.repeat(64),image:CCD_IMAGES.data,service:'data',env:{IDAM_USER_URL:'http://127.0.0.1:5000'}});
 assert(args.includes('container:'+'a'.repeat(64))); assert(!args.includes('-p')); assert(!args.includes('--volume'));
 assert.throws(() => validateCcdDefinition({CaseEvent:[{CallBackURLSubmittedEvent:'https://example.com'}]}), /DESTINATION/);
 validateCcdDefinition({CaseEvent:[{CallBackURLSubmittedEvent:'http://127.0.0.1:3101/callback'}]});
});
test('source-backed fixture preserves nested conditions and denies unlisted roles', async()=>{
 const fixture=require('./fixtures/ccd/nested-prl.json');
 const {validateCcdDefinition}=await runtime; validateCcdDefinition(fixture.sheets);
 assert.equal(fixture.provenance.sourceRevision,'694b9951e94369f1394380506960c4f04f25755d');
 assert(fixture.sheets.ComplexTypes.some(r=>r.ID==='ServeOrgDetails'&&r.FieldType==='EmailInformation'));
 assert(fixture.sheets.EventToComplexTypes.some(r=>r.FieldShowCondition?.includes('serveByPostOrEmail="email"')));
 assert(!fixture.sheets.AuthorisationCaseType.some(r=>r.UserRole.includes('denied')));
});

test('wrong live definition or version blocks even when the source fixture is unchanged',async()=>{
 const {assertObservedCcdDefinition}=await runtime;
 const crypto=require('node:crypto');
 const observed={id:'HarnessNestedPRL',version:{number:10},fields:['nested']};
 const receipt={observedDefinitionDigest:'sha256:'+crypto.createHash('sha256').update(JSON.stringify(observed)).digest('hex'),definitionVersion:10};
 assertObservedCcdDefinition(receipt,observed);
 assert.throws(()=>assertObservedCcdDefinition(receipt,{...observed,fields:[]}),/CCD_IMPORTED_DEFINITION_DRIFT/);
 assert.throws(()=>assertObservedCcdDefinition({...receipt,definitionVersion:11},observed),/CCD_IMPORTED_VERSION_DRIFT/);
});
test('callback placeholders and non-HTTP destinations cannot enter a CCD import',async()=>{
 const {validateCcdDefinition,sidecarArguments,CCD_IMAGES}=await runtime;
 assert.throws(()=>validateCcdDefinition({CaseEvent:[{CallBackURLSubmittedEvent:'${UNREGISTERED_CALLBACK}/send'}]}),/CALLBACK_DESTINATION/);
 assert.throws(()=>validateCcdDefinition({url:'wss://external.example.com/'}),/DESTINATION/);
 assert.throws(()=>sidecarArguments({owner:'harness-test',namespace:'a'.repeat(64),image:CCD_IMAGES.data,service:'data',env:{IDAM_USER_URL:'https://idam.example.com'}}),/NONLOCAL/);
});

test('tampered workbook is rejected before any Docker inspection or import request',async()=>{
 const {importCcdDefinition}=await runtime;
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-tampered-'));
 try {
  for(const name of ['nested-prl.json','nested-prl.xlsx','nested-prl.binding.json'])fs.copyFileSync(path.join(__dirname,'fixtures/ccd',name),path.join(directory,name));
  fs.appendFileSync(path.join(directory,'nested-prl.xlsx'),'unreviewed callback');
  assert.throws(()=>importCcdDefinition(null,{fixtureDirectory:directory}),/CCD_WORKBOOK_BINDING_MISMATCH/);
 } finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('existing startup output is untouched and no Docker command is attempted',async()=>{
 const {startCcdRuntime}=await runtime;
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-existing-'));
 try{
  fs.writeFileSync(path.join(directory,'runtime.json'),'prior owner');
  await assert.rejects(startCcdRuntime(directory,{runDocker:()=>assert.fail('Docker contacted')}),/CCD_FRESH_OUTPUT_REQUIRED/);
  assert.equal(fs.readFileSync(path.join(directory,'runtime.json'),'utf8'),'prior owner');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('partial startup preserves exclusive recovery owner and resource inventory',async()=>{
 const {startCcdRuntime,CCD_IMAGES}=await runtime;
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-partial-')),directory=path.join(parent,'new');
 const runDocker=(args)=>{
  if(args[0]==='image')return JSON.stringify([{Id:args[2],Architecture:'arm64',RepoDigests:['fixture@'+args[2]]}]);
  if(args[0]==='create')return 'a'.repeat(64);
  if(args[0]==='start')throw Error('SIMULATED_START_FAILURE');
  assert.fail('Unexpected Docker action '+args[0]);
 };
 try{
  await assert.rejects(startCcdRuntime(directory,{runDocker}),/SIMULATED_START_FAILURE/);
  const recovery=JSON.parse(fs.readFileSync(path.join(directory,'recovery.json'))),state=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json')));
  assert.equal(state.containers.database,'a'.repeat(64));assert.equal(state.owner,recovery.owner);
  assert.equal(recovery.resources.database.name,state.owner+'-database');assert.equal(recovery.resources.database.image,CCD_IMAGES.database);
  assert.throws(()=>fs.writeFileSync(path.join(directory,'recovery.json'),'overwrite',{flag:'wx'}),/EEXIST/);
  await assert.rejects(startCcdRuntime(directory,{runDocker:()=>assert.fail('Recovery overwritten')}),/CCD_FRESH_OUTPUT_REQUIRED/);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});

test('reuse changed owner, image or namespace fails before any service request',async()=>{
 const {loadCcdRuntimeForReuse,CCD_IMAGES}=await runtime;
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-reuse-'));
 const state={owner:'harness-test',namespace:'a'.repeat(64),containers:Object.fromEntries(Object.keys(CCD_IMAGES).map((s,i)=>[s,String(i+1).repeat(64)]))};state.containers.database=state.namespace;
 const info=(id)=>{const service=Object.keys(state.containers).find(s=>state.containers[s]===id);return {Image:CCD_IMAGES[service],Config:{Labels:{'exui.harness.owner':state.owner,'exui.harness.service':service}},HostConfig:{NetworkMode:service==='database'?'none':'container:'+state.namespace,Binds:[],PortBindings:{}},State:{Running:true},Mounts:[]};};
 fs.writeFileSync(path.join(directory,'runtime.json'),JSON.stringify(state));
 try{
  for(const mutation of ['owner','image','network']){
   const inspect=id=>{const observed=info(id);if(mutation==='owner')observed.Config.Labels['exui.harness.owner']='other';if(mutation==='image')observed.Image='sha256:'+'f'.repeat(64);if(mutation==='network')observed.HostConfig.NetworkMode='host';return observed;};
   assert.throws(()=>loadCcdRuntimeForReuse(directory,inspect),/CCD_RUNTIME_(OWNER|IMAGE|NAMESPACE)_MISMATCH/);
  }
  assert.equal(loadCcdRuntimeForReuse(directory,info).owner,state.owner);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('reuse CLI performs only Docker inspect when owner, image or network was changed',async()=>{
 const {CCD_IMAGES}=await runtime;
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-cli-reuse-'));
 const state={output:directory,owner:'harness-test',namespace:'a'.repeat(64),containers:Object.fromEntries(Object.keys(CCD_IMAGES).map((s,i)=>[s,String(i+1).repeat(64)]))};state.containers.database=state.namespace;
 fs.writeFileSync(path.join(directory,'runtime.json'),JSON.stringify(state));
 fs.writeFileSync(path.join(directory,'docker'),`#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(path.join(directory,'calls.jsonl'))},JSON.stringify(args)+'\\n');if(args[0]!=='inspect')process.exit(70);const state=${JSON.stringify(state)},images=${JSON.stringify(CCD_IMAGES)};const service=Object.keys(state.containers).find(s=>state.containers[s]===args[1]);const info={Image:images[service],Config:{Labels:{'exui.harness.owner':state.owner,'exui.harness.service':service}},HostConfig:{NetworkMode:service==='database'?'none':'container:'+state.namespace},State:{Running:true},Mounts:[]};if(process.env.CCD_TEST_MUTATION==='owner')info.Config.Labels['exui.harness.owner']='other';if(process.env.CCD_TEST_MUTATION==='image')info.Image='other';if(process.env.CCD_TEST_MUTATION==='network')info.HostConfig.NetworkMode='host';console.log(JSON.stringify([info]));\n`,{mode:0o755});
 try{
  for(const mutation of ['owner','image','network']){
   fs.writeFileSync(path.join(directory,'calls.jsonl'),'');
   const result=spawnSync(process.execPath,[path.join(__dirname,'start-harness-ccd.mjs'),'--reuse','--output',directory],{env:{...process.env,PATH:directory+path.delimiter+process.env.PATH,CCD_TEST_MUTATION:mutation},encoding:'utf8'});
   assert.equal(result.status,1,result.stderr);
   const calls=fs.readFileSync(path.join(directory,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
   assert(calls.length>0);assert(calls.every(args=>args[0]==='inspect'),'Service was contacted before identity verification');
  }
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const fixedRuntime = async () => {
  const api = await runtime;
  assert.deepEqual(
    api.CCD_FIXTURE_SELECTIONS,
    ["nested-prl", "event-capability-baseline", "event-capability-mutant", "event-capability-read-mutant", "event-capability-readonly-read-mutant", "event-capability-readonly-update-mutant", "event-capability-courtadmin-update-mutant", "event-capability-shape-case-field-recipient-selector-mutant", "event-capability-shape-required-delivery-radio-mutant", "event-capability-shape-conditional-email-complex-mutant", "event-capability-shape-optional-postal-line-two-mutant"],
    "fixed source fixture selection must exist before transport use",
  );
  return api;
};
function observedEventFixture(fixture) {
  const acl = (rows) =>
    rows.map((row) => ({
      role: row.UserRole,
      create: row.CRUD.includes("C"),
      read: row.CRUD.includes("R"),
      update: row.CRUD.includes("U"),
      delete: row.CRUD.includes("D"),
    }));
  const s = fixture.sheets;
  return {
    id: "HarnessNestedPRL",
    version: { number: 17 },
    acls: acl(s.AuthorisationCaseType),
    states: s.State.map((row) => ({
      id: row.ID,
      acls: acl(
        s.AuthorisationCaseState.filter((a) => a.CaseStateID === row.ID),
      ),
    })),
    case_fields: s.CaseField.map((row) => ({
      id: row.ID,
      label: row.Label,
      acls: acl(
        s.AuthorisationCaseField.filter((a) => a.CaseFieldID === row.ID),
      ),
      complexACLs: [],
      field_type: {
        ...(row.ID === "sodAdditionalRecipientsList" ? { collection_field_type: { id: "ServeOrgDetails" } } : {}),
        ...(row.ID === "sodAdditionalRecipients" ? { id: "MultiSelectList-AdditionalRecipients", type: "MultiSelectList" } : {}),
      },
    })),
    events: s.CaseEvent.map((row) => ({
      id: row.ID,
      name: row.Name,
      pre_states: row["PreConditionState(s)"]?.split(";") || [],
      post_states: [{ post_state_reference: row.PostConditionState }],
      acls: acl(
        s.AuthorisationCaseEvent.filter((a) => a.CaseEventID === row.ID),
      ),
      show_summary: row.ShowSummary === "Y",
      case_fields: s.CaseEventToFields.filter(
        (f) => f.CaseEventID === row.ID,
      ).map((f) => ({
        case_field_id: f.CaseFieldID,
        display_context: f.DisplayContext,
        show_condition: f.FieldShowCondition || null,
        show_summary_change_option: f.ShowSummaryChangeOption === "Y",
        case_fields_complex: s.EventToComplexTypes.filter(
          (e) => e.CaseEventID === row.ID && e.CaseFieldID === f.CaseFieldID,
        ).map((e) => ({
          reference: e.ListElementCode,
          displayContext: e.DisplayContext,
          label: e.EventElementLabel?.trim() ?? null,
          order: Number(e.FieldDisplayOrder),
          showCondition: e.FieldShowCondition || null,
        })),
      })),
    })),
  };
}
function eventRuntimeFixture(t, api, variant = "baseline") {
  const output = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "ccd-source-import-"),
  );
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const state = {
    schemaVersion: 1,
    ready: true,
    owner: "harness-source-test",
    output,
    namespace: "a".repeat(64),
    caseType: "HarnessNestedPRL",
    jurisdiction: "HARNESS",
    fixtureSelection: "event-capability-" + variant,
    containers: Object.fromEntries(
      Object.keys(api.CCD_IMAGES).map((service, i) => [
        service,
        String(i + 1).repeat(64),
      ]),
    ),
    images: Object.fromEntries(
      Object.entries(api.CCD_IMAGES).map(([service, id]) => [service, { id }]),
    ),
  };
  state.containers.database = state.namespace;
  const inspectContainer = (id) => {
    const service = Object.keys(state.containers).find(
      (s) => state.containers[s] === id,
    );
    return {
      Image: api.CCD_IMAGES[service],
      Config: {
        Labels: {
          "exui.harness.owner": state.owner,
          "exui.harness.service": service,
        },
      },
      HostConfig: {
        NetworkMode:
          service === "database" ? "none" : "container:" + state.namespace,
        Binds: [],
        PortBindings: {},
      },
      State: { Running: true },
      Mounts: [],
    };
  };
  const fixture = JSON.parse(
      fs.readFileSync(
        path.join(
          __dirname,
          "fixtures/ccd/event-capability",
          variant + ".json",
        ),
      ),
    ),
    observed = observedEventFixture(fixture),
    calls = [];
  const request = (_state, port, route, options = {}) => {
    calls.push({ port, route, options });
    if (route === "/testing-support/accounts")
      return {
        status: 201,
        body: { id: "11111111-1111-4111-8111-111111111111" },
      };
    if (route === "/o/token")
      return { status: 200, body: { access_token: "synthetic-test-access" } };
    if (route === "/details")
      return {
        status: 200,
        body: {
          id: "11111111-1111-4111-8111-111111111111",
          roles: [
            "caseworker",
            "caseworker-harness",
            "caseworker-harness-observer",
            "ccd-import",
            "ccd-import-all",
          ],
        },
      };
    if (route === "/testing-support/lease")
      return { status: 200, body: "synthetic-test-s2s" };
    if (route === "/api/user-role") return { status: 201, body: {} };
    if (route === "/import") return { status: 201, body: {} };
    if (route === "/api/data/case-type/HarnessNestedPRL")
      return { status: 200, body: observed };
    assert.fail("Unexpected fake request " + port + route);
  };
  const runDocker = (args,sql) => {
    assert.deepEqual(args,['exec','-i',state.namespace,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','ccd_definition']);
    assert.match(sql,/^BEGIN READ ONLY;/);assert(sql.includes(`ct.version=${observed.version.number}\n`));
    return JSON.stringify(['emailInformation','postalInformation.postalAddress.AddressLine2','serveByPostOrEmail'].map(reference=>({case_type:'HarnessNestedPRL',version:observed.version.number,event:'serviceOfDocuments',field:'sodAdditionalRecipientsList',reference,live_from:'2024-09-01',sql_type:'date'})));
  };
  return { state, inspectContainer, request, observed, calls, runDocker };
}

test("support only: fixed event imports retain exact selected prepared workbook and legacy default", async () => {
  const api = await fixedRuntime();
  assert.deepEqual(
    api.prepareCcdImport().file,
    fs.readFileSync(path.join(__dirname, "fixtures/ccd/nested-prl.xlsx")),
  );
  const binding = require("./fixtures/ccd/event-capability/binding.json");
  for (const variant of ["baseline", "mutant", "read-mutant", "readonly-read-mutant", "readonly-update-mutant", "courtadmin-update-mutant"]) {
    const prepared = api.prepareCcdImport(
      undefined,
      "event-capability-" + variant,
    );
    assert.equal(
      prepared.binding.workbookDigest,
      binding[variant].workbookDigest,
    );
    assert.equal(prepared.binding.sourceDigest, binding[variant].sourceDigest);
    assert.equal(prepared.fixtureSelection, "event-capability-" + variant);
  }
  assert.throws(
    () =>
      api.prepareCcdImport(
        fs.realpathSync(os.tmpdir()),
        "event-capability-baseline",
      ),
    /CCD_EVENT_FIXED_FIXTURE_DIRECTORY_REQUIRED/,
  );
  assert.throws(
    () => api.prepareCcdImport(undefined, "caller-authored-profile"),
    /CCD_FIXTURE_SELECTION_REQUIRED/,
  );
});

for (const variant of ["baseline", "mutant", "read-mutant", "readonly-read-mutant", "readonly-update-mutant", "courtadmin-update-mutant"])
  test(
    "support only: real import function with fake transport validates source ACLs for " +
      variant,
    async (t) => {
      const api = await fixedRuntime(),
        f = eventRuntimeFixture(t, api, variant);
      api.importCcdDefinition(f.state, {
        inspectContainer: f.inspectContainer,
        request: f.request,
        runDocker: f.runDocker,
      });
      const receipt = JSON.parse(
        fs.readFileSync(path.join(f.state.output, "definition-import.json")),
      );
      assert.equal(receipt.fixtureSelection, "event-capability-" + variant);
      assert(
        f.calls.some(
          (c) =>
            c.route === "/api/user-role" &&
            c.options.body.role === "caseworker-privatelaw-courtadmin",
        ),
      );
      assert(
        f.calls.some(
          (c) =>
            c.route === "/api/user-role" &&
            c.options.body.role === "caseworker-privatelaw-judge",
        ),
      );
      assert.equal(
        api.verifyCcdRuntimeIdentity(f.state, {
          inspectContainer: f.inspectContainer,
          request: f.request,
        runDocker: f.runDocker,
        }).fixtureDigest,
        receipt.fixtureDigest,
      );
      const recipientAcl = f.observed.case_fields
        .find(field => field.id === "sodAdditionalRecipientsList")
        .acls.find(acl => acl.role === "caseworker-privatelaw-courtadmin");
      assert.equal(recipientAcl.read, variant !== "read-mutant");
      assert.equal(recipientAcl.create, true);
      assert.equal(recipientAcl.update, true);
      assert.equal(recipientAcl.delete, true);
      assert.deepEqual(f.observed.events.find(e => e.id === "serviceOfDocuments").acls.find(a => a.role === "caseworker-privatelaw-courtadmin"), {
        role: "caseworker-privatelaw-courtadmin", create: variant !== "courtadmin-update-mutant", read: true, update: true, delete: false,
      });
      const readonlyAcl = f.observed.case_fields.find(field => field.id === "sodAdditionalRecipientsList")
        .acls.find(acl => acl.role === "caseworker-privatelaw-readonly");
      assert.equal(readonlyAcl.read, variant !== "readonly-read-mutant");
      assert.equal(readonlyAcl.update, ["readonly-read-mutant", "readonly-update-mutant"].includes(variant));
      const readonlyRole = "caseworker-privatelaw-readonly";
      for (const acls of [f.observed.acls, f.observed.states.find(s => s.id === "JUDICIAL_REVIEW").acls]) {
        assert.deepEqual(acls.find(acl => acl.role === readonlyRole), {
          role: readonlyRole, create: false, read: true, update: variant === "readonly-update-mutant", delete: false,
        });
      }
      assert.deepEqual(f.observed.events.find(e => e.id === "serviceOfDocuments").acls.find(a => a.role === readonlyRole), {
        role: readonlyRole, create: variant === "readonly-update-mutant", read: true, update: false, delete: false,
      });
      assert.equal(readonlyAcl.create, false);
      assert.equal(readonlyAcl.delete, false);
      const judge = f.observed.events
        .find((e) => e.id === "serviceOfDocuments")
        .acls.find((a) => a.role === "caseworker-privatelaw-judge");
      judge.create = !judge.create;
      const crypto = require("node:crypto");
      receipt.observedDefinitionDigest =
        "sha256:" +
        crypto
          .createHash("sha256")
          .update(JSON.stringify(f.observed))
          .digest("hex");
      fs.writeFileSync(
        path.join(f.state.output, "definition-import.json"),
        JSON.stringify(receipt),
      );
      assert.throws(
        () =>
          api.verifyCcdRuntimeIdentity(f.state, {
            inspectContainer: f.inspectContainer,
            request: f.request,
        runDocker: f.runDocker,
          }),
        /CCD_EVENT_ACL_MISMATCH/,
      );
    },
  );

test("support only: wrong selected state or unexpected source ACL rejects before successful import", async (t) => {
  const api = await fixedRuntime(),
    f = eventRuntimeFixture(t, api);
  assert.throws(
    () =>
      api.importCcdDefinition(f.state, {
        fixtureSelection: "event-capability-mutant",
        inspectContainer: () =>
          assert.fail("Inspection before selection check"),
        request: () => assert.fail("Request before selection check"),
      }),
    /CCD_FIXTURE_SELECTION_MISMATCH/,
  );
  const undecided = { ...f.state };
  delete undecided.fixtureSelection;
  assert.throws(
    () =>
      api.importCcdDefinition(undecided, {
        fixtureSelection: "event-capability-baseline",
        inspectContainer: () =>
          assert.fail("Inspection before selected fresh state"),
        request: () => assert.fail("Request before selected fresh state"),
      }),
    /CCD_FIXTURE_SELECTION_MISMATCH/,
  );
  f.observed.acls.find((a) => a.role === "caseworker-privatelaw-judge").delete =
    true;
  assert.throws(
    () =>
      api.importCcdDefinition(f.state, {
        inspectContainer: f.inspectContainer,
        request: f.request,
        runDocker: f.runDocker,
      }),
    /CCD_EVENT_ACL_MISMATCH/,
  );
  assert.equal(f.state.definitionImported, undefined);
});

test("support only: source actors are provisioned and observed with exact three-role arrays", async () => {
  const api = await fixedRuntime();
  for (const persona of ["courtadmin", "judge", "readonly"]) {
    const roles = [
        "caseworker",
        "caseworker-harness",
        "caseworker-privatelaw-" + persona,
      ],
      calls = [];
    const request = (_state, port, route, options = {}) => {
      calls.push({ port, route, options });
      if (route === "/testing-support/accounts")
        return { status: 201, body: {} };
      if (route === "/o/token")
        return { status: 200, body: { access_token: "synthetic" } };
      if (route === "/details")
        return {
          status: 200,
          body: { id: "11111111-1111-4111-8111-111111111111", roles },
        };
      if (route === "/testing-support/lease")
        return { status: 200, body: "synthetic-s2s" };
      assert.fail(route);
    };
    const credential = api.ccdCredentials(
      { fixtureSelection: "event-capability-baseline" },
      persona,
      { request },
    );
    assert.deepEqual(credential.roles, roles);
    assert.deepEqual(
      calls.find((c) => c.route === "/testing-support/accounts").options.body
        .roles,
      roles.map((code) => ({ code })),
    );
    assert.equal(
      credential.roles.includes("caseworker-harness-allowed"),
      false,
    );
    assert.throws(
      () =>
        api.ccdCredentials({}, persona, {
          request: () => assert.fail("Source actor contacted outside scope"),
        }),
      /CCD_SOURCE_ACTOR_SCOPE_REQUIRED/,
    );
    for (const extra of ["caseworker-harness-allowed", "ccd-import"])
      assert.throws(
        () =>
          api.ccdCredentials(
            { fixtureSelection: "event-capability-mutant" },
            persona,
            {
              request: (state, port, route, options) =>
                route === "/details"
                  ? {
                      status: 200,
                      body: {
                        id: "11111111-1111-4111-8111-111111111111",
                        roles: [...roles, extra],
                      },
                    }
                  : route === "/testing-support/lease"
                    ? assert.fail("S2S before actor validation")
                    : request(state, port, route, options),
            },
          ),
        /CCD_SOURCE_ACTOR_ROLES_MISMATCH/,
      );
  }
});

test("support only: event startup persists fixed selection and unknown selection never contacts Docker", async (t) => {
  const api = await fixedRuntime();
  const parent = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "ccd-source-start-"),
  );
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const bad = path.join(parent, "unknown");
  await assert.rejects(
    api.startCcdRuntime(bad, {
      fixtureSelection: "caller-choice",
      runDocker: () => assert.fail("Docker contacted"),
    }),
    /CCD_FIXTURE_SELECTION_REQUIRED/,
  );
  assert.equal(fs.existsSync(bad), false);
  const output = path.join(parent, "selected");
  const runDocker = (args) => {
    if (args[0] === "image")
      return JSON.stringify([
        {
          Id: args[2],
          Architecture: "arm64",
          RepoDigests: ["fixture@" + args[2]],
        },
      ]);
    if (args[0] === "create") return "a".repeat(64);
    if (args[0] === "start") throw Error("SOURCE_START_STOP");
    assert.fail("unexpected fake Docker action");
  };
  await assert.rejects(
    api.startCcdRuntime(output, {
      fixtureSelection: "event-capability-mutant",
      runDocker,
    }),
    /SOURCE_START_STOP/,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(output, "runtime.json")))
      .fixtureSelection,
    "event-capability-mutant",
  );
});

test("support only: selected import receipt status and source pin must match before observer requests", async (t) => {
  const api = await fixedRuntime(),
    f = eventRuntimeFixture(t, api);
  api.importCcdDefinition(f.state, {
    inspectContainer: f.inspectContainer,
    request: f.request,
        runDocker: f.runDocker,
  });
  const file = path.join(f.state.output, "definition-import.json");
  const original = JSON.parse(fs.readFileSync(file));
  for (const [field, value, code] of [
    ["status", 500, /CCD_IMPORT_RECEIPT_STATUS_REQUIRED/],
    [
      "sourceProjectionDigest",
      "sha256:" + "0".repeat(64),
      /CCD_EVENT_SOURCE_BINDING_MISMATCH/,
    ],
  ]) {
    fs.writeFileSync(file, JSON.stringify({ ...original, [field]: value }));
    assert.throws(
      () =>
        api.verifyCcdRuntimeIdentity(f.state, {
          inspectContainer: f.inspectContainer,
          request: () =>
            assert.fail("Observer requested before receipt validation"),
        }),
      code,
    );
  }
});

test("support only: cancellation during database readiness stops probes and preserves partial recovery", async t => {
  const { startCcdRuntime, CCD_IMAGES } = await runtime;
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ccd-cancel-db-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const output = path.join(parent, "runtime"), calls = [];
  let cancelled = false, created = 0;
  const runDocker = args => {
    calls.push(args);
    if (args[0] === "image") return JSON.stringify([{ Id: args[2], Architecture: "arm64", RepoDigests: ["fixture@" + args[2]] }]);
    if (args[0] === "create") return String(++created).repeat(64);
    if (args[0] === "start") return "";
    if (args[0] === "exec" && args[2] === "node") return JSON.stringify([{ host: "synthetic", connected: false }]);
    if (args[2] === "pg_isready") {
      if (!cancelled) { cancelled = true; throw Error("database not ready"); }
      return "ready";
    }
    assert.fail("Command after cancelled database readiness: " + args[0] + " " + args[2]);
  };
  await assert.rejects(startCcdRuntime(output, { runDocker, isCancelled: () => cancelled }), /CCD_START_CANCELLED/);
  assert.equal(calls.filter(args => args[2] === "pg_isready").length, 1);
  assert.equal(calls.filter(args => args[0] === "create").length, 2);
  const state = JSON.parse(fs.readFileSync(path.join(output, "runtime.json")));
  const recovery = JSON.parse(fs.readFileSync(path.join(output, "recovery.json")));
  assert.equal(state.ready, false);
  assert.deepEqual(state.containers, { database: "1".repeat(64), client: "2".repeat(64) });
  assert.equal(recovery.owner, state.owner);
  assert.deepEqual(Object.keys(recovery.resources).sort(), Object.keys(CCD_IMAGES).sort());
  assert.equal(recovery.resources.database.name, state.owner + "-database");
});

test("support only: cancellation during service readiness prevents the next probe and never publishes ready", async t => {
  const { spawnSync } = require("node:child_process");
  const { pathToFileURL } = require("node:url");
  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ccd-cancel-health-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const marker = path.join(parent, "cancelled"), probes = path.join(parent, "probes.jsonl"), output = path.join(parent, "runtime");
  fs.writeFileSync(path.join(parent, "docker"), `#!${process.execPath}\nconst fs=require('node:fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));fs.appendFileSync(${JSON.stringify(probes)},JSON.stringify({url:input.url})+'\\n');fs.writeFileSync(${JSON.stringify(marker)},'cancelled');console.log(JSON.stringify({status:503,body:'{}'}));\n`, { mode: 0o755 });
  const runner = path.join(parent, "check.mjs");
  fs.writeFileSync(runner, `import fs from 'node:fs';import assert from 'node:assert/strict';import {startCcdRuntime,CCD_IMAGES} from ${JSON.stringify(pathToFileURL(path.join(__dirname, "lib/exui-ccd-runtime.mjs")).href)};
let created=0;const calls=[];const runDocker=args=>{calls.push(args);if(args[0]==='image')return JSON.stringify([{Id:args[2],Architecture:'arm64',RepoDigests:['fixture@'+args[2]]}]);if(args[0]==='create')return String(++created).repeat(64);if(args[0]==='start'||args[2]==='pg_isready'||args[2]==='psql')return '';if(args[0]==='exec'&&args[2]==='node')return JSON.stringify([{host:'synthetic',connected:false}]);assert.fail('unexpected action');};
await assert.rejects(startCcdRuntime(${JSON.stringify(output)},{runDocker,isCancelled:()=>fs.existsSync(${JSON.stringify(marker)})}),/CCD_START_CANCELLED/);
const state=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(output, "runtime.json"))}));const recovery=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(output, "recovery.json"))}));assert.equal(state.ready,false);assert.equal(recovery.owner,state.owner);assert.deepEqual(Object.keys(state.containers).sort(),Object.keys(CCD_IMAGES).sort());assert.equal(fs.readFileSync(${JSON.stringify(probes)},'utf8').trim().split('\\n').length,1);
`);
  const observed = spawnSync(process.execPath, [runner], { env: { PATH: parent }, encoding: "utf8", timeout: 3000 });
  assert.equal(observed.status, 0, observed.stderr || observed.error?.message);
  assert.equal(JSON.parse(fs.readFileSync(probes, "utf8").trim()).url, "http://127.0.0.1:5000/health");
});

test('AMD64 CCD image records bind each immutable manifest and reject relabelled state',async()=>{
 const {ccdImagePins,assertCcdImageIdentity,ccdRuntimeImageIds,CCD_IMAGES}=await runtime;
 const pins=ccdImagePins('linux/amd64');
 assert.deepEqual(Object.keys(pins).sort(),Object.keys(CCD_IMAGES).sort());
 const state={platform:'linux/amd64',images:{}};
 for(const [service,pin] of Object.entries(pins)) {
  const info={Id:pin.manifestDigest,Os:'linux',Architecture:'amd64',RepoDigests:[pin.reference]};
  assertCcdImageIdentity(info,pin,'linux/amd64');
  assertCcdImageIdentity({...info,Id:pin.configDigest},pin,'linux/amd64');
  for(const patch of [{Id:'sha256:'+'f'.repeat(64)},{Architecture:'arm64'},{Os:'windows'},{RepoDigests:[]}])
   assert.throws(()=>assertCcdImageIdentity({...info,...patch},pin,'linux/amd64'),/CCD_IMAGE_IDENTITY/);
  state.images[service]={id:info.Id,architecture:info.Architecture,repoDigests:info.RepoDigests};
 }
 assert.deepEqual(ccdRuntimeImageIds(state),Object.fromEntries(Object.entries(pins).map(([name,pin])=>[name,pin.manifestDigest])));
 assert.throws(()=>ccdRuntimeImageIds({...state,platform:'linux/arm64'}),/CCD_IMAGE_IDENTITY/);
 assert.throws(()=>ccdRuntimeImageIds({...state,images:{}}),/CCD_IMAGE_IDENTITY/);
 assert.throws(()=>ccdImagePins('linux/s390x'),/UNSUPPORTED_CCD_PLATFORM/);
});

test('AMD64 startup uses TCP readiness, synthetic databases and one exact local token issuer',async t=>{
 const api=await runtime,fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccd-amd64-start-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const calls=[],pins=api.ccdImagePins('linux/amd64');let cancelled=false;
 const runDocker=(args,input)=>{
  calls.push({args,input});
  if(args[0]==='image') {
   const pin=Object.values(pins).find(pin=>pin.reference===args[2]);assert(pin);
   return JSON.stringify([{Id:pin.configDigest,Os:'linux',Architecture:'amd64',RepoDigests:[pin.reference]}]);
  }
  if(args[0]==='create')return 'a'.repeat(64);
  if(args[0]==='exec'&&args.includes('node'))return '[]';
  if(args[0]==='start'&&calls.filter(c=>c.args[0]==='create').length===7)cancelled=true;
  return '';
 };
 const output=path.join(root,'runtime');
 await assert.rejects(api.startCcdRuntime(output,{platform:'linux/amd64',runDocker,isCancelled:()=>cancelled}),/CCD_START_CANCELLED/);
 const ready=calls.find(c=>c.args.includes('pg_isready')).args;
 assert.equal(ready[ready.indexOf('-h')+1],'127.0.0.1');
 const initialize=calls.find(c=>c.input?.includes('CREATE DATABASE'));
 assert.equal((initialize.input.match(/CREATE DATABASE/g)||[]).length,8);
 assert.match(initialize.input,/CREATE USER ccd WITH PASSWORD/);
 const launches=calls.filter(c=>c.args[0]==='create');
 const database=launches.find(c=>c.args.includes(pins.database.configDigest)).args;
 assert.equal(database[database.indexOf('--user')+1],'999:999');
 assert(launches.find(c=>c.args.includes(pins.idam.configDigest)).args.includes('SIMULATOR_JWT_ISSUER=http://127.0.0.1:5000/o'));
 assert(launches.find(c=>c.args.includes(pins.data.configDigest)).args.includes('OIDC_ALLOWED_ISSUERS=http://127.0.0.1:5000/o'));
 const recovery=JSON.parse(fs.readFileSync(path.join(output,'recovery.json')));
 assert.equal(recovery.platform,'linux/amd64');
 for(const [name,pin] of Object.entries(pins))assert.equal(recovery.resources[name].image,pin.configDigest);
});

test('support only: live verification requires retained stored dates and rechecks actual database values',async t=>{
 const api=await fixedRuntime(),f=eventRuntimeFixture(t,api);
 const options={inspectContainer:f.inspectContainer,request:f.request,runDocker:f.runDocker};
 api.importCcdDefinition(f.state,options);
 const file=path.join(f.state.output,'definition-import.json'),receipt=JSON.parse(fs.readFileSync(file));
 assert.equal(receipt.storedSourceShapeDates.definitionVersion,f.observed.version.number);
 delete receipt.storedSourceShapeDates;fs.writeFileSync(file,JSON.stringify(receipt));
 assert.throws(()=>api.verifyCcdRuntimeIdentity(f.state,options),/SHAPE_STORED_DATES_REQUIRED/);
 api.importCcdDefinition(f.state,options);
 assert.throws(()=>api.verifyCcdRuntimeIdentity(f.state,{...options,runDocker:(...args)=>{
  const rows=JSON.parse(f.runDocker(...args));rows[0].live_from='2020-01-01';return JSON.stringify(rows);
 }}),/SHAPE_STORED_DATE_ROWS_MISMATCH/);
});
