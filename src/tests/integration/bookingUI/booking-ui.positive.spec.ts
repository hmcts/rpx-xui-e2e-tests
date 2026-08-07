import { expect, test } from "../../../fixtures/ui";
import {
  setupBookableBookingUiRoutesForTest,
  warmBookableBookingUiSessionForWorker,
} from "../helpers/bookingUiMockRoutes.helper.js";
import {
  singleLocationMock,
  type CreateBookingRequest,
  type CreateBookingResponse,
  getExpectedTodayOnlyCreateBookingRange,
} from "../mocks/bookingUI.mock.js";
import { formatUiDate, normalizeUiDateValue } from "../utils/tableUtils.js";

const defaultBookingLocation = singleLocationMock[0];
const bookingPageUrlPattern = /\/booking$/;
const tasksPageUrlPattern = /\/work\/my-work\/list/;
const bootstrapTimeoutMs =
  Number.parseInt(
    process.env.PW_BOOKING_UI_SESSION_BOOTSTRAP_TIMEOUT_MS ?? "",
    10,
  ) || 180_000;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(bootstrapTimeoutMs);
  await warmBookableBookingUiSessionForWorker(testInfo);
});

test.describe(
  "Booking UI with pooled session users",
  { tag: ["@integration", "@integration-booking-ui"] },
  () => {
    test("can continue when choosing an existing booking", async ({
      page,
      bookingUiPage,
    }, testInfo) => {
      const routeState = await setupBookableBookingUiRoutesForTest(
        page,
        testInfo,
      );
      await bookingUiPage.goto();
      await expect(page).toHaveURL(bookingPageUrlPattern);
      await expect.poll(routeState.getBookingsCalled).toBeTruthy();
      await bookingUiPage.chooseBookingOption("Choose an existing booking");
      await bookingUiPage.existingBookings.getByRole("button").first().click();
      await expect(page).toHaveURL(tasksPageUrlPattern);
    });

    test("can continue when creating a new booking", async ({
      page,
      bookingUiPage,
    }, testInfo) => {
      let createBookingCalled = false;
      let createBookingRequestBody: CreateBookingRequest | undefined;
      let createBookingResponseBody: CreateBookingResponse | undefined;
      const routeState = await setupBookableBookingUiRoutesForTest(
        page,
        testInfo,
        {
          onCreateBooking: async (route) => {
            createBookingCalled = true;
            const requestBody = route
              .request()
              .postDataJSON() as CreateBookingRequest;
            createBookingRequestBody = requestBody;
            createBookingResponseBody = {
              bookingResponse: {
                id: `mock-booking-${Date.now()}`,
                userId: requestBody.userId,
                regionId: requestBody.regionId,
                locationId: requestBody.locationId,
                created: new Date().toISOString(),
                beginTime: new Date(requestBody.beginDate).toISOString(),
                endTime: new Date(
                  new Date(requestBody.endDate).getTime() + 1,
                ).toISOString(),
                log: "Booking record is successfully created",
              },
            };
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(createBookingResponseBody),
            });
          },
        },
      );

      await bookingUiPage.goto();
      await expect(page).toHaveURL(bookingPageUrlPattern);
      await expect.poll(routeState.getBookingsCalled).toBeTruthy();
      await bookingUiPage.chooseBookingOption("Create a new booking");
      await bookingUiPage.continueButton.click();
      await bookingUiPage.selectFirstLocationFromSearch("Lon");
      await bookingUiPage.continueButton.click();
      await bookingUiPage.bookingDateRadio
        .filter({ hasText: "Today only (ends at midnight)" })
        .click();
      await bookingUiPage.continueButton.click();

      const table = await bookingUiPage.getSummaryListPairs();
      const today = formatUiDate(new Date().toISOString());
      expect(table[0]).toEqual({
        key: "Location",
        value: routeState.existingBookingsMock[0].locationName,
      });
      expect(table[1].key).toBe("Duration");
      expect(normalizeUiDateValue(table[1].value)).toBe(`${today} to ${today}`);
      await Promise.all([
        page.waitForURL(tasksPageUrlPattern, { timeout: 30_000 }),
        bookingUiPage.bookingButton.click(),
      ]);

      await expect.poll(() => createBookingCalled).toBeTruthy();
      expect(createBookingRequestBody).toBeDefined();
      expect(createBookingResponseBody).toBeDefined();
      const submittedRequest = createBookingRequestBody as CreateBookingRequest;
      const expectedRange = getExpectedTodayOnlyCreateBookingRange(
        new Date(submittedRequest.beginDate),
      );
      expect(submittedRequest).toEqual({
        userId: routeState.sessionUserId,
        locationId: defaultBookingLocation.epimms_id,
        regionId: defaultBookingLocation.region_id,
        beginDate: expectedRange.beginDate,
        endDate: expectedRange.endDate,
      });
      expect(createBookingResponseBody!.bookingResponse.userId).toBe(
        routeState.sessionUserId,
      );
    });

    test("can continue when viewing tasks and cases", async ({
      page,
      bookingUiPage,
    }, testInfo) => {
      const routeState = await setupBookableBookingUiRoutesForTest(
        page,
        testInfo,
      );
      await bookingUiPage.goto();
      await expect(page).toHaveURL(bookingPageUrlPattern);
      await expect.poll(routeState.getBookingsCalled).toBeTruthy();
      await bookingUiPage.chooseBookingOption("View tasks and cases");
      await bookingUiPage.continueButton.click();
      await expect(page).toHaveURL(tasksPageUrlPattern);
    });
  },
);
