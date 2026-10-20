import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SentryEvent } from "./facts";
import type { SentryIssue } from "./sentry";

vi.mock("./sentry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sentry")>()),
  listProdProjects: vi.fn(async () => [{ slug: "roger-customer-api-prod", id: "1" }]),
  listIssues: vi.fn(),
  issueStats24h: vi.fn(async () => new Map()),
  listDeployedReleases: vi.fn(async () => []),
  hourlyTotals: vi.fn(async () => []),
  latestEvents: vi.fn(),
}));
vi.mock("./jira", async (importOriginal) => ({ ...(await importOriginal<typeof import("./jira")>()), fetchTickets: vi.fn(async () => new Map()) }));
vi.mock("./blame", () => ({ ownerOf: vi.fn(async () => null) }));

const sentry = await import("./sentry");
const { getInbox } = await import("./inbox");
const { addRule } = await import("./store");

function issue(id: string): SentryIssue {
  return {
    id,
    shortId: `PROD-${id}`,
    title: `ValidationException: nope ${id}`,
    culprit: "POST /v1/x",
    permalink: "",
    firstSeen: "2026-09-01T00:00:00Z",
    lastSeen: new Date().toISOString(),
    count: "3",
    userCount: 0,
    project: { id: "1", slug: "roger-customer-api-prod" },
    metadata: { type: "ValidationException" },
  };
}

const event = (id: string): SentryEvent => ({ eventID: id, dateCreated: new Date().toISOString() });

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "sentry-inbox-"));
  process.env.SENTRY_INBOX_HOME = dir;
  process.env.SENTRY_INBOX_CACHE = join(dir, "cache");
  vi.mocked(sentry.listIssues).mockResolvedValue([issue("1"), issue("2")]);
  vi.mocked(sentry.latestEvents).mockImplementation(async (id) => [event(`e${id}`)]);
});

describe("getInbox", () => {
  it("applies a new rule on the next load without refetching Sentry", async () => {
    await getInbox({ range: "7d", force: true });
    await addRule({ kind: "hidden", match: { issueId: "1" }, reason: "noise" });
    const inbox = await getInbox({ range: "7d", force: false });
    expect(inbox.rows.find((row) => row.id === "1")?.bucket).toBe("hidden");
    expect(sentry.listIssues).toHaveBeenCalledTimes(1);
  });

  it("still loads when one issue's events can't be fetched, and says so", async () => {
    vi.mocked(sentry.latestEvents).mockImplementation(async (id) => {
      if (id === "2") throw new Error("Sentry 404 on /issues/2/events/");
      return [event(`e${id}`)];
    });
    const inbox = await getInbox({ range: "14d", force: true });
    expect(inbox.rows.map((row) => row.id).sort()).toEqual(["1", "2"]);
    expect(inbox.errors.join(" ")).toMatch(/1 issue/);
  });
});
