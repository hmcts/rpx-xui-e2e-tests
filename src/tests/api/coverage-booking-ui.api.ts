import { expect, test } from "../../fixtures/api";
import {
  buildExistingBookingsMock,
  getExpectedTodayOnlyCreateBookingRange,
  getUtcDayRangeForLocalDate,
  normalizeCreateBookingDates
} from "../integration/mocks/bookingUI.mock.js";

test.describe("coverage-booking-ui", () => {
  test("buildExistingBookingsMock returns deterministic booking records", async () => {
    const bookings = buildExistingBookingsMock(
      "booking-user-1",
      new Date("2026-04-23T12:00:00.000Z")
    );

    expect(bookings).toHaveLength(2);
    expect(bookings[0]).toMatchObject({
      id: "future-booking-bookinguser1",
      userId: "booking-user-1",
      locationId: "20262",
      locationName: "Central London County Court"
    });
    expect(bookings[1]).toMatchObject({
      id: "active-booking-bookinguser1",
      userId: "booking-user-1",
      locationId: "784131",
      locationName: "Bromley Magistrates' Court"
    });
  });

  test("getUtcDayRangeForLocalDate returns whole-day UTC bounds", async () => {
    const range = getUtcDayRangeForLocalDate(
      new Date("2026-04-23T10:15:00.000Z"),
      new Date("2026-04-25T17:45:00.000Z")
    );

    expect(range).toEqual({
      beginDate: "2026-04-23T00:00:00.000Z",
      endDate: "2026-04-25T23:59:59.999Z"
    });
  });

  test("normalizeCreateBookingDates normalizes to full-day UTC boundaries", async () => {
    const range = normalizeCreateBookingDates(
      new Date("2026-04-23T10:30:00.000Z"),
      new Date("2026-04-23T18:15:00.000Z")
    );

    expect(range.beginDate).toMatch(/^2026-04-23T00:00:00\.000Z$/);
    expect(range.endDate).toMatch(/^2026-04-23T23:59:59\.999Z$/);
  });

  test("getExpectedTodayOnlyCreateBookingRange returns the matching day end", async () => {
    const range = getExpectedTodayOnlyCreateBookingRange(
      new Date("2026-04-23T08:30:00.000Z")
    );

    expect(range.beginDate).toMatch(/^2026-04-23T/);
    expect(range.endDate).toBe("2026-04-23T23:59:59.999Z");
  });
});
