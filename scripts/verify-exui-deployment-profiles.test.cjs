const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const yaml = require("js-yaml");
const snapshot = JSON.parse(fs.readFileSync("scripts/fixtures/exui-configuration-source.json"));
const review = JSON.parse(fs.readFileSync("scripts/fixtures/exui-configuration-review.json"));
const unknown = ["ADOPTION", "BEFTA_JURISDICTION_1", "BEFTA_JURISDICTION_2", "BEFTA_JURISDICTION_3", "BEFTA_MASTER", "DISPOSER_MASTER", "PRL", "PT", "WA"];
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("support only: independent source profiles expose15-key presence and nine preview gaps without changing112 obligations", async () => {
  const api = await import("./lib/exui-configuration-catalogue.mjs");
  const catalogue = api.buildConfigurationCatalogue(snapshot, review);
  assert.deepEqual(catalogue.deploymentProfiles.map(x => x.name), ["base", "aat", "preview"]);
  assert.equal(digest(JSON.stringify(catalogue.obligations)), "6a2953d46a5082360397549d790e35f11d59e46ef353cd49a588b0497822f377");
  const [base, aat, preview] = catalogue.deploymentProfiles;
  for (const profile of catalogue.deploymentProfiles) {
    assert.equal(Object.keys(profile.environment).length, 15);
    assert.deepEqual(profile.environment.WA_SUPPORTED_JURISDICTIONS, { present: false });
    assert.deepEqual(profile.environment.NODE_ENV, { present: true, value: "production" });
    assert.deepEqual(profile.environment.APPINSIGHTS_SAMPLING_PERCENTAGE, { present: true, value: 1 });
  }
  assert.deepEqual(base.environment.FEATURE_OIDC_ENABLED, { present: true, value: false });
  assert.deepEqual(aat.environment.FEATURE_OIDC_ENABLED, { present: true, value: true });
  assert.deepEqual(preview.environment.FEATURE_WORKALLOCATION_ENABLED, { present: true, value: true });
  assert.deepEqual(preview.environment.FEATURE_ACCESS_MANAGEMENT_ENABLED, { present: true, value: true });
  assert.deepEqual(preview.unreviewedFamilies, unknown);
  assert.equal(preview.environment.JURISDICTIONS.value.split(",").length, 22);
  const validation = api.validateConfigurationCatalogue({snapshot, review, catalogue});
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.coverage.missingCandidateOrCcd.length, 112);
  assert.equal(validation.gaps.filter(x=>x.startsWith("deployment-runtime-unproved:")).length, 45);
  for(const family of unknown) assert(validation.gaps.includes(`unreviewed-deployment-family:preview:JURISDICTIONS:${family}`));
});

test("support only: deployment YAML keeps absent/null/empty/false and CORE string dates without copying unrelated values", async () => {
  const { projectDeploymentSource } = await import("./lib/exui-deployment-profiles.mjs");
  const doc = projectDeploymentSource("charts/xui-webapp/values.yaml", Buffer.from('nodejs:\n  environment:\n    WA_SUPPORTED_JURISDICTIONS: null\n    GLOBAL_SEARCH_SERVICES: ""\n    FEATURE_OIDC_ENABLED: false\n    NODE_ENV: 2026-11-03\n    UNSELECTED_SECRET: DO-NOT-COPY\n'));
  assert.deepEqual(doc.environment.WA_SUPPORTED_JURISDICTIONS, {present:true,value:null});
  assert.deepEqual(doc.environment.GLOBAL_SEARCH_SERVICES, {present:true,value:""});
  assert.deepEqual(doc.environment.FEATURE_OIDC_ENABLED, {present:true,value:false});
  assert.deepEqual(doc.environment.STAFF_SUPPORTED_JURISDICTIONS, {present:false});
  assert.deepEqual(doc.environment.NODE_ENV, {present:true,value:"2026-11-03"});
  assert(!JSON.stringify(doc).includes("DO-NOT-COPY"));
  assert(!Object.hasOwn(doc.environment,"UNSELECTED_SECRET"));
});

for (const [name, text] of [
  ["duplicate", 'nodejs:\n  environment:\n    NODE_ENV: a\n    NODE_ENV: b'],
  ["object", 'nodejs:\n  environment:\n    NODE_ENV: {nested: value}'],
  ["array", 'nodejs:\n  environment:\n    NODE_ENV: [value]'],
  ["cycle", 'nodejs:\n  environment:\n    NODE_ENV: &loop [*loop]'],
  ["nonfinite", 'nodejs:\n  environment:\n    APPINSIGHTS_SAMPLING_PERCENTAGE: .nan'],
  ["merge", 'nodejs:\n  environment:\n    <<: {NODE_ENV: a}'],
]) test("support only: unsupported selected YAML " + name + " blocks source projection", async()=>{
  const {projectDeploymentSource} = await import("./lib/exui-deployment-profiles.mjs");
  assert.throws(()=>projectDeploymentSource("charts/xui-webapp/values.yaml",Buffer.from(text)));
});

function writeDeploymentFixture(root) {
  for(const source of snapshot.deploymentSources.sources) {
    const file = path.join(root,source.path);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    const doc = source.path.endsWith("Chart.yaml") ? source.document : {nodejs:{environment:Object.fromEntries(Object.entries(source.document.environment).filter(([,entry])=>entry.present).map(([key,entry])=>[key,entry.value]))}};
    fs.writeFileSync(file,yaml.dump(doc));
  }
}

test("support only: source discovery includes added values YAML and explicitly rejects yml, without touching the input",async()=>{
  const {readDeploymentSources,deploymentProfileAccounting}=await import("./lib/exui-deployment-profiles.mjs");
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"deployment-reader-"));
  try {
    writeDeploymentFixture(root);
    fs.writeFileSync(path.join(root,"charts/xui-webapp/values.future.yaml"),"nodejs: {environment: {NODE_ENV: future}}");
    const result=readDeploymentSources(root,()=>({revision:"a".repeat(40),tracked:true}));
    assert.equal(result.sources.length,5);
    assert(result.sources.some(x=>x.path.endsWith("values.future.yaml")));
    assert(deploymentProfileAccounting(result,review).errors.includes("deployment-unreviewed-source:charts/xui-webapp/values.future.yaml"));
    fs.writeFileSync(path.join(root,"charts/xui-webapp/values.future.yml"),"{}");
    assert.throws(()=>readDeploymentSources(root,()=>({})),/UNSUPPORTED_DEPLOYMENT_SOURCE/);
    assert(fs.existsSync(path.join(root,"charts/xui-webapp/values.future.yaml")));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

for(const fault of ["block-missing","source-missing","untracked","raw-pin","revision","fragment","extra-key","value","profile-missing","profile-extra","key-missing"])
 test("support only: independent deployment review rejects "+fault+" even when expectedSnapshot matches altered input",async()=>{
  const api=await import("./lib/exui-configuration-catalogue.mjs");
  const s=structuredClone(snapshot),r=structuredClone(review);
  if(fault==="block-missing") delete s.deploymentSources;
  else if(fault==="source-missing") s.deploymentSources.sources.pop();
  else if(fault==="profile-missing") delete r.checkedInDeploymentProfiles.profiles.preview;
  else if(fault==="profile-extra") r.checkedInDeploymentProfiles.profiles.future={};
  else {
    const source=s.deploymentSources.sources.find(x=>x.path.endsWith("values.preview.template.yaml"));
    if(fault==="untracked") source.tracked=false;
    if(fault==="raw-pin") source.fileDigest="a".repeat(64);
    if(fault==="revision") source.revision="b".repeat(40);
    if(fault==="fragment") source.document.environment.NODE_ENV={present:true,value:"changed"};
    if(fault==="extra-key") source.document.environment.EXTRA={present:true,value:"extra"};
    if(fault==="key-missing") delete source.document.environment.NODE_ENV;
    if(fault==="value") source.document.environment.FEATURE_WORKALLOCATION_ENABLED={present:true,value:false};
  }
  const catalogue=api.buildConfigurationCatalogue(s,r);
  const result=api.validateConfigurationCatalogue({snapshot:s,review:r,catalogue,expectedSnapshot:s});
  assert(result.errors.some(x=>x.startsWith("deployment-")),JSON.stringify(result));
 });

test("support only: profile metadata cannot be removed or discharged by passing catalogue proofs and Helm impacts stay broad",async()=>{
  const api=await import("./lib/exui-configuration-catalogue.mjs");
  const catalogue=api.buildConfigurationCatalogue(snapshot,review);
  const proofs=catalogue.obligations.map(x=>({obligationId:x.id,boundary:x.requiredBoundary,status:"passed"}));
  const result=api.validateConfigurationCatalogue({snapshot,review,catalogue,executedProofs:proofs});
  assert.equal(result.gaps.filter(x=>x.startsWith("deployment-runtime-unproved:")).length,45);
  for(const family of unknown) assert(result.gaps.includes(`unreviewed-deployment-family:preview:JURISDICTIONS:${family}`));
  for(const file of ["charts/xui-webapp/Chart.yaml","charts/xui-webapp/values.preview.template.yaml","charts/xui-webapp/values.future.yaml"]){
    const selected=api.selectConfigurationObligations(catalogue,[{repository:"rpx-xui-webapp",path:file}]);
    assert.equal(selected.mode,"broad");assert.equal(selected.obligationIds.length,112);
  }
  catalogue.deploymentProfiles=[];
  assert(api.validateConfigurationCatalogue({snapshot,review,catalogue}).errors.includes("deployment-profile-metadata-drift"));
});

test("support only: one unreviewed family in two declared capabilities preserves both source gaps",async()=>{
  const api=await import("./lib/exui-configuration-catalogue.mjs");
  const changed=structuredClone(snapshot);
  const preview=changed.deploymentSources.sources.find(x=>x.path.endsWith("values.preview.template.yaml"));
  preview.document.environment.WA_SUPPORTED_JURISDICTIONS={present:true,value:"PT"};
  const catalogue=api.buildConfigurationCatalogue(changed,review);
  const result=api.validateConfigurationCatalogue({snapshot:changed,review,catalogue});
  assert(result.gaps.includes("unreviewed-deployment-family:preview:JURISDICTIONS:PT"));
  assert(result.gaps.includes("unreviewed-deployment-family:preview:WA_SUPPORTED_JURISDICTIONS:PT"));
});

test("support only: a later explicit null stays declared null with its own source and never resurrects the base value",async()=>{
  const {deploymentProfileAccounting}=await import("./lib/exui-deployment-profiles.mjs");
  const changed=structuredClone(snapshot.deploymentSources);
  const aat=changed.sources.find(x=>x.path.endsWith("values.aat.template.yaml"));
  aat.document.environment.FEATURE_OIDC_ENABLED={present:true,value:null};
  const result=deploymentProfileAccounting(changed,review);
  const profile=result.profiles.find(x=>x.name==="aat");
  assert.deepEqual(profile.environment.FEATURE_OIDC_ENABLED,{present:true,value:null});
  assert.equal(profile.valueSources.FEATURE_OIDC_ENABLED,"charts/xui-webapp/values.aat.template.yaml");
  assert(result.gaps.includes("deployment-declared-null:aat:FEATURE_OIDC_ENABLED"));
  assert(result.errors.includes("deployment-source-fragment-drift:charts/xui-webapp/values.aat.template.yaml"));
});
