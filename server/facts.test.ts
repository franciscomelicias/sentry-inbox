import { describe, expect, it } from "vitest";
import { extractFacts } from "./facts";
import beEvent from "./fixtures/be-event.json";
import feEvent from "./fixtures/fe-event.json";

describe("extractFacts", () => {
  it("reads realm, frontend version, request id and the culprit frame from a backend event", () => {
    const facts = extractFacts(beEvent, "1001", "roger-customer-api-prod");
    expect(facts).toMatchObject({
      eventId: "548cd52344064bedb33d7bd44a83874b",
      release: "86.0.1",
      realm: "acme",
      feVersion: "86.0.1",
      requestId: "b4d930bd-5e15-4504-a1a4-fd8cf57fa1b3",
      topFrame: { path: "com/rogerhr/customer/domain/leave_request/LeaveRequestService.java", line: 2019 },
    });
  });

  it("uses the release as frontend version and the api_request context as request id on a frontend event", () => {
    const facts = extractFacts(feEvent, "2002", "roger-frontend-prod");
    expect(facts).toMatchObject({
      feVersion: "86.0.1",
      realm: "acme",
      requestId: "e3347ae1-806d-40ca-b874-70a033ef1790",
      topFrame: { path: "src/page/leave/LeaveRequestDialog.tsx", line: 42 },
    });
  });

  it("falls back to the last api breadcrumb when the frontend event has no api_request context", () => {
    const { api_request: _, ...contexts } = feEvent.contexts;
    const facts = extractFacts({ ...feEvent, contexts }, "2002", "roger-frontend-prod");
    expect(facts.requestId).toBe("e3347ae1-806d-40ca-b874-70a033ef1790");
  });

  it("finds our frame in a chained exception whose root cause has none", () => {
    const frame = (module: string, inApp: boolean) => ({ module, filename: `${module.split(".").at(-1)}.java`, lineNo: 7, inApp });
    const chained = {
      eventID: "c",
      dateCreated: "2026-10-20T00:00:00Z",
      entries: [
        {
          type: "exception",
          data: {
            values: [
              { type: "IOException", stacktrace: { frames: [frame("org.apache.catalina.Socket", false)] } },
              { type: "HttpMessageNotWritableException", stacktrace: { frames: [frame("com.rogerhr.customer.api.shift.ShiftController", true)] } },
            ],
          },
        },
      ],
    };
    expect(extractFacts(chained, "4", "roger-customer-api-prod").topFrame?.path).toBe("com/rogerhr/customer/api/shift/ShiftController.java");
  });

  it("returns nulls for an event without contexts, breadcrumbs or frames", () => {
    const facts = extractFacts({ eventID: "x", dateCreated: "2026-10-20T00:00:00Z" }, "3", "roger-customer-api-prod");
    expect(facts).toMatchObject({ release: null, realm: null, feVersion: null, requestId: null, topFrame: null });
  });
});
