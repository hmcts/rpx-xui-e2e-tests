import { WaitUtils } from "@hmcts/playwright-common";
import { expect, type Locator, type Page } from "@playwright/test";

export class ExuiHeaderComponent {
  readonly header: Locator;
  readonly results: Locator;
  readonly headerMenuItems: Locator;
  private waitUtils: WaitUtils;

  constructor(private page: Page) {
    this.header = page.locator("exui-header");
    this.results = page.locator("ccd-search-result");
    this.headerMenuItems = page.locator(".hmcts-primary-navigation__item");
    this.waitUtils = new WaitUtils();
  }

  public async selectHeaderMenuItem(menuItemText: string): Promise<void> {
    const menuItem = this.headerMenuItems.filter({ hasText: menuItemText });
    await this.waitUtils.waitForLocatorVisibility(menuItem, { visibility: true });
    await menuItem.click();
  }

  public async checkIsVisible(): Promise<void> {
    await this.waitUtils.waitForLocatorVisibility(this.results, {
      visibility: true,
    });
    await expect(this.header).toBeVisible();
  }
}
