import { lookup } from "node:dns/promises";

import { config as uiConfig } from "../../../utils/ui/config.utils";

type ProvisioningRuntimeStatus = {
  available: boolean;
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
