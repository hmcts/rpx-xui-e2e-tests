import { lookup } from "node:dns/promises";

import { config as uiConfig } from "../../../utils/ui/config.utils";

type ProvisioningRuntimeStatus = {
  available: boolean;
  reason?: string;
};

type EmploymentAssignmentPreflightStatus = {
  enabled: boolean;
  reason?: string;
};

let cachedStatus: Promise<ProvisioningRuntimeStatus> | undefined;

function resolveTestingSupportHostname(): string | undefined {
  const configured =
    process.env.IDAM_TESTING_SUPPORT_URL ?? uiConfig.urls.idamTestingSupportUrl;
  try {
    return new URL(configured).hostname;
  } catch {
    return undefined;
  }
}

export async function getProvisioningRuntimeStatus(): Promise<ProvisioningRuntimeStatus> {
  cachedStatus ??= (async () => {
    const hostname = resolveTestingSupportHostname();
    if (!hostname) {
      return {
        available: false,
        reason: "IDAM testing support URL is not configured",
      };
    }

    try {
      await lookup(hostname);
      return { available: true };
    } catch {
      return {
        available: false,
        reason: `IDAM testing support host is not resolvable: ${hostname}`,
      };
    }
  })();

  return cachedStatus;
}

export function getEmploymentAssignmentPreflightStatus(): EmploymentAssignmentPreflightStatus {
  const configured =
    process.env.PW_EMPLOYMENT_ASSIGNMENT_PREFLIGHT?.trim().toLowerCase();

  if (!configured || ["0", "false", "no", "off"].includes(configured)) {
    return {
      enabled: false,
      reason:
        "Employment assignment preflight disabled; set PW_EMPLOYMENT_ASSIGNMENT_PREFLIGHT=1 to enable.",
    };
  }

  return { enabled: true };
}
