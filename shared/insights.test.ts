import { describe, expect, it } from "vitest";
import type { IssueRow } from "./model";
import { headlineCounts, heatmapRows } from "./insights";

const NOW = Date.parse("2026-10-20T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3600 * 1000).toISOString();

function row(id: string, overrides: Partial<IssueRow> = {}): IssueRow {
  return {
    id, shortId: `P-${id}`, title: `Error ${id}`, type: "Error", culprit: "", project: "roger-customer-api-prod", side: "BE",
    area: "Time", permalink: "", firstSeen: hoursAgo(24 * 30), lastSeen: hoursAgo(0), firstRelease: null, lastRelease: null,
    isCurrentRelease: true, count: 1, userCount: 0, daily: Array(14).fill(1), bucket: "ongoing", spikingKnown: false, realms: [], links: [],
    ...overrides,
  };
}

describe("headlineCounts", () => {
  it("counts visible issues first seen since the deploy, their realms, and fix-didn't-work rows", () => {
    const rows = [
      row("1", { firstSeen: hoursAgo(1), realms: [{ name: "acme", events: 1, users: 0 }] }),
      row("2", { firstSeen: hoursAgo(2), realms: [{ name: "acme", events: 1, users: 0 }, { name: "hug", events: 1, users: 0 }] }),
      row("3"),
      row("4", { firstSeen: hoursAgo(1), bucket: "fixFailed" }),
      row("5", { firstSeen: hoursAgo(1), bucket: "hidden" }),
    ];
    expect(headlineCounts(rows, hoursAgo(3))).toEqual({ newSinceDeploy: 3, realmsWithNew: 2, fixFailed: 1 });
  });
});

describe("heatmapRows", () => {
  it("keeps the 8 busiest visible issues, busiest first", () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(String(index), { daily: Array(14).fill(index) }));
    rows.push(row("hidden", { daily: Array(14).fill(100), bucket: "hidden" }));
    expect(heatmapRows(rows).map((item) => item.id)).toEqual(["9", "8", "7", "6", "5", "4", "3", "2"]);
  });
});
