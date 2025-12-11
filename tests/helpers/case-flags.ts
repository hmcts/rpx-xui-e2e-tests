import { expect, type Page } from "@playwright/test";

export async function openCaseFlagsTab(page: Page, baseUrl: string, caseId: string): Promise<void> {
  await page.goto(`${baseUrl}/case-details/${caseId}`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1_000);
  await page.getByText("Case flags", { exact: true }).click();
}

export async function startFlagWizard(
  page: Page,
  preferredLabels: string[] = [],
): Promise<string | undefined> {
  const nextStep = page.getByLabel("Next step");
  if (!(await nextStep.isVisible().catch(() => false))) {
    throw new Error("Next step dropdown not visible on Case flags page");
  }
  const options = await nextStep.locator("option").evaluateAll((elements) =>
    elements.map((opt) => ({
      label: (opt.label || opt.textContent || "").trim(),
      value: (opt as HTMLOptionElement).value,
      disabled: (opt as HTMLOptionElement).disabled,
    })),
  );
  const normalisedPrefs = preferredLabels.map((label) => label.toLowerCase());
  const choiceByPreference = options.find(
    (opt) =>
      normalisedPrefs.includes(opt.label.toLowerCase()) && opt.value && !opt.disabled,
  );
  const choice =
    choiceByPreference ??
    options.find((opt) => /create case flag/i.test(opt.label) && !opt.disabled) ??
    options.find(
      (opt) =>
        opt.value &&
        !opt.disabled &&
        !/please select/i.test(opt.label) &&
        !/select action/i.test(opt.label),
    );
  if (!choice) {
    throw new Error("No available next-step options to start flag wizard");
  }

  await nextStep.click();
  await nextStep.selectOption({ value: choice.value });
  const goButton = page.getByRole("button", { name: /^Go$/ });
  await expect(goButton).toBeVisible({ timeout: 5_000 });
  await expect(goButton).toBeEnabled({ timeout: 5_000 }).catch(() => {
    throw new Error(`Go button stayed disabled after selecting "${choice.label}"`);
  });
  await goButton.click();
  return choice.label;
}

export async function getBannerCount(page: Page): Promise<number> {
  const banner = page.getByLabel("Important");
  const text = await banner.innerText().catch(() => "");
  const match = /(\d+)/.exec(text);
  return match ? Number.parseInt(match[0], 10) : 0;
}

export async function countActiveFlagRows(page: Page): Promise<number> {
  const statusCells = page.locator("ccd-case-flag-table tbody tr td.cell-flag-status");
  const rowCount = await statusCells.count();
  let activeCount = 0;
  for (let index = 0; index < rowCount; index += 1) {
    const value = await statusCells.nth(index).innerText();
    if (value.trim().toLowerCase() === "active") {
      activeCount += 1;
    }
  }
  return activeCount;
}

const START_HEADERS = {
  Accept:
    "application/vnd.uk.gov.hmcts.ccd-data-store-api.ui-start-case-trigger.v2+json;charset=UTF-8",
  Experimental: "true",
  "Content-type": "application/json; charset=UTF-8",
};

const SUBMIT_HEADERS = {
  Accept: "application/vnd.uk.gov.hmcts.ccd-data-store-api.create-case.v2+json;charset=UTF-8",
  Experimental: "true",
  "Content-type": "application/json; charset=UTF-8",
};

/**
 * Creates a minimal case using the CCD test event used by legacy flag tests.
 * Relies on the signed-in browser session (cookies) instead of raw OAuth tokens.
 */
export async function createCaseFlagsTestCase(page: Page, baseUrl: string): Promise<string> {
  await page.goto(`${baseUrl}/cases/case-list`);

  const startUrl = `${baseUrl}/data/internal/case-types/xuiCaseFlagsV1/event-triggers/createCasetestDataSetup?ignore-warning=false`;
  const eventToken = await page.evaluate(
    async ({ url, headers }) => {
      const res = await fetch(url, { method: "GET", headers, credentials: "same-origin" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to start flag case creation: ${res.status} ${text}`);
      }
      const json = await res.json();
      return json.event_token as string;
    },
    { url: startUrl, headers: START_HEADERS },
  );

  const submitUrl = `${baseUrl}/data/case-types/xuiCaseFlagsV1/cases?ignore-warning=false`;
  const payload = {
    data: {},
    event: {
      id: "createCasetestDataSetup",
      summary: "",
      description: "",
    },
    event_token: eventToken,
    draft_id: null,
    ignore_warning: false,
  };

  const caseId = await page.evaluate(
    async ({ url, headers, body }) => {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        credentials: "same-origin",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to submit flag test case: ${res.status} ${text}`);
      }
      const json = await res.json();
      return json.id as string;
    },
    { url: submitUrl, headers: SUBMIT_HEADERS, body: JSON.stringify(payload) },
  );

  return caseId.replace(/-/g, "");
}
