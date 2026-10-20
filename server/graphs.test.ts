import { describe, expect, it } from "vitest";
import type { IssueRow } from "../shared/model";
import { buildGraphs, type GraphsInput } from "./graphs";

const NOW = "2026-10-20T12:00:00.000Z";
const HOUR = 3600 * 1000;
const hoursAgo = (hours: number) => new Date(Date.parse(NOW) - hours * HOUR).toISOString();

function row(id: string, overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    id,
    shortId: `P-${id}`,
    title: `Error ${id}`,
    type: "Error",
    culprit: "",
    project: "roger-customer-api-prod",
    side: "BE",
    area: "Time",
    permalink: "",
    firstSeen: hoursAgo(24 * 30),
    lastSeen: NOW,
    firstRelease: null,
    lastRelease: null,
    isCurrentRelease: true,
    count: 1,
    userCount: 0,
    daily: Array(14).fill(1),
    bucket: "ongoing",
    spikingKnown: false,
    realms: [],
    links: [],
    ...overrides,
  };
}

// 7 days of hourly totals ending at NOW: 10 per hour, then 40 per hour for the last 3 hours.
const hourly = Array.from({ length: 168 }, (_, index) => ({ at: hoursAgo(167 - index), count: index >= 165 ? 40 : 10 }));

function run(overrides: Partial<GraphsInput>) {
  return buildGraphs({ rows: [row("1")], hourly, hourly24: new Map(), releases: [], deployAt: hoursAgo(3), now: NOW, ...overrides });
}

describe("buildGraphs", () => {
  it("compares events per hour since the deploy with the 24h before", () => {
    const { headline } = run({ deployAt: hoursAgo(2.5) });
    expect(headline.eventsPerHourBefore).toBe(10);
    expect(headline.eventsPerHourNow).toBe(40);
  });

  it("counts new issues and their realms since the deploy", () => {
    const rows = [
      row("1", { firstSeen: hoursAgo(1), realms: [{ name: "acme", events: 1, users: 0 }] }),
      row("2", { firstSeen: hoursAgo(2), realms: [{ name: "acme", events: 1, users: 0 }, { name: "hug", events: 1, users: 0 }] }),
      row("3"),
      row("4", { firstSeen: hoursAgo(1), bucket: "fixFailed" }),
    ];
    expect(run({ rows }).headline).toMatchObject({ newSinceDeploy: 3, realmsWithNew: 2, fixFailed: 1 });
  });

  it("uses hours per area for a recent deploy", () => {
    const hourly24 = new Map([["1", [...Array(21).fill(1), 5, 5, 5]]]);
    expect(run({ hourly24 }).perArea).toEqual([{ area: "Time", before: 1, after: 5, unit: "hour" }]);
  });

  it("uses days per area once the deploy is older than a day: the day before vs the days after the deploy day", () => {
    const daily = [...Array(9).fill(1), 2, 3, 7, 7, 7];
    expect(run({ rows: [row("1", { daily })], deployAt: hoursAgo(72) }).perArea).toEqual([
      { area: "Time", before: 2, after: 7, unit: "day" },
    ]);
  });

  it("keeps the 8 busiest visible issues in the heatmap, busiest first", () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(String(index), { daily: Array(14).fill(index) }));
    rows.push(row("hidden", { daily: Array(14).fill(100), bucket: "hidden" }));
    const { heatmap, dayLabels } = run({ rows });
    expect(heatmap.map((entry) => entry.issueId)).toEqual(["9", "8", "7", "6", "5", "4", "3", "2"]);
    expect(dayLabels).toHaveLength(14);
    expect(dayLabels.at(-1)).toBe("2026-10-20");
  });

  it("works without a deploy, counting issues first seen in the last 24h", () => {
    const rows = [row("1", { firstSeen: hoursAgo(5) }), row("2")];
    expect(run({ rows, deployAt: null }).headline.newSinceDeploy).toBe(1);
  });
});
