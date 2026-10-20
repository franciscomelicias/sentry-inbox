import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DEFAULT_FILTERS,
  inboxSchema,
  prefsSchema,
  ruleSchema,
  triageEntrySchema,
  type EventFacts,
  type Inbox,
  type Prefs,
  type Rule,
  type RuleInput,
  type Triage,
} from "../shared/model";
import { cacheDir, rulesPath, triagePath } from "./paths";

/** rules.json is shared with lead:sentry: a file we can't parse must never be overwritten. */
export class RulesFileBrokenError extends Error {
  constructor(cause: string) {
    super(`rules.json can't be parsed (${cause}); fix it or ask lead:sentry to, then retry`);
  }
}

export const DEFAULT_PREFS: Prefs = {
  range: "deploy",
  graphsOpen: true,
  tab: "new",
  filters: DEFAULT_FILTERS,
  savedViews: [],
};

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function writeAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, path);
}

export async function readRules(): Promise<{ rules: Rule[]; invalid: string[]; fileError: string | null }> {
  const text = await readText(rulesPath());
  if (text === null) return { rules: [], invalid: [], fileError: null };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return { rules: [], invalid: [], fileError: cause instanceof Error ? cause.message : String(cause) };
  }
  if (!Array.isArray(raw)) return { rules: [], invalid: [], fileError: "not a JSON array" };
  const rules: Rule[] = [];
  const invalid: string[] = [];
  raw.forEach((entry, index) => {
    const parsed = ruleSchema.safeParse(entry);
    if (parsed.success) rules.push(parsed.data);
    else invalid.push(`${entry?.id ?? index}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  });
  return { rules, invalid, fileError: null };
}

/** Read-modify-write on the raw entries, so rules this version can't parse are kept as they are. */
async function updateRules(change: (entries: unknown[]) => unknown[]): Promise<void> {
  const text = await readText(rulesPath());
  let entries: unknown = [];
  if (text !== null) {
    try {
      entries = JSON.parse(text);
    } catch (cause) {
      throw new RulesFileBrokenError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  if (!Array.isArray(entries)) throw new RulesFileBrokenError("not a JSON array");
  await writeAtomic(rulesPath(), change(entries));
}

export async function addRule(input: RuleInput): Promise<{ id: string }> {
  const rule: Rule = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), createdBy: "screen" };
  await updateRules((entries) => [...entries, rule]);
  return { id: rule.id };
}

export async function deleteRule(id: string): Promise<void> {
  await updateRules((entries) => entries.filter((entry) => (entry as { id?: unknown })?.id !== id));
}

export async function readTriage(): Promise<Triage> {
  const text = await readText(triagePath());
  if (text === null) return {};
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(raw).flatMap(([id, entry]) => {
        const parsed = triageEntrySchema.safeParse(entry);
        return parsed.success ? [[id, parsed.data]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export async function readPrefs(): Promise<Prefs> {
  const text = await readText(join(cacheDir(), "prefs.json"));
  // Spread over the defaults so prefs saved before a new field existed still parse.
  const parsed = prefsSchema.safeParse({ ...DEFAULT_PREFS, ...((text ? safeJson(text) : null) ?? {}) as object });
  return parsed.success ? parsed.data : DEFAULT_PREFS;
}

export const writePrefs = (prefs: Prefs) => writeAtomic(join(cacheDir(), "prefs.json"), prefs);

/** Sampled event facts per issue, reused while the issue's lastSeen is unchanged. */
export async function readCachedFacts(issueId: string): Promise<{ lastSeen: string; facts: EventFacts[] } | null> {
  const text = await readText(join(cacheDir(), "facts", `${issueId}.json`));
  return text ? (safeJson(text) as { lastSeen: string; facts: EventFacts[] } | null) : null;
}

export const writeCachedFacts = (issueId: string, lastSeen: string, facts: EventFacts[]) =>
  writeAtomic(join(cacheDir(), "facts", `${issueId}.json`), { lastSeen, facts });

export async function readInboxCache(): Promise<Inbox | null> {
  const text = await readText(join(cacheDir(), "inbox.json"));
  const parsed = text ? inboxSchema.safeParse(safeJson(text)) : null;
  return parsed?.success ? parsed.data : null;
}

export const writeInboxCache = (inbox: Inbox) => writeAtomic(join(cacheDir(), "inbox.json"), inbox);

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
