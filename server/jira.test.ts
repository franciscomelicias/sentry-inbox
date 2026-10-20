import { describe, expect, it } from "vitest";
import { JiraSearchError, parseJiraSearch } from "./jira";

describe("parseJiraSearch", () => {
  it("reads status, done and fix versions", () => {
    const body = JSON.stringify({
      issues: [{ key: "RP-1", fields: { status: { name: "Done", statusCategory: { key: "done" } }, fixVersions: [{ name: "86.0.1", released: true }] } }],
    });
    expect(parseJiraSearch(body, 200).get("RP-1")).toEqual({ status: "Done", done: true, fixVersions: [{ name: "86.0.1", released: true }] });
  });

  it("names the keys Jira rejected, so they can be dropped and the search retried", () => {
    const body = JSON.stringify({ errorMessages: ["An issue with key 'RP-99999' does not exist for field 'key'."] });
    expect(() => parseJiraSearch(body, 400)).toThrow(JiraSearchError);
    try {
      parseJiraSearch(body, 400);
    } catch (error) {
      expect((error as JiraSearchError).badKeys).toEqual(["RP-99999"]);
    }
  });

  it("fails loudly on a rejected token", () => {
    expect(() => parseJiraSearch("", 401)).toThrow(/401/);
  });
});
