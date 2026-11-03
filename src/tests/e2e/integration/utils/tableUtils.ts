export function formatUiDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "long" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export function normalizeUiDateValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\b0([1-9]) ([A-Za-z]+ \d{4})\b/g, "$1 $2");
}
