import { expect, type TestInfo } from '@playwright/test';

import { normalizeServiceFamily, sortServiceFamilies, sortedUniqueServiceFamilies } from '../../data/exui-central-assurance.js';

const ASSURANCE_MUTATIONS = {
  'drop-prl-wa-family': {
    endpoint: 'api/wa-supported-jurisdiction/get',
    description:
      'Demo fault: simulate EXUI no longer exposing Private Law as a Work Allocation-supported service family.',
    removedFamily: 'PRIVATELAW',
  },
  'drop-st-cic-wa-family': {
    endpoint: 'api/wa-supported-jurisdiction/get',
    description:
      'Demo fault: simulate EXUI no longer exposing Special Tribunals as a Work Allocation-supported service family.',
    removedFamily: 'ST_CIC',
  },
  'drop-probate-staff-family': {
    endpoint: 'api/staff-supported-jurisdiction/get',
    description:
      'Demo fault: simulate EXUI no longer exposing Probate as a staff-supported service family.',
    removedFamily: 'PROBATE',
  },
  'drop-civil-hearings-case-type': {
    endpoint: 'services.hearings.civil.caseTypes',
    description: 'Demo fault: simulate EXUI no longer exposing Civil as a hearings-enabled case type.',
    removedFamily: 'CIVIL',
  },
  'drop-employment-service-code': {
    endpoint: 'service-ref-data.employment.serviceCodes',
    description: 'Demo fault: simulate EXUI no longer mapping Employment to the BHA1 service code.',
    removedFamily: 'BHA1',
  },
  'drop-ia-hearings-bail-case-type': {
    endpoint: 'services.hearings.ia.caseTypes',
    description: 'Demo fault: simulate EXUI no longer exposing Bail as an IA hearings-enabled case type.',
    removedFamily: 'BAIL',
  },
} as const;

type AssuranceMutation = keyof typeof ASSURANCE_MUTATIONS;

const ASSURANCE_MUTATION = process.env.EXUI_ASSURANCE_MUTATION?.trim();

function isAssuranceMutation(value: string): value is AssuranceMutation {
  return value in ASSURANCE_MUTATIONS;
}

export function expectCentralMustRunFamiliesPresent(
  actual: readonly string[],
  expected: readonly string[],
  endpoint: string
): void {
  const actualFamilies = sortedUniqueServiceFamilies(actual);
  const expectedFamilies = sortServiceFamilies(expected);
  const missingFamilies = expectedFamilies.filter((family) => !actualFamilies.includes(family));

  expect(
    missingFamilies,
    `${endpoint} is missing central must-run service families: ${missingFamilies.join(', ') || 'none'}`
  ).toEqual([]);
}

export function mutateStringArrayForDemo(actual: readonly string[], endpoint: string): string[] {
  if (!ASSURANCE_MUTATION) {
    return [...actual];
  }

  if (!isAssuranceMutation(ASSURANCE_MUTATION)) {
    throw new Error(
      `Unsupported EXUI_ASSURANCE_MUTATION=${ASSURANCE_MUTATION}. Supported values: ${Object.keys(ASSURANCE_MUTATIONS).join(', ')}`
    );
  }

  const mutation = ASSURANCE_MUTATIONS[ASSURANCE_MUTATION];
  if (mutation.endpoint !== endpoint) {
    return [...actual];
  }

  return actual.filter((family) => normalizeServiceFamily(family) !== mutation.removedFamily);
}

function mutationLabel(): string | undefined {
  if (!ASSURANCE_MUTATION) {
    return undefined;
  }

  if (!isAssuranceMutation(ASSURANCE_MUTATION)) {
    return `unknown mutation ${ASSURANCE_MUTATION}`;
  }

  const mutation = ASSURANCE_MUTATIONS[ASSURANCE_MUTATION];
  return `${ASSURANCE_MUTATION}: ${mutation.description}`;
}

export async function attachMutationEvidence(testInfo: TestInfo): Promise<void> {
  const mutation = mutationLabel();
  if (!mutation) {
    return;
  }

  testInfo.annotations.push({ type: 'EXUI assurance mutation', description: mutation });
  await testInfo.attach('exui-assurance-mutation.txt', {
    body: mutation,
    contentType: 'text/plain',
  });
}
