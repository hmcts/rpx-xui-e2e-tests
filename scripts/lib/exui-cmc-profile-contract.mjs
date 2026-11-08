import assert from 'node:assert/strict';
import {digestBytes} from './exui-evidence-io.mjs';
import {sourceProfileJurisdictionConfiguration} from './exui-source-profile-jurisdictions.mjs';

export const CMC_PROFILE_ID='configuration-profile:9f8861dc4397f038730d2e35ba50dbab6de81313c46f8978298511a2420b3a0c';
export const CMC_PROFILE_FACET=Object.freeze({facet:'cmc-jurisdiction',fault:'source-profile-drop-cmc-jurisdiction'});
const credits={runtimeAcceptance:false,catalogueCredit:false,wholeProfileSatisfied:false,releaseCredit:false,releaseApproval:false};

export function cmcProfileContract(){
 return {schemaVersion:1,kind:'source-defined-family-profile',obligationId:CMC_PROFILE_ID,profile:'config/default.json',family:'CMC',
  sourceRevision:'20c6ec129fc1e81061c733e164198ec63a33e71a',sourceDigest:'sha256:ab78791c4a5ced4341e79cd6fabe114e12e06b667f59936d66ffb513433c65d1',
  consumerRevision:'20c6ec129fc1e81061c733e164198ec63a33e71a',claim:'Candidate default configuration selects CMC in the jurisdiction list served by the EXUI candidate.',
  capabilities:['jurisdictions'],facets:[CMC_PROFILE_FACET],
  noClaims:['staffSupportedJurisdictions','globalSearchServices','waSupportedJurisdictions','serviceRefDataMapping','hearings jurisdictions or case types','deployed overlays','CCD definitions or authorisations','production CMC readiness','full CMC case journey'],
  syntheticBoundary:'Synthetic session and jurisdiction rows; candidate EXUI route and candidate configuration are real.',...credits};
}
export const cmcProfileContractDigest=()=>digestBytes(JSON.stringify(cmcProfileContract()));

export function projectCmcJurisdiction(config,mutation=null){
 assert(mutation===null||mutation===CMC_PROFILE_FACET.fault,'CMC_PROFILE_FAULT_INVALID');
 assert(config&&typeof config.jurisdictions==='string'&&config.jurisdictions.split(',').includes('CMC'),'CMC_PROFILE_SOURCE_INVALID');
 const projected=structuredClone(config);
 if(mutation)projected.jurisdictions=projected.jurisdictions.split(',').filter(id=>id!=='CMC').join(',');
 return projected;
}

export function cmcProfileConfiguration(candidateRoot,mutation=null){
 assert(mutation===null||mutation===CMC_PROFILE_FACET.fault,'CMC_PROFILE_FAULT_INVALID');
 const {config}=sourceProfileJurisdictionConfiguration(candidateRoot);
 assert(config.jurisdictions.split(',').includes('CMC'),'CMC_PROFILE_SOURCE_INVALID');
 for(const key of ['globalSearchServices','waSupportedJurisdictions','staffSupportedJurisdictions','services.hearings.hearingsJurisdictions']){
  const value=key.split('.').reduce((current,part)=>current?.[part],config);
  assert(!(typeof value==='string'&&value.split(',').includes('CMC')),'CMC_PROFILE_SOURCE_INVALID');
 }
 const projected=projectCmcJurisdiction(config,mutation);
 return {config:projected,digest:digestBytes(JSON.stringify(projected)),contract:{...cmcProfileContract(),facet:CMC_PROFILE_FACET.facet,mutation,scope:'exui-cmc-jurisdiction-candidate-profile',...credits}};
}

export function assertCmcProfileArtifact(artifact){
 assert.equal(artifact.provenance.webappCommit,cmcProfileContract().consumerRevision,'CMC_PROFILE_CONSUMER_INVALID');
 assert.equal(artifact.identity.webappCommit,artifact.provenance.webappCommit,'CMC_PROFILE_CONSUMER_INVALID');
}
