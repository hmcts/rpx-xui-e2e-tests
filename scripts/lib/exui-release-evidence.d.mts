export type CandidateIdentity = {
  webappCommit: string;
  artifactDigest: string;
  dependencyLockDigest: string;
  toolkitVersion: string;
  toolkitDigest: string;
  configurationDigest: string;
  definitionDigests: Record<string, string>;
  dependencyIdentities: Record<string, { artifactDigest: string; apiContractDigest: string }>;
};

export type RunManifest = {
  schemaVersion: 1;
  runId: string;
  harnessCommit: string;
  releaseScopeId: string;
  policyDigest: string;
  runtimeMetadata: Record<string, string>;
  identity: CandidateIdentity;
  requiredObligationIds: string[];
};

export type Obligation = {
  id: string;
  boundary: 'model' | 'dependency' | 'candidate' | 'ccd' | 'external';
  requiredProofIds: string[];
  requiredMutationIds: string[];
};

export type ProofResult = {
  proofId: string;
  obligationId: string;
  runId: string;
  invocationId: string;
  identity: CandidateIdentity;
  boundary: Obligation['boundary'];
  outcome: 'passed' | 'failed' | 'skipped' | 'blocked';
  retryIndex: number;
  complete: boolean;
  failureId: string | null;
  artifacts: string[];
};

export type ExecutionReceipt = {
  invocationId: string;
  runId: string;
  identity: CandidateIdentity;
  kind: 'baseline' | 'mutation';
  terminalState: 'completed' | 'interrupted';
  runnerExitCode: number | null;
  unexpectedGlobalErrors: string[];
  resultArtifact: { path: string; digest: string };
};

export type MutationDefinition = {
  mutationId: string;
  obligationId: string;
  definitionDigest: string;
  expectedFailureId: string;
  baselineProofId: string;
  mutantProofId: string;
};

export type ReleasePolicy = {
  releaseScopeId: string;
  policyDigest: string;
  requiredObligationIds: string[];
  obligations: Obligation[];
  mutationDefinitions: MutationDefinition[];
};

export type MutationResult = {
  mutationId: string;
  obligationId: string;
  runId: string;
  baselineIdentity: CandidateIdentity;
  mutantIdentity: CandidateIdentity;
  mutationDefinitionDigest: string;
  baselineResult: ProofResult;
  mutantResult: ProofResult;
};

export type ReleaseEvidence = {
  manifest: RunManifest;
  policy: ReleasePolicy;
  executions: ExecutionReceipt[];
  results: ProofResult[];
  mutations: MutationResult[];
};

export type GateVerdict = {
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  exitCode: 0 | 1 | 2;
  reasons: string[];
};

export type PromotionExpected = Pick<RunManifest, 'runId' | 'harnessCommit' | 'releaseScopeId' | 'policyDigest' | 'identity'> & {
  evidenceManifestDigest: string;
};

export type GateReceipt = PromotionExpected & { schemaVersion: 1; verdict: GateVerdict };

export function validateRunManifest(input: unknown): RunManifest;
export function evaluateReleaseEvidence(input: unknown): GateVerdict;
export function createGateReceipt(manifest: RunManifest, evidenceManifestDigest: string, verdict: GateVerdict): GateReceipt;
export function validatePromotionReceipt(receipt: unknown, expected: unknown): GateVerdict;
