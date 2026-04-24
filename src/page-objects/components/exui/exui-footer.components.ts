import { type Locator, type Page } from "@playwright/test";

export class ExuiFooterComponent {
  readonly footer: Locator;
  readonly footerLinks: Locator;
  readonly copyrightLink: Locator;

  constructor(private readonly page: Page) {
    this.footer = page.locator("footer");
    this.footerLinks = this.footer.locator(".hmcts-footer__list-item a.govuk-footer__link");
    this.copyrightLink = this.footer.locator(".govuk-footer__meta-item > a.govuk-footer__link");
  }
}
