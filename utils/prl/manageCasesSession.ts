import { expect, type Locator, type Page } from "@playwright/test";

import { prlConfig } from "../../config";
import { createDummySolicitorCase } from "./caseCreation";

export class PrlManageCasesSession {
  constructor(private readonly page: Page) {}

  async loginAsSolicitor(): Promise<void> {
    const { username, password } = prlConfig.solicitor;
    if (!username || !password) {
      throw new Error("PRL solicitor credentials are not configured");
    }
    await this.page.goto(`${prlConfig.manageCasesBaseUrl}/login`);
    await expect(this.page.getByLabel("Email address")).toBeVisible();
    await this.page.getByLabel("Email address").fill(username);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: /sign in/i }).click();
  }

  async openCaseDetails(caseId: string): Promise<void> {
    await this.page.goto(`${prlConfig.manageCasesBaseUrl}/cases/case-details/${caseId}`);
    await this.page.waitForLoadState("domcontentloaded");
    const header = this.page.locator("ccd-case-header, exui-case-navigation");
    await expect(header.first()).toBeVisible({ timeout: 30_000 });
  }

  async openFirstCase(): Promise<void> {
    await this.page.goto(`${prlConfig.manageCasesBaseUrl}/cases/case-list`);
    await expect(this.page.getByRole("heading", { name: /case list/i })).toBeVisible();
    const firstLink = this.page.locator('a[aria-label^="go to case with Case reference:"]').first();
    await expect(firstLink).toBeVisible();
    const href = await firstLink.getAttribute("href");
    const ariaLabel = await firstLink.getAttribute("aria-label");
    const match =
      href?.match(/(\d{4}-\d{4}-\d{4}-\d{4})/i) || ariaLabel?.match(/(\d{4}-\d{4}-\d{4}-\d{4})/i);
    if (!match) {
      throw new Error("Unable to determine case reference from case list");
    }
    await this.openCaseDetails(match[1].replace(/-/g, ""));
  }

  async findCaseWithEvent(eventName: string, maxCandidates = 10): Promise<string> {
    const listUrl = `${prlConfig.manageCasesBaseUrl}/cases/case-list`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.page.goto(listUrl);
      await this.page.waitForLoadState("domcontentloaded");
      await this.configureCaseListFilters();
      await expect(this.page.getByRole("heading", { name: /case list/i })).toBeVisible();
      const caseLinks = this.page.locator('a[aria-label^="go to case with Case reference:"]');
      const total = await caseLinks.count();
      if (total === 0) {
        if (attempt === 2) {
          break;
        }
        await this.seedCaseList();
        continue;
      }
      const limit = Math.min(total, maxCandidates);
      const references: string[] = [];
      for (let i = 0; i < limit; i += 1) {
        const ref = await this.extractCaseReference(caseLinks.nth(i));
        if (ref) {
          references.push(ref);
        }
      }
      for (const reference of references) {
        await this.openCaseDetails(reference);
        if (await this.caseSupportsEvent(eventName)) {
          return reference;
        }
      }
      if (attempt === 2) {
        break;
      }
      await this.seedCaseList();
    }
    throw new Error(`Unable to find a case with Next step option matching "${eventName}"`);
  }

  private async configureCaseListFilters(): Promise<void> {
    const resetFilterButton = this.page.getByTitle("Reset filter").first();
    if (await resetFilterButton.count()) {
      await resetFilterButton.click();
      await this.waitForCaseListSpinner();
    }

    const allCasesRadio = this.page.getByRole("radio", { name: /all cases/i }).first();
    if (await allCasesRadio.count()) {
      await allCasesRadio.check({ force: true });
    } else {
      const allCasesSelect = this.page
        .locator("select")
        .filter({
          has: this.page.locator("option", { hasText: /all cases/i }),
        })
        .first();
      if (await allCasesSelect.count()) {
        await allCasesSelect.evaluate((select) => {
          const el = select as HTMLSelectElement;
          const match = Array.from(el.options).find((o) =>
            /All cases/i.test(o.label || o.textContent || ""),
          );
          if (match) {
            el.value = match.value;
          }
        });
        await allCasesSelect.dispatchEvent("change");
      }
    }

    for (const label of ["Day", "Month", "Year"]) {
      const inputs = this.page.getByLabel(label, { exact: true });
      const count = await inputs.count();
      for (let i = 0; i < count; i += 1) {
        await inputs.nth(i).fill("");
      }
    }

    const applyButton = this.page.getByRole("button", { name: /apply/i });
    if (await applyButton.count()) {
      await applyButton.first().click();
      await this.waitForCaseListSpinner();
    }
  }

  private async waitForCaseListSpinner(): Promise<void> {
    const spinner = this.page.locator("xuilib-loading-spinner");
    await expect
      .poll(
        async () => {
          const visible = await spinner.isVisible();
          return visible;
        },
        { timeout: 30_000 },
      )
      .toBeFalsy();
  }

  private async seedCaseList(count = 3): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      await createDummySolicitorCase(this.page, "C100");
    }
  }

  private async extractCaseReference(link: Locator): Promise<string | null> {
    const href = await link.getAttribute("href");
    const ariaLabel = await link.getAttribute("aria-label");
    const match =
      href?.match(/(\d{4}-\d{4}-\d{4}-\d{4})/i) || ariaLabel?.match(/(\d{4}-\d{4}-\d{4}-\d{4})/i);
    if (!match) {
      return null;
    }
    return match[1].replace(/-/g, "");
  }

  private async caseSupportsEvent(eventName: string): Promise<boolean> {
    const select = this.page.getByRole("combobox", { name: /next step/i }).first();
    if ((await select.count()) === 0) {
      return false;
    }
    try {
      await select.waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      return false;
    }
    return await select.evaluate((element, label) => {
      const target = label.toLowerCase();
      const el = element as HTMLSelectElement;
      return Array.from(el.options ?? []).some((option) =>
        (option.textContent ?? "").toLowerCase().includes(target),
      );
    }, eventName.toLowerCase());
  }
}
