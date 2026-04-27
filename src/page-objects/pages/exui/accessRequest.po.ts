import { expect, type Locator, type Page } from "@playwright/test";

import { retryOnTransientFailure } from "../../../tests/e2e/utils/transient-failure.utils.js";
import { Base } from "../../base";

export class AccessRequestPage extends Base {
  readonly requestAccessButton = this.page.getByRole("button", { name: "Request access" });
  readonly continueButton = this.page.getByRole("button", { name: "Continue", exact: true });
  readonly submitButton = this.page.getByRole("button", { name: "Submit", exact: true });
  readonly errorMessages = this.page.locator(".govuk-error-message");

  readonly challengedAccessHeading = this.page.getByRole("heading", { name: "Why do you need to access this case?" });
  readonly linkedCaseReasonRadio = this.page.getByLabel("The cases or parties are linked to the case I am working on");
  readonly consolidateReasonRadio = this.page.getByLabel("To determine if the case needs to be consolidated");
  readonly transferReasonRadio = this.page.getByLabel("To consider an order for transfer");
  readonly otherReasonRadio = this.page.getByLabel("Other reason");
  readonly challengedCaseReferenceInput = this.page.locator("#case-reference");
  readonly challengedOtherReasonInput = this.page.locator("#other-reason");
  readonly challengedAccessSuccessHeading = this.page.getByRole("heading", { name: "Access successful" });
  readonly viewCaseFileLink = this.page.getByRole("link", { name: "View case file" });

  readonly specificAccessContainer = this.page.locator("ccd-case-specific-access-request");
  readonly specificAccessReasonInput = this.page.locator("#specific-reason");
  readonly specificAccessSuccessContainer = this.page.locator("ccd-case-specific-access-success");

  readonly reviewSpecificHeading = this.page.getByRole("heading", { name: "Review specific access request" });
  readonly approveRequestRadio = this.page.getByLabel("Approve request");
  readonly requestMoreInformationRadio = this.page.getByLabel("Request more information");
  readonly reviewDurationHeading = this.page.getByRole("heading", {
    name: "How long do you want to give access to this case for?"
  });
  readonly sevenDaysRadio = this.page.getByLabel("7 days");
  readonly indefiniteRadio = this.page.getByLabel("Indefinite");
  readonly anotherPeriodRadio = this.page.getByLabel("Another period");
  readonly accessStartsLegend = this.page.locator("legend").filter({ hasText: "Access Starts" });
  readonly accessEndsText = this.page.getByText("Access Ends", { exact: true });
  readonly endDateDayInput = this.page.locator("#endDate-day");
  readonly endDateMonthInput = this.page.locator("#endDate-month");
  readonly endDateYearInput = this.page.locator("#endDate-year");
  readonly invalidEndDateMessage = this.page.getByText("Invalid End date");
  readonly requestMoreInformationHeading = this.page.getByRole("heading", { name: "Request more information" });
  readonly reviewMoreDetailInput = this.page.locator("#more-detail");
  readonly accessApprovedHeading = this.page.getByRole("heading", { name: "Access approved" });
  readonly requestDeniedHeading = this.page.getByRole("heading", { name: "Request for access denied" });

  constructor(page: Page) {
    super(page);
  }

  errorMessage(text: string): Locator {
    return this.errorMessages.filter({ hasText: text });
  }

  async chooseApproveRequest(): Promise<void> {
    await this.selectRadioOption(this.approveRequestRadio, "Approve request");
  }

  async chooseRequestMoreInformation(): Promise<void> {
    await this.selectRadioOption(this.requestMoreInformationRadio, "Request more information");
  }

  async chooseLinkedCaseChallengedAccessReason(): Promise<void> {
    await this.linkedCaseReasonRadio.check();
    await expect(this.linkedCaseReasonRadio).toBeChecked();
    await expect(this.challengedCaseReferenceInput).toBeVisible();
    await expect(this.challengedCaseReferenceInput).toBeEnabled();
  }

  async chooseOtherChallengedAccessReason(): Promise<void> {
    await this.otherReasonRadio.check();
    await expect(this.otherReasonRadio).toBeChecked();
    await expect(this.challengedOtherReasonInput).toBeVisible();
    await expect(this.challengedOtherReasonInput).toBeEnabled();
  }

  async chooseApproveRequestAndContinueToDuration(): Promise<void> {
    await this.chooseReviewActionAndContinue({
      radio: this.approveRequestRadio,
      target: this.reviewDurationHeading,
      description: "review duration",
      ready: async () => {
        await expect(this.reviewDurationHeading).toBeVisible();
        await expect(this.approveRequestRadio).toBeHidden();
        await expect(this.submitButton).toBeVisible();
        await expect(this.submitButton).toBeEnabled();
      }
    });
  }

  async chooseRequestMoreInformationAndContinue(): Promise<void> {
    await this.chooseReviewActionAndContinue({
      radio: this.requestMoreInformationRadio,
      target: this.reviewMoreDetailInput,
      description: "request more information",
      ready: async () => {
        await expect(this.requestMoreInformationHeading).toBeVisible();
        await expect(this.approveRequestRadio).toBeHidden();
        await expect(this.reviewMoreDetailInput).toBeVisible();
        await expect(this.reviewMoreDetailInput).toBeEnabled();
        await expect(this.continueButton).toBeVisible();
        await expect(this.continueButton).toBeEnabled();
      }
    });
  }

  async chooseSevenDaysDuration(): Promise<void> {
    await this.selectRadioOption(this.sevenDaysRadio, "7 days");
  }

  async chooseIndefiniteDuration(): Promise<void> {
    await this.selectRadioOption(this.indefiniteRadio, "Indefinite");
  }

  async chooseAnotherPeriodDuration(): Promise<void> {
    await this.selectRadioOption(this.anotherPeriodRadio, "Another period");
  }

  async fillReviewPeriodEndDate(day: string, month: string, year: string): Promise<void> {
    await this.endDateDayInput.fill(day);
    await this.endDateMonthInput.fill(month);
    await this.endDateYearInput.fill(year);
  }

  async waitForChallengedAccessPage(): Promise<void> {
    await this.challengedAccessHeading.waitFor({
      state: "visible",
      timeout: this.getRecommendedTimeoutMs({
        min: 20_000,
        max: 60_000,
        fallback: 45_000
      })
    });
  }

  async waitForSpecificAccessPage(): Promise<void> {
    await this.specificAccessContainer.waitFor({
      state: "visible",
      timeout: this.getRecommendedTimeoutMs({
        min: 20_000,
        max: 60_000,
        fallback: 45_000
      })
    });
  }

  async submitSpecificAccessRequest(reason: string): Promise<Record<string, unknown>> {
    const requestPredicate = (request: { method: () => string; url: () => string }) =>
      request.method() === "POST" &&
      request.url().match(/\/api\/specific-access-request(?:\?|$)/) !== null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.waitForSpecificAccessPage();
      await expect(this.specificAccessReasonInput).toBeVisible();
      await expect(this.specificAccessReasonInput).toBeEnabled();
      await this.specificAccessReasonInput.fill("");
      await this.specificAccessReasonInput.fill(reason);
      await expect(this.specificAccessReasonInput).toHaveValue(reason);

      const requestPromise = this.page.waitForRequest(requestPredicate, { timeout: 15_000 });
      await expect(this.submitButton).toBeEnabled();
      await this.submitButton.click({ noWaitAfter: true });

      const request = await requestPromise.catch(async (error: unknown) => {
        if (attempt === 3) {
          throw error;
        }
        await this.errorMessage("Enter a reason").waitFor({ state: "visible", timeout: 1_000 }).catch(() => undefined);
        return undefined;
      });

      if (request) {
        return request.postDataJSON() as Record<string, unknown>;
      }
    }

    throw new Error("Specific access request did not submit after retrying the reason field.");
  }

  async waitForReviewSpecificPage(): Promise<void> {
    // The review-specific route can occasionally land on a blank shell before the bundle rehydrates.
    const reviewSpecificUrl = this.page.url();
    const timeoutMs = this.getRecommendedTimeoutMs({
      min: 20_000,
      max: 60_000,
      fallback: 45_000
    });

    await retryOnTransientFailure(
      async () => {
        await this.reviewSpecificHeading.waitFor({
          state: "visible",
          timeout: timeoutMs
        });
      },
      {
        onRetry: async () => {
          if (!reviewSpecificUrl || reviewSpecificUrl === "about:blank") {
            return;
          }
          await this.page.goto("about:blank").catch(() => undefined);
          await this.page.goto(reviewSpecificUrl, { waitUntil: "domcontentloaded" });
        }
      }
    );
  }

  private async chooseReviewActionAndContinue(options: {
    radio: Locator;
    target: Locator;
    description: string;
    ready: () => Promise<void>;
  }): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await this.waitForReviewSpecificPage();
      const reviewSpecificUrl = this.page.url();
      let radioSelectionError: Error | null = null;
      await this.selectRadioOption(options.radio, options.description).catch(async (error: unknown) => {
        radioSelectionError = error instanceof Error ? error : new Error(String(error));
        lastError = radioSelectionError;
      });
      if (radioSelectionError) {
        await this.resetToReviewSpecificPage(reviewSpecificUrl);
        continue;
      }

      await expect(this.continueButton).toBeEnabled();
      await this.continueButton.click({ noWaitAfter: true });

      const targetVisible = await options.target
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(async () => {
          await this.approveRequestRadio.waitFor({ state: "hidden", timeout: 2_000 }).catch(() => undefined);
          return !(await this.approveRequestRadio.isVisible().catch(() => false));
        })
        .catch(() => false);
      if (targetVisible) {
        try {
          await options.ready();
          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          await this.resetToReviewSpecificPage(reviewSpecificUrl);
          continue;
        }
      }

      await this.resetToReviewSpecificPage(reviewSpecificUrl);
    }

    throw new Error(
      `Review specific access did not navigate to ${options.description} step after selecting an action.${
        lastError ? ` Last radio selection error: ${lastError.message}` : ""
      }`
    );
  }

  private async selectRadioOption(radio: Locator, description: string): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await radio.waitFor({ state: "visible", timeout: 10_000 });
        await expect(radio).toBeEnabled();
        await radio.scrollIntoViewIfNeeded().catch(() => undefined);
        await radio.check({ timeout: 5_000, force: attempt > 1 });

        if (await radio.isChecked({ timeout: 1_000 }).catch(() => false)) {
          return;
        }

        if (attempt === 3) {
          await radio.evaluate((element: HTMLInputElement) => {
            element.checked = true;
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
          });
          if (await radio.isChecked({ timeout: 1_000 }).catch(() => false)) {
            return;
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new Error(
      `Radio option "${description}" did not become checked after retrying selection.${
        lastError ? ` Last error: ${lastError.message}` : ""
      }`
    );
  }

  private async resetToReviewSpecificPage(reviewSpecificUrl: string): Promise<void> {
    if (!reviewSpecificUrl || reviewSpecificUrl === "about:blank" || this.page.isClosed()) {
      return;
    }

    await this.page.goto("about:blank").catch(() => undefined);
    await this.page.goto(reviewSpecificUrl, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  }

  async continueWithoutSelectionExpectingValidation(errorText: string): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(this.approveRequestRadio).toBeVisible();
      await expect(this.requestMoreInformationRadio).toBeVisible();
      await expect(this.continueButton).toBeEnabled();
      await this.continueButton.click();

      const errorVisible = await this.errorMessage(errorText)
        .isVisible({ timeout: 5_000 })
        .catch(() => false);
      if (errorVisible) {
        return;
      }

      await this.waitForReviewSpecificPage();
    }

    throw new Error(`Review specific access validation did not render "${errorText}" after continuing without selection.`);
  }
}
