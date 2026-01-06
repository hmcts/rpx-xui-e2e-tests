import { Page } from "@playwright/test";

import { Base } from "../../base";

export class CaseDetailsPage extends Base {
  readonly container = this.page.locator("exui-case-details-home");
  readonly createCaseSuccessMessage = this.page.locator(".alert-message");
  readonly caseDetailsTabs = this.page.locator('div[role="tab"]');

  constructor(page: Page) {
    super(page);
  }

  async waitForReady(timeoutMs = 30_000): Promise<void> {
    await this.container.waitFor({ state: "visible", timeout: timeoutMs });
    await this.waitForUiIdleState({ timeoutMs });
  }

  async openHistoryTab(): Promise<void> {
    await this.page.getByRole("tab", { name: "History" }).click();
    await this.waitForUiIdleState();
  }

  async waitForEventFormReady(selector: string, timeoutMs = 30_000): Promise<void> {
    await this.waitForUiIdleState({ timeoutMs });
    await this.page.locator(selector).waitFor({ state: "visible", timeout: timeoutMs });
  }
}
