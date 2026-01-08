import { randomUUID } from "node:crypto";

import { test, expect, request, type APIRequestContext } from "@playwright/test";

import { config as apiConfig } from "../../config/api";
import {
  PRL_TEST_SUPPORT_CASE_DATA,
  PRL_TEST_SUPPORT_CASE_TYPE_ID,
  PRL_TEST_SUPPORT_EVENT_ID
} from "../../data/ccd/prl-case-create";
import { ensureStorageState, getStoredCookie } from "../../fixtures/api-auth";
import { createCase } from "../../utils/api/case-creation";

const resolveEnv = (names: string[], fallback?: string): string | undefined => {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
};

const resolveCaseCreationConfig = () => {
  const caseTypeId = resolveEnv(
    ["CASE_CREATE_CASE_TYPE_ID", "PRL_CASE_TYPE_ID"],
    PRL_TEST_SUPPORT_CASE_TYPE_ID
  ) as string;
  const eventId = resolveEnv(
    ["CASE_CREATE_EVENT_ID", "PRL_CASE_EVENT_ID"],
    PRL_TEST_SUPPORT_EVENT_ID
  ) as string;
  const caseTypeOfApplication = resolveEnv(
    ["CASE_CREATE_APPLICATION_TYPE", "PRL_CASE_TYPE_OF_APPLICATION"],
    PRL_TEST_SUPPORT_CASE_DATA.caseTypeOfApplication
  ) as string;
  const baseCaseName = resolveEnv(
    ["CASE_CREATE_CASE_NAME"],
    PRL_TEST_SUPPORT_CASE_DATA.applicantCaseName
  ) as string;
  const nameSuffix = randomUUID().split("-")[0];

  return {
    caseTypeId,
    eventId,
    data: {
      ...PRL_TEST_SUPPORT_CASE_DATA,
      caseTypeOfApplication,
      applicantCaseName: `${baseCaseName} ${nameSuffix}`,
    },
  };
};

const buildApiContext = async (): Promise<APIRequestContext> => {
  const storageState = await ensureStorageState("solicitor");
  const baseURL = apiConfig.baseUrl.replace(/\/+$/, "");
  const xsrf = await getStoredCookie("solicitor", "XSRF-TOKEN", baseURL);
  const authToken = await getStoredCookie("solicitor", "__auth__", baseURL);

  return request.newContext({
    baseURL,
    storageState,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      "Content-Type": "application/json",
      ...(xsrf ? { "X-XSRF-TOKEN": xsrf } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      experimental: "true",
    },
  });
};

test.describe("@api @case-create", () => {
  // eslint-disable-next-line no-empty-pattern
  test("PRL case can be created via CCD API", async ({}, testInfo) => {
    const username = resolveEnv(
      ["SOLICITOR_USERNAME", "PRL_SOLICITOR_USERNAME"],
      undefined
    );
    const password = resolveEnv(
      ["SOLICITOR_PASSWORD", "PRL_SOLICITOR_PASSWORD"],
      undefined
    );
    if (!username || !password) {
      testInfo.skip(true, "Solicitor credentials missing (SOLICITOR_* or PRL_SOLICITOR_*).");
      return;
    }

    const caseCreationConfig = resolveCaseCreationConfig();
    const apiContext = await buildApiContext();
    try {
      const created = await createCase({
        apiContext,
        caseTypeId: caseCreationConfig.caseTypeId,
        eventId: caseCreationConfig.eventId,
        data: caseCreationConfig.data,
        summary: "Create case",
        description: "Created via Playwright API test",
      });

      const caseReference = created.caseReference ?? created.caseId;
      expect(created.caseId).toMatch(/^\d+$/);
      console.info(
        `[case-create] PRL C100 case created. caseId=${created.caseId} caseReference=${caseReference}`
      );
      await testInfo.attach("created-case-id.txt", {
        body: created.caseId,
        contentType: "text/plain",
      });
      await testInfo.attach("created-case-reference.txt", {
        body: caseReference,
        contentType: "text/plain",
      });
    } finally {
      await apiContext.dispose();
    }
  });
});
