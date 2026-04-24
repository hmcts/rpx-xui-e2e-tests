import { expect, type Locator } from "@playwright/test";

type LocatorState = {
  locator: Locator;
  mode: "visible" | "hidden" | "absent";
};

type HearingSummaryPageLike = {
  sectionHeading: (title: string) => Locator;
};

type HearingsTabPageLike = {
  viewOrEditButton: (hearingId: string) => Locator;
  viewDetailsButton: (hearingId: string) => Locator;
  cancelButton: (hearingId: string) => Locator;
};

async function assertLocatorStates(expectations: LocatorState[]): Promise<void> {
  for (const expectation of expectations) {
    if (expectation.mode === "visible") {
      await expect(expectation.locator).toBeVisible();
      continue;
    }

    if (expectation.mode === "hidden") {
      await expect(expectation.locator).toBeHidden();
      continue;
    }

    await expect(expectation.locator).toHaveCount(0);
  }
}

export async function assertReadOnlySummarySections(
  hearingViewSummaryPage: HearingSummaryPageLike,
  expectListedSections: boolean
): Promise<void> {
  await assertLocatorStates([
    {
      locator: hearingViewSummaryPage.sectionHeading("Listing information summary"),
      mode: expectListedSections ? "visible" : "hidden"
    },
    {
      locator: hearingViewSummaryPage.sectionHeading("Language requirements"),
      mode: expectListedSections ? "visible" : "hidden"
    },
    {
      locator: hearingViewSummaryPage.sectionHeading("Additional facilities"),
      mode: "hidden"
    },
    {
      locator: hearingViewSummaryPage.sectionHeading("Hearing stage"),
      mode: "hidden"
    }
  ]);
}

export async function assertListedActionMatrix(
  hearingsTabPage: HearingsTabPageLike,
  hearingId: string,
  options: {
    expectViewOrEdit: boolean;
    expectViewDetails: boolean;
    expectCancel: boolean;
  }
): Promise<void> {
  await assertLocatorStates([
    {
      locator: hearingsTabPage.viewOrEditButton(hearingId),
      mode: options.expectViewOrEdit ? "visible" : "absent"
    },
    {
      locator: hearingsTabPage.viewDetailsButton(hearingId),
      mode: options.expectViewDetails ? "visible" : "absent"
    },
    {
      locator: hearingsTabPage.cancelButton(hearingId),
      mode: options.expectCancel ? "visible" : "absent"
    }
  ]);
}
