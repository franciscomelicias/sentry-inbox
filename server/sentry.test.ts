import { describe, expect, it } from "vitest";
import { deployedReleases, getToken } from "./sentry";

describe("getToken", () => {
  it("picks up a token added after a lookup found none", async () => {
    delete process.env.SENTRY_AUTH_TOKEN;
    process.env.SENTRY_INBOX_KEYCHAIN_SERVICE = "sentry-inbox-test-absent";
    expect(await getToken()).toBeNull();
    process.env.SENTRY_AUTH_TOKEN = "added-later";
    expect(await getToken()).toBe("added-later");
    delete process.env.SENTRY_AUTH_TOKEN;
    delete process.env.SENTRY_INBOX_KEYCHAIN_SERVICE;
  });
});

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
