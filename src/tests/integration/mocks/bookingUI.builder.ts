const DAY_MS = 24 * 60 * 60 * 1000;

export interface BookingUiMock {
  id: string;
  userId: string;
  regionId: string;
  locationId: string;
  created: string;
  beginTime: string;
  endTime: string;
  locationName: string;
}

const stableBookingId = (prefix: string, userId: string) =>
  `${prefix}-${userId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "user"}`;

export function buildExistingBookingsMock(
  userId: string,
  referenceDate: Date = new Date("2026-04-23T12:00:00.000Z")
): BookingUiMock[] {
  const now = referenceDate.getTime();
  const activeBegin = new Date(now - 2 * DAY_MS).toISOString();
  const activeEnd = new Date(now + 7 * DAY_MS).toISOString();
  const futureBegin = new Date(now + 30 * DAY_MS).toISOString();
  const futureEnd = new Date(now + 60 * DAY_MS).toISOString();

  return [
    {
      id: stableBookingId("future-booking", userId),
      userId,
      regionId: "1",
      locationId: "20262",
      created: new Date(now - 5 * DAY_MS).toISOString(),
      beginTime: futureBegin,
      endTime: futureEnd,
      locationName: "Central London County Court"
    },
    {
      id: stableBookingId("active-booking", userId),
      userId,
      regionId: "1",
      locationId: "784131",
      created: new Date(now - 4 * DAY_MS).toISOString(),
      beginTime: activeBegin,
      endTime: activeEnd,
      locationName: "Bromley Magistrates' Court"
    }
  ];
}
