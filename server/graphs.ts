import type { Graphs, IssueRow } from "../shared/model";
import type { Release } from "./sentry";

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const HEATMAP_ROWS = 8;

export type GraphsInput = {
  rows: IssueRow[];
  hourly: { at: string; count: number }[];
  hourly24: Map<string, number[]>;
  releases: Release[];
  deployAt: string | null;
  now: string;
};

export function buildGraphs(input: GraphsInput): Graphs {
  const now = Date.parse(input.now);
  const deploy = input.deployAt ? Date.parse(input.deployAt) : now - DAY_MS;
  const visible = input.rows.filter((row) => row.bucket !== "hidden");
  const fresh = visible.filter((row) => Date.parse(row.firstSeen) >= deploy);
  // The hour the deploy falls in mixes both sides, so it counts for neither.
  const hourlyAfter = input.hourly.filter((bucket) => Date.parse(bucket.at) >= deploy);
  const hourlyBefore = input.hourly.filter((bucket) => {
    const at = Date.parse(bucket.at);
    return at + HOUR_MS <= deploy && at >= deploy - DAY_MS;
  });
  return {
    headline: {
      newSinceDeploy: fresh.length,
      eventsPerHourNow: round(mean(hourlyAfter.map((bucket) => bucket.count))),
      eventsPerHourBefore: round(mean(hourlyBefore.map((bucket) => bucket.count))),
      realmsWithNew: new Set(fresh.flatMap((row) => row.realms.map((realm) => realm.name))).size,
      fixFailed: input.rows.filter((row) => row.bucket === "fixFailed").length,
    },
    hourly: input.hourly,
    releases: input.releases,
    perArea: perArea(visible, input.hourly24, input.deployAt ? deploy : null, now),
    heatmap: [...visible]
      .sort((a, b) => sum(b.daily) - sum(a.daily))
      .slice(0, HEATMAP_ROWS)
      .map((row) => ({ issueId: row.id, title: row.title, days: row.daily })),
    dayLabels: Array.from({ length: 14 }, (_, index) => new Date(now - (13 - index) * DAY_MS).toISOString().slice(0, 10)),
  };
}

function perArea(rows: IssueRow[], hourly24: Map<string, number[]>, deploy: number | null, now: number): Graphs["perArea"] {
  const areas = [...new Set(rows.map((row) => row.area))].sort();
  if (deploy !== null && now - deploy < DAY_MS) {
    // hourly24 holds 24 buckets ending now: the deploy hour splits them into before and after, as per-hour means.
    const split = 24 - Math.ceil((now - deploy) / HOUR_MS);
    return areas.map((area) => {
      const series = rows.filter((row) => row.area === area).map((row) => hourly24.get(row.id) ?? []);
      return {
        area,
        before: round(sum(series.map((hours) => sum(hours.slice(0, split)))) / Math.max(split, 1)),
        after: round(sum(series.map((hours) => sum(hours.slice(split)))) / Math.max(24 - split, 1)),
        unit: "hour",
      };
    });
  }
  // Older deploy (or none): the day before the deploy day vs the mean of the days after it; the deploy day itself is partial.
  const deployDay = deploy === null ? 12 : 13 - Math.floor((startOfDay(now) - startOfDay(deploy)) / DAY_MS);
  return areas.map((area) => {
    const dailies = rows.filter((row) => row.area === area).map((row) => row.daily);
    const after = Array.from({ length: Math.max(13 - deployDay, 1) }, (_, offset) => deployDay + 1 + offset).filter((day) => day <= 13);
    return {
      area,
      before: sum(dailies.map((daily) => daily[deployDay - 1] ?? 0)),
      after: round(mean(after.map((day) => sum(dailies.map((daily) => daily[day] ?? 0))))),
      unit: "day",
    };
  });
}

const startOfDay = (time: number) => Math.floor(time / DAY_MS) * DAY_MS;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const mean = (values: number[]) => (values.length ? sum(values) / values.length : 0);
const round = (value: number) => Math.round(value * 10) / 10;
