import { expect, Locator, Page } from '@playwright/test';

export class HearingViewSummaryPage {
  constructor(private readonly page: Page) {}

  get container(): Locator {
    return this.page.locator('exui-hearing-viewsummary');
  }

  get heading(): Locator {
    return this.page.locator('exui-hearing-viewsummary h1').first();
  }

  get editHearingButton(): Locator {
    return this.page.locator('#edit-hearing button');
  }

  summaryRows(label: string): Locator {
    return this.page.locator('.govuk-summary-list__row').filter({
      has: this.page.getByText(label, { exact: true }),
    });
  }

  summaryRow(label: string): Locator {
    return this.summaryRows(label).first();
  }

  sectionHeading(name: string): Locator {
    return this.page.getByText(name, { exact: true }).first();
  }

  async waitForReady(): Promise<void> {
    await expect(this.container).toBeVisible();
    await expect(this.heading).toHaveText(/hearing details|view hearing/i);
  }
}
