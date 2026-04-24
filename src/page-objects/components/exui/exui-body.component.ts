import { type Locator, type Page } from "@playwright/test";

export class ExuiBodyComponent {
  readonly serviceDownError: Locator;
  readonly message: Locator;
  readonly warningMessage: Locator;
  readonly successMessage: Locator;
  readonly infoMessage: Locator;
  readonly mainHeading: Locator;
  readonly table: Locator;
  readonly tableHeaders: Locator;
  readonly paginationControls: Locator;
  readonly paginationNextButton: Locator;
  readonly paginationEllipsisButton: Locator;
  readonly paginationPreviousButton: Locator;
  readonly paginationCurrentPage: Locator;

  constructor(private readonly page: Page) {
    this.serviceDownError = page.locator("exui-service-down");
    this.message = page.locator(".hmcts-banner");
    this.warningMessage = page.locator(".hmcts-banner--warning");
    this.successMessage = this.message.filter({ hasText: "success" });
    this.infoMessage = this.message.filter({ hasText: "information" });
    this.mainHeading = page.locator("h1.govuk-heading-l");
    this.table = page.locator("table.govuk-table");
    this.tableHeaders = this.table.locator("thead th");
    this.paginationControls = page.locator(".ngx-pagination");
    this.paginationNextButton = this.paginationControls.locator(".pagination-next");
    this.paginationEllipsisButton = this.paginationControls.locator(".ellipsis");
    this.paginationPreviousButton = this.paginationControls.locator(".pagination-previous");
    this.paginationCurrentPage = this.paginationControls.locator(".current");
  }
}
