import { expect, type Locator, type Page } from "@playwright/test";

export class PrlCaseTabsPage {
  private readonly navigation: Locator;
  private readonly tabItems: Locator;
  private readonly angularTabHeader: Locator;

  constructor(private readonly page: Page) {
    this.navigation = page.locator("exui-case-navigation").first();
    this.tabItems = this.navigation.locator("li:visible");
    this.angularTabHeader = page.locator("mat-tab-header").first();
  }

  async expectNavigationVisible(): Promise<void> {
    if (await this.navigation.count()) {
      await expect(this.navigation).toBeVisible();
    } else {
      await expect(this.angularTabHeader).toBeVisible();
    }
  }

  async expectTabCount(minTabs = 3): Promise<void> {
    const count = await this.tabItems.count();
    if (count === 0) {
      const matTabs = this.angularTabHeader.locator("[role='tab'], .mat-tab-label");
      const matCount = await matTabs.count();
      expect(matCount).toBeGreaterThanOrEqual(minTabs);
      return;
    }
    expect(count).toBeGreaterThanOrEqual(minTabs);
  }

  async expectTabsInclude(expected: string[]): Promise<void> {
    const locators = await this.resolveTabLocators();
    const texts = await Promise.all(
      locators.map(async (locator) => (await locator.innerText()).trim()),
    );
    expect(texts.length).toBeGreaterThan(0);
    for (const name of expected) {
      expect(texts).toEqual(
        expect.arrayContaining([expect.stringMatching(new RegExp(`^${name}`, "i"))]),
      );
    }
  }

  private async resolveTabLocators(): Promise<Locator[]> {
    const count = await this.tabItems.count();
    if (count > 0) {
      return Array.from({ length: count }, (_, idx) => this.tabItems.nth(idx));
    }
    const matTabs = this.angularTabHeader.locator("[role='tab'], .mat-tab-label");
    await expect(matTabs.first()).toBeVisible({ timeout: 10_000 });
    const matCount = await matTabs.count();
    return Array.from({ length: matCount }, (_, idx) => matTabs.nth(idx));
  }
}
