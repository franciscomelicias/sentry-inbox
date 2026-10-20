import { describe, expect, it } from "vitest";
import { areaOf } from "./areas";
import { ruleSchema } from "./model";

const knownRule = {
  id: "r1",
  kind: "known",
  match: { type: "PayrollLockedException", culprit: "AdjustmentService" },
  reason: "locked period",
  rp: "RP-1234",
  createdAt: "2026-10-20T08:00:00Z",
  createdBy: "lead",
};

describe("ruleSchema", () => {
  it("accepts a known rule on type + culprit", () => {
    expect(ruleSchema.safeParse(knownRule).success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(ruleSchema.safeParse({ ...knownRule, kind: "forever" }).success).toBe(false);
  });
});

describe("areaOf", () => {
  it("maps a timesheet path to Time", () => {
    expect(areaOf("com/rogerhr/customer/service/timesheet/TimesheetSearchService.java")).toBe("Time");
  });

  it("falls back to Other", () => {
    expect(areaOf("src/foo/Bar.tsx")).toBe("Other");
  });
});
