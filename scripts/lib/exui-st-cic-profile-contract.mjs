import assert from 'node:assert/strict';
import { sourceProfileJurisdictionConfiguration } from './exui-source-profile-jurisdictions.mjs';
import { digestBytes } from './exui-evidence-io.mjs';

export const ST_CIC_PROFILE_ID = 'configuration-profile:31fed7b5d70bd2e333287f0b982632381576d11fbc15d71e90f27c14d986983b';
export const ST_CIC_PROFILE_FACETS = Object.freeze([
  { facet: 'st-cic-global-search', fault: 'source-profile-drop-st-cic-global-search', browser: true },
  { facet: 'st-cic-wa', fault: 'source-profile-remove-st-cic-wa-membership', browser: false },
  { facet: 'st-cic-staff', fault: 'source-profile-drop-st-cic-staff', browser: false },
  { facet: 'st-cic-mapping', fault: 'source-profile-change-st-cic-code', browser: false },
  { facet: 'st-cic-wa-health', fault: 'source-profile-enable-st-cic-wa-health', browser: false },
].map(Object.freeze));
export const stCicProfileContract = () => ({
  schemaVersion: 1, obligationId: ST_CIC_PROFILE_ID, profile: 'config/default.json', family: 'ST_CIC',
  sourceKey: 'rpx-xui-webapp:config/default.json', sourceRevision: '20c6ec129fc1e81061c733e164198ec63a33e71a',
  sourceDigest: 'sha256:ab78791c4a5ced4341e79cd6fabe114e12e06b667f59936d66ffb513433c65d1',
  consumerRevision: '1a986f4dc87e6ea4598e30c042bf2b3072122b75',
  capabilities: ['globalSearchServices', 'waSupportedJurisdictions', 'staffSupportedJurisdictions', 'serviceRefDataMapping'],
  facets: structuredClone(ST_CIC_PROFILE_FACETS),
  dispositions: ['ST_CIC absent from jurisdictions: no jurisdiction selector/filter/cache credit',
    'ST_CIC absent from hearingsJurisdictions: no hearing journey credit',
    'Source workAllocationEnabled=false; WA route membership and shared health are separate consumers',
    'Synthetic session/providers and controlled browser flags; no deployed service, CCD permissions or case-view WA-tab credit'],
  runtimeAcceptance: false, catalogueCredit: false, wholeProfileSatisfied: false, releaseCredit: false, releaseApproval: false,
});
export const stCicProfileContractDigest = () => digestBytes(JSON.stringify(stCicProfileContract()));
export function stCicFacet(facet, mutation = null) {
  const selected = ST_CIC_PROFILE_FACETS.find(row => row.facet === facet);
  assert(selected, 'ST_CIC_FACET_INVALID');
  assert(mutation === null || mutation === selected.fault, 'ST_CIC_FAULT_INVALID');
  return selected;
}
export function assertStCicProfileArtifact(artifact) {
  assert.equal(artifact.provenance.sourceMethod, 'git-archive', 'ST_CIC_CONSUMER_INVALID');
  assert.equal(artifact.provenance.webappCommit, stCicProfileContract().consumerRevision, 'ST_CIC_CONSUMER_INVALID');
  assert.equal(artifact.identity.webappCommit, artifact.provenance.webappCommit, 'ST_CIC_CONSUMER_INVALID');
}
export function applyStCicProfileFault(config, facet, mutation) {
  stCicFacet(facet, mutation);
  if (mutation === null) return config;
  const key = { 'st-cic-global-search': 'globalSearchServices', 'st-cic-wa': 'waSupportedJurisdictions', 'st-cic-staff': 'staffSupportedJurisdictions' }[facet];
  if (key) config[key] = config[key].split(',').filter(id => id !== 'ST_CIC').join(',');
  else if (facet === 'st-cic-mapping') config.serviceRefDataMapping.find(row => row.service === 'ST_CIC').serviceCodes = ['ZZZ1'];
  else config.feature.workAllocationEnabled = true;
  return config;
}
export function stCicProfileConfiguration(candidateRoot, facet, mutation = null) {
  stCicFacet(facet, mutation);
  const { config } = sourceProfileJurisdictionConfiguration(candidateRoot);
  for (const key of ['globalSearchServices', 'waSupportedJurisdictions', 'staffSupportedJurisdictions'])
    assert(config[key].split(',').includes('ST_CIC'), 'ST_CIC_SOURCE_INVALID');
  assert(!config.jurisdictions.split(',').includes('ST_CIC'), 'ST_CIC_SOURCE_INVALID');
  assert(!config.services.hearings.hearingsJurisdictions.split(',').includes('ST_CIC'), 'ST_CIC_SOURCE_INVALID');
  assert.deepEqual(config.serviceRefDataMapping.filter(row => row.service === 'ST_CIC'), [{ service: 'ST_CIC', serviceCodes: ['BBA2'] }], 'ST_CIC_SOURCE_INVALID');
  assert.equal(config.feature.workAllocationEnabled, false, 'ST_CIC_SOURCE_INVALID');
  applyStCicProfileFault(config, facet, mutation);
  return { config, digest: digestBytes(JSON.stringify(config)), contract: { ...stCicProfileContract(), scope: `exui-${facet}-feasibility`, facet, mutation } };
}
