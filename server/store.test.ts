import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { addRule, deleteRule, readRules, RulesFileBrokenError } from "./store";

const input = { kind: "hidden" as const, match: { issueId: "1" }, reason: "noise" };
let rulesFile: string;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "sentry-inbox-"));
  process.env.SENTRY_INBOX_HOME = dir;
  process.env.SENTRY_INBOX_CACHE = join(dir, "cache");
  rulesFile = join(dir, "rules.json");
});

describe("rules store", () => {
  it("adds a rule created by the screen", async () => {
    await addRule(input);
    const { rules } = await readRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ ...input, createdBy: "screen" });
  });

  it("skips an invalid rule and reports it", async () => {
    const valid = { ...input, id: "a", createdAt: "2026-10-20T00:00:00Z", createdBy: "lead" };
    writeFileSync(rulesFile, JSON.stringify([valid, { id: "b", kind: "bad" }]));
    const { rules, invalid } = await readRules();
    expect(rules.map((rule) => rule.id)).toEqual(["a"]);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatch(/^b: /);
  });

  it("never overwrites an unparseable rules file", async () => {
    writeFileSync(rulesFile, "{not json");
    expect((await readRules()).fileError).not.toBeNull();
    await expect(addRule(input)).rejects.toBeInstanceOf(RulesFileBrokenError);
    await expect(deleteRule("x")).rejects.toBeInstanceOf(RulesFileBrokenError);
    expect(readFileSync(rulesFile, "utf8")).toBe("{not json");
  });

  it("keeps a rule the lead wrote between two screen writes", async () => {
    await addRule({ ...input, reason: "a" });
    const current = JSON.parse(readFileSync(rulesFile, "utf8"));
    const lead = { ...input, reason: "lead", id: "lead-1", createdAt: "2026-10-20T00:00:00Z", createdBy: "lead" };
    writeFileSync(rulesFile, JSON.stringify([...current, lead]));
    await addRule({ ...input, reason: "b" });
    expect((await readRules()).rules.map((rule) => rule.reason)).toEqual(["a", "lead", "b"]);
  });

  it("keeps every rule when the screen adds several at once", async () => {
    await Promise.all(Array.from({ length: 10 }, (_, index) => addRule({ ...input, reason: String(index) })));
    expect((await readRules()).rules).toHaveLength(10);
  });

  it("deletes only the given rule", async () => {
    const { id } = await addRule({ ...input, reason: "a" });
    await addRule({ ...input, reason: "b" });
    await deleteRule(id);
    expect((await readRules()).rules.map((rule) => rule.reason)).toEqual(["b"]);
  });
});
