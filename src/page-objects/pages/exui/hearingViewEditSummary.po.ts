import { expect, Locator, Page } from '@playwright/test';

export class HearingViewEditSummaryPage {
  constructor(private readonly page: Page) {}

  get container(): Locator {
    return this.page.locator('exui-hearing-view-edit-summary, exui-hearing-edit-summary').first();
  }

  get heading(): Locator {
    return this.container.locator('h1').first();
  }

  get submitUpdatedRequestButton(): Locator {
    return this.page.getByRole('button', { name: /submit updated request/i });
  }

  get submitChangeRequestButton(): Locator {
    return this.page.getByRole('button', { name: /submit change request/i });
  }

  get changeReasonHeading(): Locator {
    return this.page.getByRole('heading', { name: /provide a reason for changing this hearing/i });
  }

  get changeReasonCheckboxes(): Locator {
    return this.page.locator('#hearing-option-container .govuk-checkboxes__input');
  }

  get errorSummaryHeading(): Locator {
    return this.page.getByText('There is a problem', { exact: true }).first();
  }

  get noChangeWarning(): Locator {
    return this.page.getByText('The request has not been updated as there is no change in hearing requirements', {
      exact: true,
    });
  }

  get systemErrorMessage(): Locator {
    return this.page.getByText('There was a system error and your request could not be processed. Please try again.', {
      exact: true,
    });
  }

  sectionHeading(name: string): Locator {
    return this.container.locator('h2.govuk-heading-m').filter({ hasText: name }).first();
  }

  summaryRow(label: string): Locator {
    return this.container
      .locator('.govuk-summary-list__row')
      .filter({
        has: this.page.getByText(label, { exact: true }),
      })
      .first();
  }

  rowChangeButton(label: string): Locator {
    return this.summaryRow(label).getByRole('button', { name: /change/i });
  }

  rowValue(label: string): Locator {
    return this.summaryRow(label).locator('.govuk-summary-list__value').first();
  }

  rowTag(label: string, tag: string): Locator {
    return this.rowValue(label).getByText(tag, { exact: true });
  }

  sectionTag(name: string, tag: string): Locator {
    return this.sectionHeading(name).getByText(tag, { exact: true });
  }

  async waitForReady(): Promise<void> {
    await expect(this.container).toBeVisible();
    await expect(this.heading).toHaveText(/view( or edit)? hearing|edit hearing/i);
  }

  async waitForChangeReasonReady(): Promise<void> {
    await expect(this.changeReasonHeading).toBeVisible();
    await expect(this.changeReasonCheckboxes.first()).toBeVisible();
  }
}
