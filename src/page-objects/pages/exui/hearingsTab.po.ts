import { expect, Locator, Page } from '@playwright/test';

type HearingAction = 'view-details' | 'view-or-edit' | 'cancel' | 'add-or-edit';

export class HearingsTabPage {
  constructor(private readonly page: Page) {}

  get container(): Locator {
    return this.page.locator('exui-case-hearings-ce');
  }

  get emptyState(): Locator {
    return this.page.getByText('No current and upcoming hearings found', { exact: false });
  }

  get reloadButton(): Locator {
    return this.page.locator('#reload-hearing-tab');
  }

  get requestHearingButton(): Locator {
    return this.page.getByRole('button', { name: /request a hearing/i });
  }

  sectionHeading(name: string): Locator {
    return this.page.locator('exui-case-hearings-list th.govuk-body-lead').filter({ hasText: name });
  }

  currentAndUpcomingHeading(name: string): Locator {
    return this.sectionHeading(name);
  }

  pastOrCancelledHeading(name = 'Past or cancelled'): Locator {
    return this.sectionHeading(name);
  }

  linkHearingButton(hearingId: string): Locator {
    return this.page.locator(`#link-hearing-link-${hearingId}`);
  }

  viewOrEditButton(hearingId: string): Locator {
    return this.page.locator(`#link-view-or-edit-${hearingId}`);
  }

  viewDetailsButton(hearingId: string): Locator {
    return this.page.locator(`#link-view-details-${hearingId}`);
  }

  cancelButton(hearingId: string): Locator {
    return this.page.locator(`#link-cancel-${hearingId}`);
  }

  addOrEditButton(hearingId: string): Locator {
    return this.page.locator(`#link-add-or-edit-${hearingId}`);
  }

  actionButton(hearingId: string, action: HearingAction): Locator {
    switch (action) {
      case 'view-or-edit':
        return this.viewOrEditButton(hearingId);
      case 'cancel':
        return this.cancelButton(hearingId);
      case 'add-or-edit':
        return this.addOrEditButton(hearingId);
      case 'view-details':
      default:
        return this.viewDetailsButton(hearingId);
    }
  }

  hearingRow(hearingId: string, action: HearingAction = 'view-details'): Locator {
    return this.page
      .locator('tr.govuk-table__row')
      .filter({ has: this.actionButton(hearingId, action) })
      .first();
  }

  async waitForReady(hearingId?: string, action: HearingAction = 'view-details'): Promise<void> {
    await expect(this.container).toBeVisible();
    await expect(this.currentAndUpcomingHeading('Current and upcoming')).toBeVisible();

    if (!hearingId) {
      return;
    }

    const actionButton = this.actionButton(hearingId, action);
    try {
      await expect(actionButton).toBeVisible({ timeout: 20_000 });
    } catch (error) {
      if (await this.emptyState.isVisible()) {
        throw new Error('Hearings tab rendered empty state instead of the expected LISTED hearing row.');
      }

      if (await this.reloadButton.isVisible()) {
        throw new Error('Hearings tab rendered the reload state instead of the expected LISTED hearing row.');
      }

      throw error;
    }
  }

  async openViewDetails(hearingId: string): Promise<void> {
    await this.openActionAndWaitForUrlChange(this.viewDetailsButton(hearingId));
  }

  async openLinkHearing(hearingId: string): Promise<void> {
    await this.openActionAndWaitForUrlChange(this.linkHearingButton(hearingId));
  }

  async openRequestHearing(): Promise<void> {
    await this.openActionAndWaitForUrlChange(this.requestHearingButton);
  }

  async openViewOrEdit(hearingId: string): Promise<void> {
    await this.openActionAndWaitForUrlChange(this.viewOrEditButton(hearingId));
  }

  private async openActionAndWaitForUrlChange(actionButton: Locator): Promise<void> {
    const startUrl = this.page.url();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await actionButton.waitFor({ state: 'visible', timeout: 20_000 });
      await actionButton.scrollIntoViewIfNeeded().catch(() => undefined);
      await actionButton.click();

      try {
        await this.page.waitForURL((url) => url.toString() !== startUrl, { timeout: 10_000 });
        return;
      } catch (error) {
        if (this.page.url() !== startUrl || attempt === 2) {
          throw error;
        }
      }
    }
  }
}
