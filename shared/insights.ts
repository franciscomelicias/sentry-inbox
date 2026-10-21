import type { IssueRow } from "./model";

const HEATMAP_ROWS = 8;

/** Issue counts for the graph headline, from the rows the filters leave. */
export function headlineCounts(rows: IssueRow[], since: string) {
  const fresh = rows.filter((row) => row.bucket !== "hidden" && row.firstSeen >= since);
  return {
    newSinceDeploy: fresh.length,
    realmsWithNew: new Set(fresh.flatMap((row) => row.realms.map((realm) => realm.name))).size,
    fixFailed: rows.filter((row) => row.bucket === "fixFailed").length,
  };
}

export function heatmapRows(rows: IssueRow[]): IssueRow[] {
  return rows
    .filter((row) => row.bucket !== "hidden")
    .sort((a, b) => sum(b.daily) - sum(a.daily))
    .slice(0, HEATMAP_ROWS);
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export type IssueGroup = { key: string; rows: IssueRow[]; count: number; realmCount: number; daily: number[] };

/** Sentry splits one error into many issues (one per endpoint or stack); same side + title = one line here. */
export function groupRows(rows: IssueRow[]): IssueGroup[] {
  const groups = new Map<string, IssueRow[]>();
  for (const row of rows) {
    const key = `${row.side}\u0000${row.title}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].map(([key, members]) => ({
    key,
    rows: members,
    count: sum(members.map((member) => member.count)),
    realmCount: new Set(members.flatMap((member) => member.realms.map((realm) => realm.name))).size,
    daily: members[0].daily.map((_, day) => sum(members.map((member) => member.daily[day] ?? 0))),
  }));
}
