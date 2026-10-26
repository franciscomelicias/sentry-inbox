import { describe, expect, it } from "vitest";
import type { EventFacts, Rule } from "../shared/model";
import { classifyIssues, compareVersions, type ClassifyInput } from "./classify";
import type { Ticket } from "./jira";
import type { SentryIssue } from "./sentry";

const NOW = "2026-10-20T12:00:00.000Z";
const DAY = 24 * 3600 * 1000;
const daysAgo = (days: number) => new Date(Date.parse(NOW) - days * DAY).toISOString();

function issue(id: string, overrides: Partial<SentryIssue> & { daily?: number[] } = {}): SentryIssue {
  const { daily = Array(14).fill(1), ...rest } = overrides;
  return {
    id,
    shortId: `PROD-${id}`,
    title: `PayrollLockedException: period locked ${id}`,
    culprit: "POST /v1/adjustments",
    permalink: `https://rogerhr.sentry.io/issues/${id}/`,
    firstSeen: daysAgo(30),
    lastSeen: NOW,
    count: "14",
    userCount: 0,
    substatus: "ongoing",
    project: { id: "1", slug: "roger-customer-api-prod" },
    metadata: { type: "PayrollLockedException", value: "period locked" },
    stats: { "14d": daily.map((count, index) => [index, count]) },
    ...rest,
  };
}

const feIssue = (id: string, overrides: Partial<SentryIssue> = {}) =>
  issue(id, {
    title: "AxiosError: Request failed with status code 500",
    metadata: { type: "AxiosError" },
    project: { id: "2", slug: "roger-frontend-prod" },
    ...overrides,
  });

function fact(issueId: string, overrides: Partial<EventFacts> = {}): EventFacts {
  return {
    eventId: `${issueId}-${Math.random()}`,
    issueId,
    project: "roger-customer-api-prod",
    release: "84.2.0",
    feVersion: "84.2.0",
    realm: "acme",
    requestId: null,
    topFrame: { path: "com/rogerhr/customer/domain/adjustment/AdjustmentService.java", line: 10 },
    timestamp: NOW,
    ...overrides,
  };
}

function rule(overrides: Partial<Rule>): Rule {
  return {
    id: "r1",
    kind: "known",
    match: { type: "PayrollLockedException", culprit: "AdjustmentService" },
    reason: "locked period",
    createdAt: daysAgo(1),
    createdBy: "lead",
    ...overrides,
  };
}

// Live since 2 days ago; facts default to NOW, so they are after the release.
const live = (version: string) => ({ version, at: daysAgo(2) });

const doneTicket = (fixVersion: string): Ticket => ({ status: "Done", done: true, fixVersions: [{ name: fixVersion, released: true }] });

function run(overrides: Partial<ClassifyInput>) {
  const input: ClassifyInput = {
    issues: [issue("1")],
    facts: new Map([["1", [fact("1")]]]),
    hourly24: new Map(),
    rules: [],
    triage: {},
    tickets: new Map(),
    currentRelease: { FE: live("84.2.0"), BE: live("84.2.0") },
    releases: [],
    rangeStart: daysAgo(1),
    now: NOW,
    ...overrides,
  };
  return classifyIssues(input);
}

const rowOf = (result: ReturnType<typeof classifyIssues>, id: string) => result.rows.find((row) => row.id === id)!;
const last24 = (total: number) => new Map([["1", [total, ...Array(23).fill(0)]]]);

describe("rules", () => {
  it("hides an issue matched by a known rule on type + culprit and counts the hit", () => {
    const result = run({ rules: [rule({})] });
    expect(rowOf(result, "1")).toMatchObject({ bucket: "hidden", hiddenReason: "known", ruleId: "r1" });
    expect(result.ruleHits.get("r1")).toBe(1);
  });

  it("puts an ugly rule's issue in the ugly bucket", () => {
    expect(rowOf(run({ rules: [rule({ kind: "ugly" })] }), "1").bucket).toBe("ugly");
  });

  it("shows a known issue again when it spikes", () => {
    const daily = Array(14).fill(3);
    const row = rowOf(run({ issues: [issue("1", { daily })], rules: [rule({})], hourly24: last24(40) }), "1");
    expect(row).toMatchObject({ bucket: "spiking", spikingKnown: true });
  });

  it("keeps a known issue hidden when the spike is under 20 events", () => {
    const daily = Array(14).fill(1);
    expect(rowOf(run({ issues: [issue("1", { daily })], rules: [rule({})], hourly24: last24(15) }), "1").bucket).toBe("hidden");
  });

  it("lifts a rule whose date has passed", () => {
    expect(rowOf(run({ rules: [rule({ until: { date: daysAgo(1) } })] }), "1").bucket).not.toBe("hidden");
  });

  it("lifts a rule once its release is current", () => {
    expect(rowOf(run({ rules: [rule({ until: { release: "84.2.0" } })] }), "1").bucket).not.toBe("hidden");
  });

  it("lifts a rule once events per day go above the threshold", () => {
    const row = rowOf(run({ rules: [rule({ until: { eventsPerDayAbove: 50 } })], hourly24: last24(60) }), "1");
    expect(row.bucket).not.toBe("hidden");
  });

  it("never matches a rule with an empty match", () => {
    expect(rowOf(run({ rules: [rule({ match: {} })] }), "1").bucket).not.toBe("hidden");
  });
});

describe("fix didn't work", () => {
  it("flags a ruled issue whose RP is done but still happens on a later release", () => {
    const result = run({
      rules: [rule({ rp: "RP-1" })],
      tickets: new Map([["RP-1", doneTicket("84.1.0")]]),
    });
    expect(rowOf(result, "1")).toMatchObject({ bucket: "fixFailed", rp: { key: "RP-1", done: true } });
  });

  it("flags an issue ticketed through triage the same way", () => {
    const result = run({ triage: { "1": { rp: "RP-2" } }, tickets: new Map([["RP-2", doneTicket("84.1.0")]]) });
    expect(rowOf(result, "1").bucket).toBe("fixFailed");
  });

  it("does not flag when the events are older than the fix version", () => {
    const result = run({
      facts: new Map([["1", [fact("1", { release: "84.0.0" })]]]),
      triage: { "1": { rp: "RP-2" } },
      tickets: new Map([["RP-2", doneTicket("84.1.0")]]),
    });
    expect(rowOf(result, "1").bucket).not.toBe("fixFailed");
  });
});

describe("stale frontend", () => {
  it("hides an issue whose every sampled event comes from an older frontend", () => {
    const facts = new Map([["1", [fact("1", { feVersion: "84.1.0" }), fact("1", { feVersion: "84.1.3" })]]]);
    expect(rowOf(run({ facts }), "1")).toMatchObject({ bucket: "hidden", hiddenReason: "staleFe" });
  });

  it("keeps old-version events sent before the current frontend went live", () => {
    const facts = new Map([["1", [fact("1", { feVersion: "84.1.0", timestamp: daysAgo(3) })]]]);
    expect(rowOf(run({ facts }), "1").hiddenReason).toBeUndefined();
  });

  it("keeps it when one sampled event is on the current frontend", () => {
    const facts = new Map([["1", [fact("1", { feVersion: "84.1.0" }), fact("1", { feVersion: "84.2.0" })]]]);
    expect(rowOf(run({ facts }), "1").hiddenReason).toBeUndefined();
  });

  it("hides chunk load errors whatever the version", () => {
    const issues = [feIssue("1", { title: "ChunkLoadError: Loading chunk 12 failed" })];
    expect(rowOf(run({ issues }), "1").hiddenReason).toBe("staleFe");
  });
});

describe("issue with no sampled events", () => {
  const noFacts = new Map<string, EventFacts[]>([["1", []]]);

  it("is not stale", () => {
    expect(rowOf(run({ facts: noFacts, currentRelease: { FE: live("99.0.0"), BE: live("99.0.0") } }), "1").hiddenReason).toBeUndefined();
  });

  it("is not hidden by a realm rule", () => {
    expect(rowOf(run({ facts: noFacts, rules: [rule({ match: { realm: ["demo"] } })] }), "1").bucket).not.toBe("hidden");
  });

  it("is not folded into a backend row", () => {
    const result = run({ issues: [issue("1"), feIssue("2")], facts: new Map([["1", [fact("1", { requestId: "a" })]], ["2", []]]) });
    expect(rowOf(result, "2").hiddenReason).toBeUndefined();
  });
});

describe("realm rules", () => {
  it("hide an issue when every sampled event is from a matched realm", () => {
    const facts = new Map([["1", [fact("1", { realm: "demo" })]]]);
    expect(rowOf(run({ facts, rules: [rule({ match: { realm: ["demo"] } })] }), "1").bucket).toBe("hidden");
  });

  it("keep an issue that also hits a real customer", () => {
    const facts = new Map([["1", [fact("1", { realm: "demo" }), fact("1", { realm: "acme" })]]]);
    expect(rowOf(run({ facts, rules: [rule({ match: { realm: ["demo"] } })] }), "1").bucket).not.toBe("hidden");
  });
});

describe("state", () => {
  it("is new when first seen inside the range", () => {
    expect(rowOf(run({ issues: [issue("1", { firstSeen: daysAgo(0.5) })] }), "1").bucket).toBe("new");
  });

  it("is regressed when Sentry says so", () => {
    expect(rowOf(run({ issues: [issue("1", { substatus: "regressed" })] }), "1").bucket).toBe("regressed");
  });

  it("is regressed when it comes back after 7 quiet days", () => {
    const daily = [5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 3];
    expect(rowOf(run({ issues: [issue("1", { daily })], hourly24: last24(3) }), "1").bucket).toBe("regressed");
  });

  it("is ongoing otherwise", () => {
    expect(rowOf(run({}), "1").bucket).toBe("ongoing");
  });
});

describe("frontend + backend links", () => {
  it("folds a frontend issue fully matched to one backend issue", () => {
    const facts = new Map([
      ["1", [fact("1", { requestId: "a" }), fact("1", { requestId: "b" }), fact("1", { requestId: "c" })]],
      ["2", ["a", "b", "c"].map((requestId) => fact("2", { requestId, project: "roger-frontend-prod" }))],
    ]);
    const result = run({ issues: [issue("1"), feIssue("2")], facts });
    expect(rowOf(result, "2")).toMatchObject({ bucket: "hidden", hiddenReason: "foldedIntoBe" });
    expect(rowOf(result, "1").links[0]).toMatchObject({
      issueId: "2",
      matched: 3,
      sampled: 3,
      permalink: "https://rogerhr.sentry.io/issues/2/",
      requestIds: ["a", "b", "c"],
    });
  });

  it("keeps a partly matched frontend issue visible and links both ways", () => {
    const facts = new Map([
      ["1", [fact("1", { requestId: "a" }), fact("1", { requestId: "b" })]],
      ["2", ["a", "b", "zz"].map((requestId) => fact("2", { requestId, project: "roger-frontend-prod" }))],
    ]);
    const result = run({ issues: [issue("1"), feIssue("2")], facts });
    expect(rowOf(result, "2").hiddenReason).toBeUndefined();
    expect(rowOf(result, "2").links[0]).toMatchObject({ issueId: "1", matched: 2, sampled: 3 });
    expect(rowOf(result, "1").links[0]).toMatchObject({ issueId: "2", matched: 2, sampled: 3 });
  });

  it("keeps a frontend issue matching two backend issues visible, linked to both", () => {
    const facts = new Map([
      ["1", [fact("1", { requestId: "a" })]],
      ["3", [fact("3", { requestId: "b" })]],
      ["2", ["a", "b"].map((requestId) => fact("2", { requestId, project: "roger-frontend-prod" }))],
    ]);
    const result = run({ issues: [issue("1"), issue("3"), feIssue("2")], facts });
    expect(rowOf(result, "2").hiddenReason).toBeUndefined();
    expect(rowOf(result, "2").links.map((link) => link.issueId).sort()).toEqual(["1", "3"]);
  });
});

describe("where it was thrown", () => {
  it("keeps the first sampled top frame as file:line", () => {
    expect(rowOf(run({}), "1").topFrame).toBe("com/rogerhr/customer/domain/adjustment/AdjustmentService.java:10");
  });

  it("is absent when no sampled event has an in-app frame", () => {
    expect(rowOf(run({ facts: new Map([["1", [fact("1", { topFrame: null })]]]) }), "1").topFrame).toBeUndefined();
  });
});

describe("linked ticket", () => {
  it("takes the RP linked in Sentry and its Jira status", () => {
    const annotations = [{ url: "https://example.com/x", displayName: "Docs" }, { url: "https://rogerhr.atlassian.net/browse/RP-42", displayName: "RP-42" }];
    const tickets = new Map([["RP-42", { status: "In Progress", done: false, fixVersions: [] }]]);
    expect(rowOf(run({ issues: [issue("1", { annotations })], tickets }), "1").rp).toEqual({ key: "RP-42", status: "In Progress", done: false });
  });
});

describe("environments", () => {
  it("lists the distinct environments of the sampled events", () => {
    const facts = new Map([["1", [fact("1", { environment: "test" }), fact("1", { environment: "staging" }), fact("1", { environment: "test" }), fact("1")]]]);
    expect(rowOf(run({ facts }), "1").environments).toEqual(["staging", "test"]);
  });
});

describe("origin", () => {
  const originOf = (feVersions: (string | null)[], project = "roger-customer-api-prod") =>
    rowOf(run({ issues: [issue("1", { project: { id: "1", slug: project } })], facts: new Map([["1", feVersions.map((feVersion) => fact("1", { feVersion }))]]) }), "1").origin;

  it("is browser, script or mixed from the frontend version header", () => {
    expect([originOf(["84.2.0"]), originOf([null]), originOf(["84.2.0", null])]).toEqual(["browser", "script", "mixed"]);
  });

  it("is only set on customer-api issues", () => {
    expect(originOf([null], "roger-public-api-prod")).toBeUndefined();
  });
});

describe("realms and releases", () => {
  it("counts sampled events per realm, most first", () => {
    const facts = new Map([["1", [fact("1", { realm: "b" }), fact("1", { realm: "a" }), fact("1", { realm: "a" })]]]);
    expect(rowOf(run({ facts }), "1").realms.map((realm) => [realm.name, realm.events])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });

  it("marks an issue whose latest sampled release is older as not current", () => {
    const facts = new Map([["1", [fact("1", { release: "84.1.0", feVersion: null })]]]);
    expect(rowOf(run({ facts }), "1").isCurrentRelease).toBe(false);
  });

  it("treats an issue as current when no release is known", () => {
    expect(rowOf(run({ currentRelease: { FE: null, BE: null } }), "1").isCurrentRelease).toBe(true);
  });
});

describe("compareVersions", () => {
  it("compares numerically", () => {
    expect(compareVersions("84.10.0", "84.9.1")).toBeGreaterThan(0);
  });

  it("ignores a v prefix", () => {
    expect(compareVersions("v84.2.0", "84.2.0")).toBe(0);
  });
});
