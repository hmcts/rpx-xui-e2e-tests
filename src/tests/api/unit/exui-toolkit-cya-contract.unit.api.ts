import {
  assertExui4493ToolkitContract,
  type Exui4493ToolkitContractEvidence
} from "../../../data/exui-toolkit-cya-contract.js";
import { test, expect } from "../../../fixtures/api";

function buildEvidence(
  overrides: Partial<Exui4493ToolkitContractEvidence> = {}
): Exui4493ToolkitContractEvidence {
  return {
    toolkitAvailable: true,
    webappRoot: "/workspace/rpx-xui-webapp",
    toolkitPackageVersion: "7.3.54",
    toolkitBundlePath: "/workspace/rpx-xui-webapp/node_modules/@hmcts/ccd-case-ui-toolkit/fesm2022/hmcts-ccd-case-ui-toolkit.mjs",
    requiredSourceMarkers: [
      "findAncestorOfType",
      "getCollectionItemValue",
      "resolveCollectionConditionalShowContext"
    ],
    missingSourceMarkers: [],
    rows: [
      {
        fieldId: "emailName",
        hidden: false,
        value: "Example organisation"
      },
      {
        fieldId: "emailAddress",
        hidden: false,
        value: "example.organisation@example.invalid"
      }
    ],
    requiredVisibleFieldIds: ["emailName", "emailAddress"],
    missingVisibleFieldIds: [],
    ...overrides
  };
}

test.describe("EXUI-4493 toolkit CYA contract assertion", { tag: "@svc-internal" }, () => {
  test("passes when the installed toolkit exposes the required source markers and visible CYA rows", () => {
    expect(() => assertExui4493ToolkitContract(buildEvidence())).not.toThrow();
  });

  test("passes when the installed toolkit package is unavailable in the current workspace", () => {
    expect(() =>
      assertExui4493ToolkitContract(
        buildEvidence({
          toolkitAvailable: false,
          toolkitPackageVersion: "unavailable",
          toolkitBundlePath:
            "/workspace/rpx-xui-webapp/node_modules/@hmcts/ccd-case-ui-toolkit/package.json",
          unavailableReason:
            "Cannot find installed @hmcts/ccd-case-ui-toolkit package at /workspace/rpx-xui-webapp/node_modules/@hmcts/ccd-case-ui-toolkit/package.json."
        })
      )
    ).not.toThrow();
  });

  test("fails clearly when the installed toolkit bundle does not contain the EXUI-4493 context fix markers", () => {
    expect(() =>
      assertExui4493ToolkitContract(
        buildEvidence({
          toolkitPackageVersion: "7.3.47",
          missingSourceMarkers: ["resolveCollectionConditionalShowContext"]
        })
      )
    ).toThrow(
      "Installed @hmcts/ccd-case-ui-toolkit 7.3.47 is missing EXUI-4493 CYA context markers: resolveCollectionConditionalShowContext. Webapp root: /workspace/rpx-xui-webapp"
    );
  });

  test("fails clearly when nested complex CYA rows are not rendered", () => {
    expect(() =>
      assertExui4493ToolkitContract(
        buildEvidence({
          missingVisibleFieldIds: ["emailName", "emailAddress"]
        })
      )
    ).toThrow(
      "Installed @hmcts/ccd-case-ui-toolkit 7.3.54 does not render EXUI-4493 nested CYA fields: emailName, emailAddress. Webapp root: /workspace/rpx-xui-webapp"
    );
  });
});
