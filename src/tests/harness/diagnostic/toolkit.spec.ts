// Extracted installed-class diagnostic, not full Angular renderer or candidate evidence.
import { test, expect } from '@playwright/test';

import { assertExui4493ToolkitContract, buildExui4493ToolkitContractEvidence } from '../../../data/exui-toolkit-cya-contract.js';

function escapeSvgText(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildExui4493ToolkitEvidenceSvg(evidence: ReturnType<typeof buildExui4493ToolkitContractEvidence>): string {
  const actualFieldIds = new Set(evidence.rows.filter((row) => !row.hidden).map((row) => row.fieldId));
  const statusLabel =
    evidence.missingSourceMarkers.length > 0 || evidence.missingVisibleFieldIds.length > 0
      ? "FAILING: installed toolkit does not satisfy EXUI-4493 CYA contract"
      : "PASSING: extracted installed class preserves nested CYA rows";
  const statusColour =
    evidence.missingSourceMarkers.length > 0 || evidence.missingVisibleFieldIds.length > 0 ? "#b10e1e" : "#00703c";
  const rowCards = evidence.requiredVisibleFieldIds
    .map((fieldId, index) => {
      const row = evidence.rows.find((candidate) => candidate.fieldId === fieldId);
      const y = 308 + index * 58;
      const isMissing = !actualFieldIds.has(fieldId);
      const fill = isMissing ? "#f6d7d2" : "#d8f0df";
      const stroke = isMissing ? "#b10e1e" : "#00703c";
      const value = row ? escapeSvgText(row.value) : "MISSING";
      return `
        <rect x="704" y="${y - 32}" width="432" height="44" rx="4" fill="${fill}" stroke="${stroke}" />
        <text x="728" y="${y - 6}" class="body ${isMissing ? "missing" : "ok"}">${escapeSvgText(fieldId)}: ${value}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="520" viewBox="0 0 1160 520" role="img" aria-label="EXUI-4493 installed toolkit evidence">
    <style>
      .title { font: 700 26px Arial, sans-serif; fill: #0b0c0c; }
      .subtitle { font: 400 15px Arial, sans-serif; fill: #505a5f; }
      .heading { font: 700 18px Arial, sans-serif; fill: #0b0c0c; }
      .body { font: 400 15px Arial, sans-serif; fill: #0b0c0c; }
      .mono { font: 400 13px "Menlo", "Consolas", monospace; fill: #0b0c0c; }
      .status { font: 700 16px Arial, sans-serif; fill: ${statusColour}; }
      .missing { fill: #942514; font-weight: 700; }
      .ok { fill: #005a30; font-weight: 700; }
    </style>
    <rect width="1160" height="520" fill="#ffffff" />
    <text x="32" y="44" class="title">EXUI-4493 extracted installed-class contract</text>
    <text x="32" y="72" class="subtitle">ReadFieldsFilterPipe extracted from the declared installed package; not a full Angular renderer</text>
    <text x="32" y="104" class="status">${statusLabel}</text>

    <rect x="32" y="132" width="640" height="320" rx="6" fill="#f3f2f1" stroke="#b1b4b6" />
    <text x="56" y="168" class="heading">Dependency under test</text>
    <text x="56" y="206" class="body">Webapp root</text>
    <text x="56" y="230" class="mono">${escapeSvgText(evidence.webappRoot)}</text>
    <text x="56" y="264" class="body">Installed toolkit version</text>
    <text x="56" y="288" class="mono">${escapeSvgText(evidence.toolkitPackageVersion)}</text>
    <text x="56" y="322" class="body">Toolkit bundle</text>
    <text x="56" y="346" class="mono">${escapeSvgText(evidence.toolkitBundlePath)}</text>
    <text x="56" y="388" class="body">Required fix markers</text>
    <text x="56" y="412" class="mono">${escapeSvgText(evidence.requiredSourceMarkers.join(", "))}</text>

    <rect x="704" y="132" width="432" height="320" rx="6" fill="#fff7bf" stroke="#b1b4b6" />
    <text x="728" y="168" class="heading">Filtered CYA rows</text>
    <text x="728" y="204" class="subtitle">Both rows must be visible for the email branch.</text>
    ${rowCards}

    <text x="32" y="492" class="subtitle">Supporting extracted-class evidence only; no candidate runtime or release credit.</text>
  </svg>`;
}

test("EXUI-4493 extracted installed toolkit class preserves nested complex FieldShowCondition values", async ({}, testInfo) => {
    const evidence = buildExui4493ToolkitContractEvidence();
    expect(evidence.toolkitAvailable).toBe(true);

    await testInfo.attach("exui-4493-installed-toolkit-contract.json", {
      body: JSON.stringify(evidence, null, 2),
      contentType: "application/json"
    });
    await testInfo.attach("exui-4493-installed-toolkit-contract.svg", {
      body: buildExui4493ToolkitEvidenceSvg(evidence),
      contentType: "image/svg+xml"
    });

    assertExui4493ToolkitContract(evidence);
  });
