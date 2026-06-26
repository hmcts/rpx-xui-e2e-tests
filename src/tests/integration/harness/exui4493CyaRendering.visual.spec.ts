import {
  assertExui4493ToolkitContract,
  buildExui4493ToolkitContractEvidence,
  type Exui4493ToolkitContractEvidence
} from "../../../data/exui-toolkit-cya-contract.js";
import { expect, test } from "../../../fixtures/ui";
import { attachUiScreenshotEvidence } from "../../../utils/ui/test-evidence.utils.js";

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCyaRows(evidence: Exui4493ToolkitContractEvidence): string {
  const visibleRows = new Map(evidence.rows.filter((row) => !row.hidden).map((row) => [row.fieldId, row]));

  return evidence.requiredVisibleFieldIds
    .map((fieldId) => {
      const row = visibleRows.get(fieldId);
      const isMissing = row === undefined;
      const value = isMissing ? "Missing from rendered CYA projection" : row.value;
      const status = isMissing ? "Missing" : "Visible";
      const rowClass = isMissing ? "app-row--missing" : "app-row--visible";

      return `
        <div class="govuk-summary-list__row ${rowClass}" data-testid="cya-row-${escapeHtml(fieldId)}">
          <dt class="govuk-summary-list__key">${escapeHtml(fieldId)}</dt>
          <dd class="govuk-summary-list__value">${escapeHtml(value)}</dd>
          <dd class="govuk-summary-list__actions">
            <strong class="app-status ${isMissing ? "app-status--missing" : "app-status--visible"}">${status}</strong>
          </dd>
        </div>`;
    })
    .join("");
}

function buildCyaEvidencePage(evidence: Exui4493ToolkitContractEvidence): string {
  const hasMissingRows = evidence.missingVisibleFieldIds.length > 0 || evidence.missingSourceMarkers.length > 0;
  const statusClass = hasMissingRows ? "app-panel--missing" : "app-panel--visible";
  const statusText = hasMissingRows
    ? "Old or broken toolkit dependency: nested CYA fields are missing"
    : "Current toolkit dependency: nested CYA fields are visible";

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>EXUI-4493 CYA rendering evidence</title>
        <style>
          body {
            margin: 0;
            background: #f3f2f1;
            color: #0b0c0c;
            font-family: Arial, Helvetica, sans-serif;
          }
          .govuk-width-container {
            max-width: 960px;
            margin: 0 auto;
            padding: 36px 24px 48px;
            background: #ffffff;
            min-height: 100vh;
          }
          .govuk-caption-l {
            color: #505a5f;
            display: block;
            font-size: 19px;
            margin-bottom: 8px;
          }
          .govuk-heading-l {
            font-size: 36px;
            line-height: 1.1;
            margin: 0 0 24px;
          }
          .govuk-body {
            font-size: 19px;
            line-height: 1.45;
            margin: 0 0 20px;
          }
          .app-panel {
            border: 4px solid;
            margin: 28px 0;
            padding: 18px 20px;
          }
          .app-panel--visible {
            border-color: #00703c;
            background: #d8f0df;
          }
          .app-panel--missing {
            border-color: #d4351c;
            background: #f6d7d2;
          }
          .app-panel h2 {
            font-size: 24px;
            margin: 0 0 8px;
          }
          .govuk-summary-list {
            border-top: 1px solid #b1b4b6;
            margin: 28px 0;
          }
          .govuk-summary-list__row {
            display: grid;
            grid-template-columns: 220px 1fr 120px;
            gap: 18px;
            border-bottom: 1px solid #b1b4b6;
            padding: 14px 0;
          }
          .govuk-summary-list__key {
            font-weight: 700;
          }
          .govuk-summary-list__value,
          .govuk-summary-list__actions {
            margin: 0;
          }
          .app-row--missing {
            background: #fff7f7;
            box-shadow: inset 6px 0 0 #d4351c;
            padding-left: 12px;
          }
          .app-row--visible {
            background: #f7fff9;
            box-shadow: inset 6px 0 0 #00703c;
            padding-left: 12px;
          }
          .app-status {
            display: inline-block;
            padding: 4px 8px;
            font-size: 16px;
          }
          .app-status--visible {
            color: #005a30;
          }
          .app-status--missing {
            color: #942514;
          }
          .app-meta {
            color: #505a5f;
            font-family: Menlo, Consolas, monospace;
            font-size: 14px;
            line-height: 1.5;
            overflow-wrap: anywhere;
          }
        </style>
      </head>
      <body>
        <main class="govuk-width-container">
          <span class="govuk-caption-l">XUI Assurance Harness visual evidence</span>
          <h1 class="govuk-heading-l">Check your answers</h1>
          <p class="govuk-body">
            This page is a browser-rendered view of the same EXUI-4493 toolkit contract used by the harness.
            PRL supplies the nested complex shape; the selected rpx-xui-webapp checkout supplies the installed toolkit dependency.
          </p>
          <section class="app-panel ${statusClass}" aria-label="Harness result">
            <h2>${escapeHtml(statusText)}</h2>
            <p class="govuk-body">
              Required rows: ${escapeHtml(evidence.requiredVisibleFieldIds.join(", "))}.
            </p>
          </section>
          <dl class="govuk-summary-list">
            ${buildCyaRows(evidence)}
          </dl>
          <section aria-label="Dependency details">
            <h2>Dependency under test</h2>
            <p class="app-meta">webapp root: ${escapeHtml(evidence.webappRoot)}</p>
            <p class="app-meta">installed toolkit: ${escapeHtml(evidence.toolkitPackageVersion)}</p>
            <p class="app-meta">toolkit bundle: ${escapeHtml(evidence.toolkitBundlePath)}</p>
          </section>
        </main>
      </body>
    </html>`;
}

test.describe("EXUI-4493 harness CYA visual evidence", { tag: ["@integration", "@integration-harness"] }, () => {
  test("EXUI-4493 CYA screen evidence renders nested complex FieldShowCondition rows", async ({ page }, testInfo) => {
    const evidence = buildExui4493ToolkitContractEvidence();

    await page.setContent(buildCyaEvidencePage(evidence), { waitUntil: "domcontentloaded" });
    await attachUiScreenshotEvidence(testInfo, page, "exui-4493-cya-rendering-evidence.png");

    await expect(page.getByRole("heading", { name: "Check your answers" })).toBeVisible();
    await expect(page.getByTestId("cya-row-emailName")).toContainText("Example organisation");
    await expect(page.getByTestId("cya-row-emailAddress")).toContainText("example.organisation@example.invalid");

    assertExui4493ToolkitContract(evidence);
  });
});
