import { describe, expect, it } from "vitest";
import type { IssueRow } from "./model";
import { investigatePrompt, leadBrief, RULES_PATH, ticketMessage, TRIAGE_PATH } from "./prompts";

const row: IssueRow = {
  id: "42",
  shortId: "ROGER-CUSTOMER-API-PROD-2Q",
  title: "ValidationException: Cannot update DECLINED request status.",
  type: "ValidationException",
  culprit: "POST /v1/leave-requests/{leaveRequestId}/pending/cancel",
  project: "roger-customer-api-prod",
  side: "BE",
  area: "Leaves",
  permalink: "https://rogerhr.sentry.io/issues/42/",
  firstSeen: "2026-10-20T13:45:40Z",
  lastSeen: "2026-10-20T13:45:43Z",
  firstRelease: "86.0.1",
  lastRelease: "86.0.1",
  isCurrentRelease: true,
  count: 2,
  userCount: 0,
  daily: Array(14).fill(0),
  bucket: "new",
  spikingKnown: false,
  realms: [{ name: "acme", events: 2, users: 0 }],
  links: [],
};

describe("prompts", () => {
  it("briefs the lead with both state files and the no-Sentry-writes rule", () => {
    const brief = leadBrief();
    expect(brief).toContain(RULES_PATH);
    expect(brief).toContain(TRIAGE_PATH);
    expect(brief).toContain("never write to Sentry");
  });

  it("points the investigation at the issue and the triage file, read-only", () => {
    const prompt = investigatePrompt(row);
    expect(prompt).toContain(row.permalink);
    expect(prompt).toContain(TRIAGE_PATH);
    expect(prompt).toContain("read-only");
  });

  it("asks the lead to run /create-ticket for the issue", () => {
    expect(ticketMessage(row)).toMatch(new RegExp(`^Run /create-ticket for ${row.permalink}`));
  });

  it("passes the investigation verdict to the ticket when there is one", () => {
    const message = ticketMessage({ ...row, triage: { verdict: "Cancel on a declined request is not guarded", reproSteps: ["decline", "cancel"] } });
    expect(message).toContain("Cancel on a declined request is not guarded");
    expect(message).toContain("1. decline");
  });
});
