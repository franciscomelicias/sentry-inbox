import { describe, expect, it } from "vitest";
import { applyFilters } from "./filter";
import { DEFAULT_FILTERS, type Filters, type IssueRow } from "./model";

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
    firstSeen: "2026-10-01T00:00:00Z",
    lastSeen: "2026-10-20T00:00:00Z",
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

const realms = (...names: string[]) => names.map((name) => ({ name, events: 1, users: 0 }));
const ids = (rows: IssueRow[], filters: Partial<Filters>) => applyFilters(rows, { ...DEFAULT_FILTERS, ...filters }).map((item) => item.id);

describe("applyFilters", () => {
  it("excludes a realm only when every realm of the issue is excluded", () => {
    const rows = [row("demo-only", { realms: realms("demo") }), row("mixed", { realms: realms("demo", "acme") }), row("none")];
    expect(ids(rows, { realmsExclude: ["demo"] })).toEqual(["mixed", "none"]);
  });

  it("includes issues hitting any included realm", () => {
    const rows = [row("1", { realms: realms("acme") }), row("2", { realms: realms("hug") })];
    expect(ids(rows, { realmsInclude: ["acme"] })).toEqual(["1"]);
  });

  it("keeps only older releases", () => {
    expect(ids([row("old", { isCurrentRelease: false }), row("current")], { release: "older" })).toEqual(["old"]);
  });

  it("drops issues with an RP when asking for no RP", () => {
    const rows = [row("1", { rp: { key: "RP-1", status: "Open", done: false } }), row("2")];
    expect(ids(rows, { ticket: "noRp" })).toEqual(["2"]);
  });

  it("applies the user minimum", () => {
    expect(ids([row("1", { userCount: 1 }), row("2", { userCount: 3 })], { minUsers: 2 })).toEqual(["2"]);
  });

  it("matches text case-insensitively in the title", () => {
    expect(ids([row("1", { title: "NPE in TimesheetSearchService" }), row("2")], { text: "timesheet" })).toEqual(["1"]);
  });

  it("keeps only the issue of a selected heatmap cell", () => {
    expect(ids([row("1"), row("2")], { cell: { issueId: "2", day: 3 } })).toEqual(["2"]);
  });

  it("filters by side and area", () => {
    const rows = [row("1", { side: "FE", area: "Shifts" }), row("2"), row("3", { side: "FE" })];
    expect(ids(rows, { sides: ["FE"], areas: ["Shifts"] })).toEqual(["1"]);
  });
});
