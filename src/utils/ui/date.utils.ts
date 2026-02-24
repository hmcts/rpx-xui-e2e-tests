/**
 * Formats an ISO date string as "D Month YYYY" (e.g. "1 February 2026").
 * Used to match the long-date format displayed in EXUI work-allocation tables.
 */
export function formatUiDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return `${date.getDate()} ${date.toLocaleString("en-GB", { month: "long" })} ${date.getFullYear()}`;
}

export function normalizeLongDate(value: string): string {
  const regex = /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/;
  const match = regex.exec(value);
  if (!match) {
    return value;
  }
  const [, day, month, year] = match;
  const paddedDay = day.padStart(2, "0");
  return `${paddedDay} ${month} ${year}`;
}

export function extractDateOnly(dateString: string): string {
  const longDateRegex = /\d{1,2}\s+[A-Za-z]{3}\s+\d{4}/;
  const numericDateRegex = /\d{1,2}\/\d{1,2}\/\d{4}/;
  const longDateMatch = longDateRegex.exec(dateString);
  const numericDateMatch = numericDateRegex.exec(dateString);
  return longDateMatch?.[0] ?? numericDateMatch?.[0] ?? dateString;
}

export function matchesToday(
  dateString: string,
  expectedLongDate: string,
  expectedNumericDate: string,
): boolean {
  const dateOnly = extractDateOnly(dateString);
  const normalized = normalizeLongDate(dateOnly);

  return (
    normalized === expectedLongDate ||
    dateOnly === expectedNumericDate ||
    dateString.includes(expectedLongDate)
  );
}

export function getTodayFormats(): {
  longFormat: string;
  numericFormat: string;
} {
  const today = new Date();
  const longFormat = today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const numericFormat = today.toLocaleDateString("en-GB");

  return { longFormat, numericFormat };
}
