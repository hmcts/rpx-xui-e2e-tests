export function isEmptyTableRow(row: Record<string, string>): boolean {
  const text = Object.values(row).join(" ").replaceAll(/\s+/g, " ").trim();
  return (
    !text ||
    /no flags|no active flags|no case flags|no data|no items|no results|\bnone\b/i.test(
      text,
    )
  );
}

export function filterEmptyRows(
  table: Record<string, string>[],
): Record<string, string>[] {
  return table.filter((row) => !isEmptyTableRow(row));
}

export const isEmptyFlagsRow = isEmptyTableRow;
