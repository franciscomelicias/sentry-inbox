import { describe, expect, it } from "vitest";
import { parseLinearIssues } from "./linear";

const issue = (identifier: string, type: string, releases: [string, string][] = []) => ({
  identifier,
  state: { name: type === "completed" ? "Done" : "In Progress", type },
  releases: { nodes: releases.map(([name, stage]) => ({ name, stage: { type: stage } })) },
});

describe("parseLinearIssues", () => {
  it("reads status, done and releases; an unknown key is simply absent", () => {
    const body = JSON.stringify({ data: { issues: { nodes: [issue("ROG-1", "completed", [["86.0.1", "completed"], ["87.0.0", "started"]])] } } });
    const tickets = parseLinearIssues(body, 200);
    expect(tickets.get("ROG-1")).toEqual({ status: "Done", done: true, releases: [{ name: "86.0.1", released: true }, { name: "87.0.0", released: false }] });
    expect(tickets.has("ROG-99999")).toBe(false);
  });

  it("counts a canceled ticket as done, a started one as not", () => {
    const body = JSON.stringify({ data: { issues: { nodes: [issue("ROG-2", "canceled"), issue("ROG-3", "started")] } } });
    const tickets = parseLinearIssues(body, 200);
    expect(tickets.get("ROG-2")?.done).toBe(true);
    expect(tickets.get("ROG-3")?.done).toBe(false);
  });

  it("fails loudly on a rejected key or a GraphQL error without data", () => {
    expect(() => parseLinearIssues("", 401)).toThrow(/401/);
    expect(() => parseLinearIssues(JSON.stringify({ errors: [{ message: "Authentication required" }] }), 200)).toThrow(/Authentication required/);
  });
});
