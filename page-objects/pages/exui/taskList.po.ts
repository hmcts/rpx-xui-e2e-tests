import { Page } from "@playwright/test";

import { config } from "@utils/config.utils.ts";
import { Base } from "../../base.ts";

export class TaskListPage extends Base {
  readonly taskListFilterToggle = this.page.locator(".govuk-button.hmcts-button--secondary");
  readonly selectAllServicesFilter = this.page.locator("input#checkbox_servicesservices_all");
  readonly selectAllTypesOfWorksFilter = this.page.locator(
    "input#checkbox_types-of-worktypes_of_work_all",
  );
  readonly applyFilterButton = this.page.locator("button#applyFilter");
  readonly taskListTable = this.page.locator(".cdk-table.govuk-table");
  readonly taskListResultsAmount = this.page.locator('[data-test="search-result-summary__text"]');

  constructor(page: Page) {
    super(page);
  }

  async applyAllFilterOptions() {
    await this.taskListFilterToggle.waitFor({ state: "visible" });
    await this.taskListFilterToggle.click();
    await this.selectAllServicesFilter.waitFor({ state: "visible" });
    await this.selectAllServicesFilter.check();
    await this.selectAllTypesOfWorksFilter.check();
    await this.applyFilterButton.click();
  }

  async goto() {
    // Relative URL will respect baseURL; fallback to explicit in case baseURL is blank
    const target = "/work/my-work/list";
    if (config.urls.exuiDefaultUrl) {
      await this.page.goto(`${config.urls.exuiDefaultUrl}${target}`);
    } else {
      await this.page.goto(target);
    }
  }

  async getResultsText() {
    return this.taskListResultsAmount.textContent();
  }
}
