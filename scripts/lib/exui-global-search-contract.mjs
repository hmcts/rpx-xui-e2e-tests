import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { digestBytes } from './exui-evidence-io.mjs';
export const GLOBAL_SEARCH_SCOPE = 'exui-global-search-pilot';
export const GLOBAL_SEARCH_MUTATION = 'global-search-wa-capability';
const nine = ['IA','CIVIL','PRIVATELAW','PUBLICLAW','EMPLOYMENT','ST_CIC','PROBATE','PCS','DIVORCE'];
const seven = ['IA','CIVIL','PRIVATELAW','PUBLICLAW','EMPLOYMENT','ST_CIC','PCS'];
// Independently authored upstream rows: deliberately shuffled, with one non-Global-Search service.
export function globalSearchReferenceRows() {
  return [
    { ccd_service_name: 'SSCS', service_short_description: 'Synthetic Excluded SSCS' },
    { ccd_service_name: 'DIVORCE', service_short_description: 'Synthetic Divorce' },
    { ccd_service_name: 'PCS', service_short_description: 'Synthetic Possession' },
    { ccd_service_name: 'IA', service_short_description: 'Synthetic Immigration' },
    { ccd_service_name: 'PROBATE', service_short_description: 'Synthetic Probate' },
    { ccd_service_name: 'ST_CIC', service_short_description: 'Synthetic Special Tribunals' },
    { ccd_service_name: 'EMPLOYMENT', service_short_description: 'Synthetic Employment' },
    { ccd_service_name: 'PUBLICLAW', service_short_description: 'Synthetic Public Law' },
    { ccd_service_name: 'PRIVATELAW', service_short_description: 'Synthetic Private Law' },
    { ccd_service_name: 'CIVIL', service_short_description: 'Synthetic Civil' },
  ];
}
export function globalSearchConfiguration(config, mutation = null) {
  assert(mutation === null || mutation === GLOBAL_SEARCH_MUTATION, 'UNSUPPORTED_GLOBAL_SEARCH_MUTATION');
  const effective = structuredClone(config);
  if (mutation) {
    assert.equal(typeof effective.waSupportedJurisdictions, 'string', 'GLOBAL_SEARCH_WA_SOURCE_REQUIRED');
    effective.globalSearchServices = effective.waSupportedJurisdictions;
  }
  return effective;
}
export function isGlobalSearchRequest(body) {
  const ids = body?.searchCriteria?.CCDJurisdictionIds;
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) return false;
  const normalized = structuredClone(body);
  normalized.searchCriteria.CCDJurisdictionIds = [...ids].sort();
  return [nine, seven].some(services => isDeepStrictEqual(normalized, {
    searchCriteria: { CCDCaseTypeIds: null, CCDJurisdictionIds: [...services].sort(),
      caseManagementBaseLocationIds: null, caseManagementRegionIds: null,
      caseReferences: ['1111222233334444'], otherReferences: null, parties: [], stateIds: null },
    sortCriteria: null, maxReturnRecordCount: 25, startRecordNumber: 1,
  }));
}
export const globalSearchContract = () => ({
  reviewedSourceRevision: '76bf7a840fa71af466961de87294973023b2f0f3',
  referenceDataDigest: digestBytes(JSON.stringify(globalSearchReferenceRows())),
  scope: 'literal Global Search nine versus WA seven; synthetic labels; no profile/CCD/cache/auth credit',
});
