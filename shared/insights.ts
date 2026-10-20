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
