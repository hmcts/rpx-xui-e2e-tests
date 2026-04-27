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
    await expect(this.header).toBeVisible();
    await expect(this.appHeaderLink).toBeVisible();
    await expect(this.languageToggle).toBeVisible();
    await expect(this.signOutLink).toBeVisible();
  }

  public async switchLanguage(language: string): Promise<void> {
    await expect(this.languageToggle).toBeVisible();
    const normalized = language.trim().toLowerCase();
    const expectedLanguageCode = normalized === "english" ? "en" : "cy";
    const alreadyRendered = await this.page
      .evaluate((expectedCode) => {
        const rawClientContext = window.sessionStorage.getItem("clientContext");
        if (!rawClientContext) {
          return false;
        }

        try {
          const clientContext = JSON.parse(rawClientContext);
          return clientContext?.client_context?.user_language?.language === expectedCode;
        } catch {
          return false;
        }
      }, expectedLanguageCode)
      .catch(() => false);
    if (alreadyRendered) {
      return;
    }

    await this.languageToggle.click({ noWaitAfter: true });
    await this.page.waitForLoadState("domcontentloaded");
  }

  public async waitForRenderedLanguageState(language: string): Promise<void> {
    const normalized = language.trim().toLowerCase();
    const expectedLanguageCode = normalized === "english" ? "en" : "cy";
    const expectedAppHeaderLink =
      expectedLanguageCode === "en" ? /Manage Cases/i.source : /Rheoli achosion/i.source;
    const expectedSignOutLink =
      expectedLanguageCode === "en" ? /Sign out/i.source : /Allgofnodi/i.source;
    const expectedPageSignal =
      expectedLanguageCode === "en" ? /Case list|Manage Cases/i.source : /Rhestr achosion|Rheoli achosion/i.source;

    await this.page.waitForFunction(
      ({ appHeaderPattern, expectedCode, expectedPageSignalPattern, expectedSignOutPattern }) => {
        const appHeaderLink = document.querySelector("exui-header .hmcts-header a.hmcts-header__link");
        const signOutLink = document.querySelector(
          "exui-header .hmcts-header .hmcts-header__navigation-link"
        );
        const appHeaderText = appHeaderLink?.textContent?.trim() ?? "";
        const bodyText = document.body.textContent?.trim() ?? "";
        const signOutText = signOutLink?.textContent?.trim() ?? "";
        const rawClientContext = window.sessionStorage.getItem("clientContext");
        if (!rawClientContext) {
          return false;
        }

        try {
          const clientContext = JSON.parse(rawClientContext);
          const currentLanguage = clientContext?.client_context?.user_language?.language;
          const pageHasExpectedLanguage =
            new RegExp(appHeaderPattern, "i").test(appHeaderText) ||
            new RegExp(expectedPageSignalPattern, "i").test(bodyText);
          return (
            currentLanguage === expectedCode &&
            pageHasExpectedLanguage &&
            new RegExp(expectedSignOutPattern, "i").test(signOutText)
          );
        } catch {
          return false;
        }
      },
      {
        appHeaderPattern: expectedAppHeaderLink,
        expectedCode: expectedLanguageCode,
        expectedPageSignalPattern: expectedPageSignal,
        expectedSignOutPattern: expectedSignOutLink
      },
      { timeout: ExuiHeaderComponent.LANGUAGE_STATE_TIMEOUT_MS }
    );
  }
}
