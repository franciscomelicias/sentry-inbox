import { DEFAULT_FILTERS, type Filters, type IssueRow, type Range } from "./model";

export function applyFilters(rows: IssueRow[], filters: Filters): IssueRow[] {
  const words = normalize(filters.text).split(" ").filter(Boolean);
  return rows.filter((row) => {
    const sideOk = filters.sides.length === 0 || filters.sides.includes(row.side);
    const areaOk = filters.areas.length === 0 || filters.areas.includes(row.area);
    const projectOk = filters.projects.length === 0 || filters.projects.includes(row.project);
    const environmentOk = filters.environments.length === 0 || row.environments.some((environment) => filters.environments.includes(environment));
    const releaseOk = filters.release === "any" || (filters.release === "current") === row.isCurrentRelease;
    // Rows without an origin (other projects) are untouched by the origin filter.
    const originOk = filters.origin === "any" || !row.origin || row.origin === "mixed" || row.origin === filters.origin;
    const ticketOk = ticketMatches(row, filters.ticket);
    const searchable = normalize([row.title, row.shortId, row.culprit, row.topFrame ?? "", row.area, ...(row.urls ?? [])].join(" "));
    const textOk = words.every((word) => searchable.includes(word));
    const cellOk = !filters.cell || filters.cell.issueId === row.id;
    const countsOk = row.userCount >= filters.minUsers && row.count >= filters.minEvents;
    return sideOk && areaOk && projectOk && environmentOk && releaseOk && originOk && ticketOk && textOk && cellOk && countsOk;
  });
}

/** "EmployeeCompensationService", "employee_compensation" and "/v1/employee-compensations" all read "employee compensation…". */
const normalize = (text: string) =>
  text
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");

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
