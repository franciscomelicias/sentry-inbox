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

  it("reads the endpoint before a generic top frame", () => {
    expect(areaOf("PUT /v1/timesheets", "com/rogerhr/customer/persistence/jooq/AbstractMultiTenantRepository.java")).toBe("Time");
  });

  it("falls back to the top frame when the endpoint names no area", () => {
    expect(areaOf("settle(axios/lib/core/settle)", "../../src/domain-ui/employee-compensation/grid/Grid.tsx")).toBe("Compensation");
  });

  it("maps compensation endpoints to Compensation, not Employee", () => {
    expect(areaOf("POST /v1/employee-compensations/search")).toBe("Compensation");
    expect(areaOf("GET /v1/employee/payment/reports")).toBe("Compensation");
    expect(areaOf("com/rogerhr/customer/domain/employee_payment/EmployeePaymentService.java")).toBe("Compensation");
  });
});
