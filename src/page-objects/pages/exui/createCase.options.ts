type CreateCaseOptionLike = {
  label: string;
  value: string;
};

export const CREATE_CASE_OPTION_ALIASES: Record<string, string[]> = {
  DIVORCE: ["PRIVATELAW", "Family Private Law"],
  "XUI Case PoC": ["PRLAPPS", "C100 & FL401 Applications"],
  xuiTestCaseType: ["PRLAPPS", "C100 & FL401 Applications"]
};

export function normalizeCreateCaseOptionToken(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[\s_-]/g, "");
}

function resolveCreateCaseOptionAliases(desired: string): string[] {
  const normalizedDesired = normalizeCreateCaseOptionToken(desired);
  const matchedEntry = Object.entries(CREATE_CASE_OPTION_ALIASES).find(
    ([candidate]) => normalizeCreateCaseOptionToken(candidate) === normalizedDesired
  );
  return matchedEntry?.[1] ?? [];
}

export function listCreateCaseOptionCandidates(desired: string): string[] {
  const candidates = [desired, ...resolveCreateCaseOptionAliases(desired)];
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeCreateCaseOptionToken(candidate);
    if (!normalizedCandidate || seen.has(normalizedCandidate)) {
      continue;
    }
    seen.add(normalizedCandidate);
    deduped.push(candidate);
  }

  return deduped;
}

export function matchCreateCaseOption<T extends CreateCaseOptionLike>(
  options: T[],
  desired: string
): T | undefined {
  const candidateTokens = new Set(
    listCreateCaseOptionCandidates(desired).map(normalizeCreateCaseOptionToken)
  );

  return options.find((option) => {
    const valueToken = normalizeCreateCaseOptionToken(option.value);
    const labelToken = normalizeCreateCaseOptionToken(option.label);
    return candidateTokens.has(valueToken) || candidateTokens.has(labelToken);
  });
}

export function resolveCreateCaseStartEvent<T extends CreateCaseOptionLike>(
  options: T[],
  requestedEvent?: string
): T | undefined {
  if (!options.length) {
    return undefined;
  }

  const requestedToken = requestedEvent?.trim();
  if (requestedToken) {
    return matchCreateCaseOption(options, requestedToken);
  }

  const preferredDefaults = ["Solicitor application", "Create Case", "Create a case"];
  for (const preferredDefault of preferredDefaults) {
    const matchedOption = matchCreateCaseOption(options, preferredDefault);
    if (matchedOption) {
      return matchedOption;
    }
  }

  const nonTechnicalOption = options.find(
    (option) => !option.label.trim().toLowerCase().startsWith("ts-")
  );
  return nonTechnicalOption ?? options[0];
}
