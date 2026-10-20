import { describe, expect, it } from "vitest";
import { deployedReleases } from "./sentry";

describe("deployedReleases", () => {
  it("dates a release by its first prod event, and skips one prepared but not live yet", () => {
    const releases = [
      { version: "87.0.0", dateCreated: "2026-10-20T08:00:00Z", firstEvent: null },
      { version: "86.0.1", dateCreated: "2026-10-14T08:00:00Z", firstEvent: "2026-10-15T06:10:00Z" },
      { version: "86.0.0", dateCreated: "2026-10-07T08:00:00Z", firstEvent: "2026-10-08T06:05:00Z" },
    ];
    expect(deployedReleases(releases)).toEqual([
      { version: "86.0.0", at: "2026-10-08T06:05:00Z" },
      { version: "86.0.1", at: "2026-10-15T06:10:00Z" },
    ]);
  });
});
