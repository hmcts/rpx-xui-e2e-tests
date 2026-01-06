import {
  ExuiCaseDetailsComponent,
  ExuiCaseListComponent,
  ExuiSpinnerComponent,
} from "@hmcts/playwright-common";
import { Page } from "@playwright/test";

import { ensureAnalyticsAccepted } from "../utils/ui/analytics.utils.js";
import {
  installUiNetworkTracker,
  type UiIdleOptions,
  waitForUiIdle as waitForUiIdleUtil,
} from "../utils/ui/ui-idle.utils.js";

import { ExuiHeaderComponent } from "./components/index.js";

// A base page inherited by pages & components
// can contain any additional config needed + instantiated page object
export abstract class Base {
  readonly exuiCaseListComponent: ExuiCaseListComponent;
  readonly exuiCaseDetailsComponent: ExuiCaseDetailsComponent;
  readonly exuiHeader: ExuiHeaderComponent;
  readonly exuiSpinnerComponent: ExuiSpinnerComponent;

  constructor(public readonly page: Page) {
    this.exuiCaseListComponent = new ExuiCaseListComponent(page);
    this.exuiCaseDetailsComponent = new ExuiCaseDetailsComponent(page);
    this.exuiHeader = new ExuiHeaderComponent(page);
    this.exuiSpinnerComponent = new ExuiSpinnerComponent(page);
    installUiNetworkTracker(page);
  }

  async acceptAnalyticsCookies(): Promise<void> {
    await ensureAnalyticsAccepted(this.page);
  }

  async waitForUiIdleState(options?: UiIdleOptions): Promise<void> {
    await waitForUiIdleUtil(this.page, options);
    await this.exuiSpinnerComponent.wait();
  }
}
