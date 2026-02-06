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
