import { expect, test } from "@playwright/test";

import { withEnv } from "../../utils/api/testEnv";
import { __test__ as caseSetupTest } from "../e2e/utils/test-setup/caseSetup.js";
import { buildCasePayloadFromTemplate } from "../e2e/utils/test-setup/payloads/registry.js";

test.describe("case-setup coverage", () => {
  test("resolveCaseNumberFromCreateResponse prefers explicit case reference fields", () => {
    expect(
      caseSetupTest.resolveCaseNumberFromCreateResponse({
        caseReference: "1111222233334444",
        id: "fallback"
      })
    ).toBe("1111222233334444");

    expect(
      caseSetupTest.resolveCaseNumberFromCreateResponse({
        case_reference: 2222333344445555
      })
    ).toBe("2222333344445555");

    expect(
      caseSetupTest.resolveCaseNumberFromCreateResponse({
        case_id: "3333444455556666"
      })
    ).toBe("3333444455556666");
  });

  test("resolveSetupMode and resolveUiFallbackFlag honour explicit env flags", async () => {
    await withEnv(
      {
        PW_E2E_CASE_SETUP_MODE: "api-required",
        PW_E2E_CASE_SETUP_ALLOW_UI_FALLBACK: "yes"
      },
      () => {
        expect(caseSetupTest.resolveSetupMode(undefined)).toBe("api-required");
        expect(caseSetupTest.resolveUiFallbackFlag(undefined)).toBe(true);
      }
    );

    await withEnv(
      {
        PW_E2E_CASE_SETUP_MODE: "ui-only",
        PW_E2E_CASE_SETUP_ALLOW_UI_FALLBACK: "0"
      },
      () => {
        expect(caseSetupTest.resolveSetupMode(undefined)).toBe("ui-only");
        expect(caseSetupTest.resolveUiFallbackFlag(undefined)).toBe(false);
      }
    );
  });

  test("payload registry preserves employment metadata and allows targeted overrides", () => {
    const payload = buildCasePayloadFromTemplate("employment.et-england-wales.initiate-case", {
      overrides: {
        managingOffice: "Leeds"
      }
    });

    expect(payload.meta).toMatchObject({
      template: "employment.et-england-wales.initiate-case",
      jurisdiction: "EMPLOYMENT",
      caseType: "ET_EnglandWales",
      eventId: "initiateCase"
    });
    expect(payload.fieldValues.managingOffice).toBe("Leeds");
  });

  test("payload registry preserves divorce case-flags overrides for party names", () => {
    const payload = buildCasePayloadFromTemplate("divorce.xui-test-case-type.create-case-flags", {
      overrides: {
        LegalRepParty1Flags: {
          roleOnCase: "Applicant solicitor",
          partyName: "Alice Example"
        }
      }
    });

    expect(payload.meta).toMatchObject({
      template: "divorce.xui-test-case-type.create-case-flags",
      jurisdiction: "DIVORCE",
      caseType: "xuiCaseFlagsV1",
      eventId: "createCase"
    });
    expect(payload.fieldValues).toMatchObject({
      LegalRepParty1Flags: {
        roleOnCase: "Applicant solicitor",
        partyName: "Alice Example"
      }
    });
  });
});
