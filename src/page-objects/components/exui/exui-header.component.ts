import { WaitUtils } from "@hmcts/playwright-common";
import { expect, type Locator, type Page } from "@playwright/test";

export class ExuiHeaderComponent {
  readonly header: Locator;
  readonly results: Locator;
  readonly headerMenuItems: Locator;
  readonly selectedPageItem: Locator;
  readonly languageToggle: Locator;
  private waitUtils: WaitUtils;

  constructor(private page: Page) {
    this.header = page.locator("exui-header");
    this.results = page.locator("ccd-search-result");
    this.headerMenuItems = page.locator(".hmcts-primary-navigation__item");
    this.selectedPageItem = this.header
      .locator(".hmcts-header a.hmcts-header__link")
      .or(
        this.page
          .getByRole("banner")
          .getByRole("link", { name: /Manage Cases|Rhestr achosion/i }),
      );
    this.languageToggle = this.header
      .locator("button.language")
      .or(
        this.page
          .getByRole("banner")
          .getByRole("button", { name: /Cymraeg|English/i }),
      );
    this.waitUtils = new WaitUtils();
  }

  public async selectHeaderMenuItem(menuItemText: string): Promise<void> {
    const menuItem = this.headerMenuItems.filter({ hasText: menuItemText });
    await this.waitUtils.waitForLocatorVisibility(menuItem, {
      visibility: true,
    });
    await menuItem.click();
  }

  public async checkIsVisible(): Promise<void> {
    await this.waitUtils.waitForLocatorVisibility(this.results, {
      visibility: true,
    });
    await expect(this.header).toBeVisible();
  }

  public async switchLanguage(language: string): Promise<void> {
    await expect(this.languageToggle).toBeVisible();
    const toggleText = (await this.languageToggle.innerText()).trim();
    if (!toggleText.includes(language)) {
      return;
    }

    await this.languageToggle.click();
    await this.page.waitForLoadState("domcontentloaded");
    await this.page.waitForFunction(
      ({ selector, expected }) => {
        const element = document.querySelector(selector);
        const text = element?.textContent?.trim() ?? "";
        return !text.includes(expected);
      },
      { selector: "exui-header button.language", expected: language },
    );
  }
}
