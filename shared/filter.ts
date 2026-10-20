import { DEFAULT_FILTERS, type Filters, type IssueRow, type Range } from "./model";

export function applyFilters(rows: IssueRow[], filters: Filters): IssueRow[] {
  const text = filters.text.trim().toLowerCase();
  return rows.filter((row) => {
    const names = row.realms.map((realm) => realm.name);
    const sideOk = filters.sides.length === 0 || filters.sides.includes(row.side);
    const areaOk = filters.areas.length === 0 || filters.areas.includes(row.area);
    const releaseOk = filters.release === "any" || (filters.release === "current") === row.isCurrentRelease;
    const includeOk = filters.realmsInclude.length === 0 || names.some((name) => filters.realmsInclude.includes(name));
    // Same rule as a realm hide rule: an issue that also hits another realm stays.
    const excluded = names.length > 0 && names.every((name) => filters.realmsExclude.includes(name));
    const ticketOk = ticketMatches(row, filters.ticket);
    const textOk = !text || `${row.title} ${row.shortId} ${row.culprit}`.toLowerCase().includes(text);
    const cellOk = !filters.cell || filters.cell.issueId === row.id;
    const countsOk = row.userCount >= filters.minUsers && row.count >= filters.minEvents;
    return sideOk && areaOk && releaseOk && includeOk && !excluded && ticketOk && textOk && cellOk && countsOk;
  });
}

function ticketMatches(row: IssueRow, ticket: Filters["ticket"]): boolean {
  if (ticket === "hasRp") return row.rp !== undefined;
  if (ticket === "noRp") return row.rp === undefined;
  if (ticket === "rpDone") return row.rp?.done === true;
  return true;
}

export const DEFAULT_VIEWS: { name: string; filters: Filters; range?: Range }[] = [
  // No user minimum: Sentry's userCount is 0 for our issues (no user set on events).
  { name: "Morning triage", filters: DEFAULT_FILTERS },
  { name: "Since deploy", filters: { ...DEFAULT_FILTERS, release: "current" }, range: "deploy" },
];
