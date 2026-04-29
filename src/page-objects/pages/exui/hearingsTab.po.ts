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
        throw new Error('Hearings tab rendered empty state instead of the expected LISTED hearing row.', { cause: error });
      }

      if (await this.reloadButton.isVisible()) {
        throw new Error('Hearings tab rendered the reload state instead of the expected LISTED hearing row.', { cause: error });
      }

      throw error;
    }
  }

  async openViewDetails(hearingId: string): Promise<void> {
    await this.openActionAndWaitForUrlChange(this.viewDetailsButton(hearingId), {
      context: 'view hearing details',
    });
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

  async openAddOrEdit(hearingId: string): Promise<void> {
    await this.openActionAndWaitForUrlChange(this.addOrEditButton(hearingId), {
      context: 'add or edit hearing actuals',
      expectedPath: new RegExp(`/hearings/actuals/${hearingId}/hearing-actual-add-edit-summary$`),
    });
  }

  private async openActionAndWaitForUrlChange(
    actionButton: Locator,
    options: { context?: string; expectedPath?: RegExp } = {}
  ): Promise<void> {
    const startUrl = this.page.url();
    const href = await actionButton.getAttribute('href').catch(() => null);
    const expectedPath = options.expectedPath ?? this.expectedPathFromHref(href);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await actionButton.waitFor({ state: 'visible', timeout: 20_000 });
      await actionButton.scrollIntoViewIfNeeded().catch(() => undefined);
      await actionButton.click({ noWaitAfter: true });

      if (await this.waitForExpectedNavigation(startUrl, expectedPath)) {
        return;
      }

      if (href && attempt === 2) {
        await this.page.goto(href, { waitUntil: 'domcontentloaded' });
        if (await this.waitForExpectedNavigation(startUrl, expectedPath)) {
          return;
        }
      }
    }

    throw new Error(`Hearing action did not navigate to ${options.context ?? 'the expected route'} from ${startUrl}.`);
  }

  private expectedPathFromHref(href: string | null): RegExp | undefined {
    if (!href) {
      return undefined;
    }

    try {
      const path = new URL(href, this.page.url()).pathname;
      return new RegExp(`${this.escapeRegExp(path)}$`);
    } catch {
      return undefined;
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async waitForExpectedNavigation(startUrl: string, expectedPath?: RegExp): Promise<boolean> {
    if (expectedPath) {
      return this.waitForExpectedUrl(expectedPath);
    }

    return this.waitForDifferentNonBlankUrl(startUrl);
  }

  private async waitForExpectedUrl(expectedPath: RegExp): Promise<boolean> {
    const deadline = Date.now() + 20_000;
    const intervals = [250, 500, 1_000];
    let intervalIndex = 0;

    while (Date.now() < deadline) {
      if (this.page.isClosed()) {
        throw new Error('Page closed while waiting for hearing action navigation.');
      }

      const currentUrl = this.page.url();
      if (currentUrl && currentUrl !== 'about:blank') {
        try {
          if (expectedPath.test(new URL(currentUrl).pathname)) {
            return true;
          }
        } catch {
          // Keep polling if Playwright briefly exposes an intermediate URL.
        }
      }

      await new Promise((resolve) =>
        setTimeout(resolve, intervals[Math.min(intervalIndex, intervals.length - 1)])
      );
      intervalIndex += 1;
    }

    return false;
  }

  private async waitForDifferentNonBlankUrl(startUrl: string): Promise<boolean> {
    const deadline = Date.now() + 20_000;
    const intervals = [250, 500, 1_000];
    let intervalIndex = 0;

    while (Date.now() < deadline) {
      const currentUrl = this.page.url();
      if (currentUrl && currentUrl !== 'about:blank' && currentUrl !== startUrl) {
        return true;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, intervals[Math.min(intervalIndex, intervals.length - 1)])
      );
      intervalIndex += 1;
    }

    return false;
  }
}
