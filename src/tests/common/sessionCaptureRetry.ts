const explicitIdamRejectionPatterns = [
  /(?:email or password is incorrect|incorrect email or password)/i,
  /invalid (?:email|username|password|credentials)/i,
  /account (?:is )?(?:disabled|locked|suspended)/i,
  /user (?:does not exist|not found)/i,
] as const;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function isExplicitIdamLoginRejection(error: unknown): boolean {
  const message = errorMessage(error);
  if (!/Login page error:|IDAM page message:/i.test(message)) {
    return false;
  }
  return explicitIdamRejectionPatterns.some((pattern) => pattern.test(message));
}

export function isUnexplainedIdamLoginRejection(error: unknown): boolean {
  return /Login did not establish session cookies|IDAM login did not establish authenticated session/i.test(
    errorMessage(error)
  );
}

export function isIdentityScopedCaptureTimeout(error: unknown): boolean {
  return /Unable to capture UI session for .*?(?:Timed out waiting for auth cookies|capture attempt timed out)/i.test(
    errorMessage(error)
  );
}

export function isIdentityScopedLoginSurfaceTimeout(error: unknown): boolean {
  return /Unable to capture UI session for .*?Login page did not render/i.test(errorMessage(error));
}
