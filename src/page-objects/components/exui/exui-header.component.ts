import { WaitUtils } from "@hmcts/playwright-common";
import { expect, type Locator, type Page } from "@playwright/test";

export class ExuiHeaderComponent {
  private static readonly LANGUAGE_STATE_TIMEOUT_MS = 20_000;

  readonly header: Locator;
  readonly errorHeader: Locator;
  readonly errorHeaderTitle: Locator;
  readonly errorHeaderListItems: Locator;
  readonly results: Locator;
  readonly headerMenuItems: Locator;
  readonly appHeaderLink: Locator;
  readonly selectedPageItem: Locator;
  readonly languageToggle: Locator;
  readonly signOutLink: Locator;
  readonly notificationBanner: Locator;
  readonly notificationBannerTitle: Locator;
  readonly notificationBannerContent: Locator;
  private waitUtils: WaitUtils;

  constructor(private page: Page) {
    this.header = page.locator("exui-header");
    this.errorHeader = page.locator(".govuk-error-summary");
    this.errorHeaderTitle = this.errorHeader.locator("h2.govuk-error-summary__title");
    this.errorHeaderListItems = this.errorHeader.locator("ul.govuk-error-summary__list li");
    this.results = page.locator("ccd-search-result");
    this.headerMenuItems = page.locator(".hmcts-primary-navigation li.hmcts-primary-navigation__item");
    this.appHeaderLink = this.header
      .locator(".hmcts-header a.hmcts-header__link")
      .first()
      .or(this.page.getByRole("banner").getByRole("link", { name: /Manage Cases|Rheoli achosion/i }).first());
    this.selectedPageItem = this.appHeaderLink;
    this.languageToggle = this.header
      .locator("button.language")
      .first()
      .or(this.page.getByRole("banner").getByRole("button", { name: /Cymraeg|English/i }).first());
    this.signOutLink = this.header
      .locator(".hmcts-header .hmcts-header__navigation-link")
      .first()
      .or(this.page.getByRole("banner").getByRole("link", { name: /Sign out|Allgofnodi/i }).first());
    this.notificationBanner = this.page.locator(".govuk-notification-banner");
    this.notificationBannerTitle = this.notificationBanner.locator(".govuk-notification-banner__title");
    this.notificationBannerContent = this.notificationBanner.locator(".govuk-notification-banner__content");
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
      { selector: "exui-header button.language", expected: language }
    );
  }

  public async waitForRenderedLanguageState(language: string): Promise<void> {
    const normalized = language.trim().toLowerCase();
    const expectedLanguageCode = normalized === "english" ? "en" : "cy";
    const expectedToggleLabel = expectedLanguageCode === "en" ? "Cymraeg" : "English";
    const expectedAppHeaderLink =
      expectedLanguageCode === "en" ? /Manage Cases/i.source : /Rheoli achosion/i.source;
    const expectedSignOutLink =
      expectedLanguageCode === "en" ? /Sign out/i.source : /Allgofnodi/i.source;

    await this.page.waitForFunction(
      ({ appHeaderPattern, expectedCode, expectedSignOutPattern, expectedToggle }) => {
        const appHeaderLink = document.querySelector("exui-header .hmcts-header a.hmcts-header__link");
        const languageToggle = document.querySelector("exui-header button.language");
        const signOutLink = document.querySelector(
          "exui-header .hmcts-header .hmcts-header__navigation-link"
        );
        const appHeaderText = appHeaderLink?.textContent?.trim() ?? "";
        const toggleText = languageToggle?.textContent?.trim() ?? "";
        const signOutText = signOutLink?.textContent?.trim() ?? "";
        const rawClientContext = window.sessionStorage.getItem("clientContext");
        if (!rawClientContext) {
          return false;
        }

        try {
          const clientContext = JSON.parse(rawClientContext);
          const currentLanguage = clientContext?.client_context?.user_language?.language;
          return (
            currentLanguage === expectedCode &&
            new RegExp(appHeaderPattern, "i").test(appHeaderText) &&
            new RegExp(expectedSignOutPattern, "i").test(signOutText) &&
            toggleText.includes(expectedToggle)
          );
        } catch {
          return false;
        }
      },
      {
        appHeaderPattern: expectedAppHeaderLink,
        expectedCode: expectedLanguageCode,
        expectedSignOutPattern: expectedSignOutLink,
        expectedToggle: expectedToggleLabel
      },
      { timeout: ExuiHeaderComponent.LANGUAGE_STATE_TIMEOUT_MS }
    );
  }
}
