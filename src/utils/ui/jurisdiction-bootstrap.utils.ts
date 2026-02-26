import type { BrowserContext, Page } from "@playwright/test";

import { buildJurisdictionBootstrapFallbackMock } from "./jurisdiction-fallback.mock.js";

type JurisdictionBootstrapPayload = Array<{
  id?: unknown;
  caseTypes?: Array<{
    id?: unknown;
  }>;
}>;

export type RequiredCreateCaseType = {
  jurisdiction: string;
  caseTypes: string[];
};

export const JURISDICTION_BOOTSTRAP_ROUTE =
  "**/aggregated/caseworkers/**/jurisdictions*";

const hasRequiredCreateCaseTypes = (
  payload: JurisdictionBootstrapPayload,
  required: RequiredCreateCaseType[],
): boolean => {
  const available = new Set<string>();
  for (const jurisdiction of payload) {
    const jurisdictionId =
      typeof jurisdiction?.id === "string" ? jurisdiction.id.trim() : "";
    if (!jurisdictionId) {
      continue;
    }
    for (const caseType of jurisdiction.caseTypes ?? []) {
      const caseTypeId =
        typeof caseType?.id === "string" ? caseType.id.trim() : "";
      if (!caseTypeId) {
        continue;
      }
      available.add(`${jurisdictionId}:${caseTypeId}`.toLowerCase());
    }
  }

  return required.every((entry) => {
    const jurisdiction = entry.jurisdiction.trim().toLowerCase();
    const normalizedCaseTypes = entry.caseTypes
      .map((caseType) => caseType.trim().toLowerCase())
      .filter(Boolean);
    if (!jurisdiction || !normalizedCaseTypes.length) {
      return false;
    }
    return normalizedCaseTypes.some((caseType) =>
      available.has(`${jurisdiction}:${caseType}`),
    );
  });
};

export async function installCreateJurisdictionFallbackRoute(
  target: Pick<BrowserContext, "route"> | Pick<Page, "route">,
  required: RequiredCreateCaseType[],
): Promise<void> {
  await target.route(JURISDICTION_BOOTSTRAP_ROUTE, async (route) => {
    const safeFulfill = async (
      payload: Parameters<typeof route.fulfill>[0],
    ): Promise<boolean> => {
      try {
        await route.fulfill(payload);
        return true;
      } catch (error) {
        if (String(error).includes("Route is already handled")) {
          return false;
        }
        throw error;
      }
    };

    const requestUrl = route.request().url();
    const liveResponse = await route.fetch().catch(() => null);
    const fallbackPayload = buildJurisdictionBootstrapFallbackMock();

    const isCreateAccessRequest = requestUrl.includes("access=create");
    if (!isCreateAccessRequest) {
      if (liveResponse) {
        await safeFulfill({ response: liveResponse });
        return;
      }
      await safeFulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fallbackPayload),
      });
      return;
    }

    if (!liveResponse) {
      await safeFulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fallbackPayload),
      });
      return;
    }

    if (liveResponse.status() >= 500) {
      await safeFulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fallbackPayload),
      });
      return;
    }

    const livePayload = (await liveResponse
      .json()
      .catch(() => null)) as JurisdictionBootstrapPayload | null;
    if (
      !Array.isArray(livePayload) ||
      !hasRequiredCreateCaseTypes(livePayload, required)
    ) {
      await safeFulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fallbackPayload),
      });
      return;
    }

    await safeFulfill({ response: liveResponse });
  });
}
