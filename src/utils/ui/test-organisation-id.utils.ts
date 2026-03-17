export const TEST_SOLICITOR_ORGANISATION_ID_ENV =
  "TEST_SOLICITOR_ORGANISATION_ID";
export const DEFAULT_TEST_SOLICITOR_ORGANISATION_ID = "7F2BIK8";

type ResolveOrganisationIdOptions = {
  allowDefault?: boolean;
  throwIfMissing?: boolean;
  context?: string;
};

export function resolveTestSolicitorOrganisationId(
  options: ResolveOrganisationIdOptions = {},
): string | undefined {
  const allowDefault = options.allowDefault ?? true;
  const configured = process.env[TEST_SOLICITOR_ORGANISATION_ID_ENV]?.trim();
  const resolved =
    configured || (allowDefault ? DEFAULT_TEST_SOLICITOR_ORGANISATION_ID : "");
  if (resolved) {
    return resolved;
  }
  if (options.throwIfMissing) {
    const contextPrefix = options.context ? `${options.context}: ` : "";
    throw new Error(
      `${contextPrefix}set ${TEST_SOLICITOR_ORGANISATION_ID_ENV} (default fallback disabled).`,
    );
  }
  return undefined;
}

export function requireTestSolicitorOrganisationId(context?: string): string {
  return resolveTestSolicitorOrganisationId({
    allowDefault: true,
    throwIfMissing: true,
    context,
  })!;
}
