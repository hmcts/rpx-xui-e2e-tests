import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { AxeResults, Result } from 'axe-core';
import { createHtmlReport } from 'axe-html-reporter';

type StringList = string | string[];

type KnownAccessibilityViolation = {
  id: string;
  maxNodes: number;
};

type AccessibilityAuditOptions = {
  exclude?: StringList;
  include?: StringList;
  disableRules?: StringList;
  knownViolations?: KnownAccessibilityViolation[];
};

function toArray(value: StringList | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function applySelectors(
  builder: AxeBuilder,
  method: 'include' | 'exclude',
  selectors: StringList | undefined
): void {
  for (const selector of toArray(selectors)) {
    builder[method](selector);
  }
}

function buildAccessibilityReport(results: AxeResults): string {
  return createHtmlReport({
    results,
    options: {
      doNotCreateReportFile: true,
    },
  });
}

function findUnexpectedAccessibilityViolations(
  violations: Result[],
  knownViolations: KnownAccessibilityViolation[] = []
): string[] {
  const allowedNodeCounts = new Map(knownViolations.map((violation) => [violation.id, violation.maxNodes]));

  return violations.flatMap((violation) => {
    const allowedNodeCount = allowedNodeCounts.get(violation.id);
    if (allowedNodeCount === undefined) {
      return [`${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`];
    }
    if (violation.nodes.length > allowedNodeCount) {
      return [
        `${violation.id}: ${violation.help} has ${violation.nodes.length} node(s), expected no more than ${allowedNodeCount}`,
      ];
    }
    return [];
  });
}

function buildAxeBuilder(page: Page, options?: AccessibilityAuditOptions): AxeBuilder {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']);
  builder.options({ iframes: false });

  applySelectors(builder, 'include', options?.include);
  applySelectors(builder, 'exclude', options?.exclude);

  const disableRules = toArray(options?.disableRules);
  if (disableRules.length > 0) {
    builder.disableRules(disableRules);
  }

  return builder;
}

function isNavigationDuringAccessibilityScan(error: unknown): boolean {
  return error instanceof Error && /Execution context was destroyed|navigation/i.test(error.message);
}

async function analyseAccessibility(page: Page, options?: AccessibilityAuditOptions): Promise<AxeResults> {
  try {
    return await buildAxeBuilder(page, options).analyze();
  } catch (error) {
    if (!isNavigationDuringAccessibilityScan(error)) {
      throw error;
    }
  }

  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  return buildAxeBuilder(page, options).analyze();
}

export async function attachUiScreenshotEvidence(testInfo: TestInfo, page: Page, fileName: string): Promise<void> {
  const screenshotPath = testInfo.outputPath(fileName);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(fileName, {
    path: screenshotPath,
    contentType: 'image/png',
  });
}

export async function attachAccessibilityEvidence(
  testInfo: TestInfo,
  page: Page,
  reportName: string,
  options?: AccessibilityAuditOptions
): Promise<void> {
  const results = await analyseAccessibility(page, options);
  const unexpectedViolations = findUnexpectedAccessibilityViolations(results.violations, options?.knownViolations);
  const reportTitle =
    unexpectedViolations.length > 0 ? `FAILED ${reportName}` : `${reportName} (${results.violations.length} known violation(s))`;

  await testInfo.attach(reportTitle, {
    body: buildAccessibilityReport(results),
    contentType: 'text/html',
  });

  expect(unexpectedViolations, `Unexpected accessibility violations on ${page.url()}`).toEqual([]);
}
