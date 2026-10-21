import { areaOf } from "../shared/areas";
import type { EventFacts, IssueRow, Rule, Side, Triage } from "../shared/model";
import type { Ticket } from "./jira";
import type { Release, SentryIssue } from "./sentry";

const DAY_MS = 24 * 3600 * 1000;
const SPIKE_FACTOR = 10;
const SPIKE_MIN_EVENTS = 20;
const QUIET_DAYS = 7;
const STALE_FE_MESSAGES = [
  "ChunkLoadError",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
];

export type ClassifyInput = {
  issues: SentryIssue[];
  facts: Map<string, EventFacts[]>;
  hourly24: Map<string, number[]>;
  rules: Rule[];
  triage: Triage;
  tickets: Map<string, Ticket>;
  currentRelease: { FE: Release | null; BE: Release | null };
  /** Releases with their dates, used to name the release an issue was first seen in. */
  releases: (Release & { side: "FE" | "BE" })[];
  rangeStart: string;
  now: string;
};

export function classifyIssues(input: ClassifyInput): { rows: IssueRow[]; ruleHits: Map<string, number> } {
  const ruleHits = new Map<string, number>();
  const rows = input.issues.map((issue) => classifyOne(issue, input, ruleHits));
  linkFeBe(rows, input.facts);
  return { rows, ruleHits };
}

function classifyOne(issue: SentryIssue, input: ClassifyInput, ruleHits: Map<string, number>): IssueRow {
  const facts = input.facts.get(issue.id) ?? [];
  const daily = (issue.stats?.["14d"] ?? []).map(([, count]) => count).slice(-14);
  const last24 = sum(input.hourly24.get(issue.id) ?? []) || (daily.at(-1) ?? 0);
  const side = sideOf(issue.project.slug);
  const current = (side === "FE" ? input.currentRelease.FE : side === "BE" ? input.currentRelease.BE : null)?.version ?? null;
  const lastRelease = maxVersion(facts.map((fact) => fact.release));
  const frame = facts.find((fact) => fact.topFrame)?.topFrame;

  const row: IssueRow = {
    id: issue.id,
    shortId: issue.shortId,
    title: issue.title,
    type: issue.metadata?.type ?? issue.title.split(":")[0],
    culprit: issue.culprit,
    project: issue.project.slug,
    side,
    area: areaOf(frame?.path ?? issue.culprit),
    ...(frame ? { topFrame: `${frame.path}:${frame.line}` } : {}),
    permalink: issue.permalink,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    firstRelease: firstReleaseOf(issue.firstSeen, side, input.releases),
    lastRelease,
    isCurrentRelease: !lastRelease || !current || compareVersions(lastRelease, current) >= 0,
    count: Number(issue.count),
    userCount: issue.userCount,
    daily,
    bucket: "ongoing",
    spikingKnown: false,
    realms: realmsOf(facts),
    links: [],
    triage: input.triage[issue.id],
  };

  const spiking = isSpiking(daily, last24);
  const matched = input.rules.find((rule) => matchesRule(row, facts, rule));
  if (matched) ruleHits.set(matched.id, (ruleHits.get(matched.id) ?? 0) + 1);
  const key = (matched?.rp ?? input.triage[issue.id]?.rp)?.toUpperCase();
  const ticket = key ? input.tickets.get(key) : undefined;
  if (key) row.rp = { key, status: ticket?.status ?? "?", done: ticket?.done ?? false };

  if (matched && !isLifted(matched, { now: input.now, current, last24, tickets: input.tickets })) {
    row.ruleId = matched.id;
    if (spiking) {
      row.bucket = "spiking";
      row.spikingKnown = true;
      return row;
    }
    if (matched.kind === "ugly") {
      row.bucket = "ugly";
      return row;
    }
    row.bucket = "hidden";
    row.hiddenReason = matched.kind;
    return row;
  }

  if (isStaleFe(issue, facts, input.currentRelease.FE)) {
    row.bucket = "hidden";
    row.hiddenReason = "staleFe";
    return row;
  }

  const fixVersion = ticket?.done ? maxVersion(ticket.fixVersions.filter((version) => version.released).map((version) => version.name)) : null;
  if (fixVersion && facts.some((fact) => fact.release && compareVersions(fact.release, fixVersion) >= 0)) {
    row.bucket = "fixFailed";
    return row;
  }

  row.bucket = stateOf(issue, daily, last24, input);
  return row;
}

function stateOf(issue: SentryIssue, daily: number[], last24: number, input: ClassifyInput): IssueRow["bucket"] {
  if (issue.firstSeen >= input.rangeStart) return "new";
  if (issue.substatus === "regressed") return "regressed";
  const quiet = daily.slice(-1 - QUIET_DAYS, -1);
  const firstSeenBeforeQuiet = Date.parse(issue.firstSeen) < Date.parse(input.now) - (QUIET_DAYS + 1) * DAY_MS;
  if (last24 > 0 && quiet.length === QUIET_DAYS && quiet.every((count) => count === 0) && firstSeenBeforeQuiet) return "regressed";
  if (isSpiking(daily, last24)) return "spiking";
  return "ongoing";
}

export function isSpiking(daily: number[], last24: number): boolean {
  return last24 >= SPIKE_MIN_EVENTS && last24 > SPIKE_FACTOR * median(daily);
}

export function matchesRule(row: IssueRow, facts: EventFacts[], rule: Rule): boolean {
  const { issueId, project, type, messageRegex, culprit, realm } = rule.match;
  if ([issueId, project, type, messageRegex, culprit, realm].every((field) => field === undefined)) return false;
  if (issueId !== undefined && issueId !== row.id) return false;
  if (project !== undefined && project !== row.project) return false;
  if (type !== undefined && type !== row.type) return false;
  if (messageRegex !== undefined && !safeRegex(messageRegex)?.test(row.title)) return false;
  // A class name ("AdjustmentService") lives in the frames; an endpoint ("POST /v1/…") in Sentry's culprit.
  if (culprit !== undefined && !row.culprit.includes(culprit) && !facts.some((fact) => fact.topFrame?.path.includes(culprit))) return false;
  if (realm !== undefined && !(facts.length > 0 && facts.every((fact) => fact.realm !== null && realm.includes(fact.realm)))) return false;
  return true;
}

export function isLifted(
  rule: Rule,
  context: { now: string; current: string | null; last24: number; tickets: Map<string, Ticket> },
): boolean {
  const { until, rp } = rule;
  if (until?.date && until.date <= context.now) return true;
  if (until?.release && context.current && compareVersions(context.current, until.release) >= 0) return true;
  if (until?.eventsPerDayAbove !== undefined && context.last24 > until.eventsPerDayAbove) return true;
  const ticket = rp ? context.tickets.get(rp.toUpperCase()) : undefined;
  return Boolean(ticket?.done && ticket.fixVersions.some((version) => version.released));
}

export function isStaleFe(issue: SentryIssue, facts: EventFacts[], currentFe: Release | null): boolean {
  if (STALE_FE_MESSAGES.some((message) => issue.title.includes(message))) return true;
  if (!currentFe || facts.length === 0) return false;
  // Stale = a user still on an old bundle after the new one went live; older events are just old.
  return facts.every(
    (fact) => fact.feVersion !== null && compareVersions(fact.feVersion, currentFe.version) < 0 && fact.timestamp >= currentFe.at,
  );
}

/** Links FE and BE issues whose sampled events share request ids; folds an FE issue fully matched to one BE issue. */
export function linkFeBe(rows: IssueRow[], factsByIssue: Map<string, EventFacts[]>): void {
  const beByRequest = new Map<string, string>();
  for (const row of rows) {
    if (row.side === "FE") continue;
    for (const fact of factsByIssue.get(row.id) ?? []) if (fact.requestId) beByRequest.set(fact.requestId, row.id);
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const fe of rows.filter((row) => row.side === "FE")) {
    const facts = factsByIssue.get(fe.id) ?? [];
    const matches = new Map<string, string[]>();
    for (const fact of facts) {
      const beId = fact.requestId ? beByRequest.get(fact.requestId) : undefined;
      if (beId && fact.requestId) matches.set(beId, [...(matches.get(beId) ?? []), fact.requestId]);
    }
    for (const [beId, requestIds] of matches) {
      const be = byId.get(beId)!;
      const matched = requestIds.length;
      be.links.push({ issueId: fe.id, shortId: fe.shortId, title: fe.title, permalink: fe.permalink, requestIds, matched, sampled: facts.length });
      fe.links.push({ issueId: be.id, shortId: be.shortId, title: be.title, permalink: be.permalink, requestIds, matched, sampled: facts.length });
    }
    const [onlyMatch] = matches.values();
    const fullyMatched = matches.size === 1 && onlyMatch.length === facts.length && facts.length > 0;
    if (fullyMatched && fe.bucket !== "hidden") {
      fe.bucket = "hidden";
      fe.hiddenReason = "foldedIntoBe";
    }
  }
}

export function compareVersions(a: string, b: string): number {
  const parts = (version: string) => (/\d+(\.\d+)*/.exec(version)?.[0] ?? "0").split(".").map(Number);
  const [left, right] = [parts(a), parts(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function sideOf(project: string): Side {
  if (project.includes("frontend")) return "FE";
  if (project.includes("mcp")) return "MCP";
  if (project.includes("integration")) return "INT";
  return "BE";
}

function firstReleaseOf(firstSeen: string, side: Side, releases: ClassifyInput["releases"]): string | null {
  const sideReleases = releases.filter((release) => release.side === (side === "FE" ? "FE" : "BE") && release.at <= firstSeen);
  return sideReleases.sort((a, b) => a.at.localeCompare(b.at)).at(-1)?.version ?? null;
}

function realmsOf(facts: EventFacts[]): IssueRow["realms"] {
  const counts = new Map<string, number>();
  for (const fact of facts) if (fact.realm) counts.set(fact.realm, (counts.get(fact.realm) ?? 0) + 1);
  // ponytail: no user id in the sampled facts, so users per realm stays 0; add EmployeeId to EventFacts if wanted.
  return [...counts]
    .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
    .map(([name, events]) => ({ name, events, users: 0 }));
}

function maxVersion(versions: (string | null)[]): string | null {
  return versions.reduce<string | null>((max, version) => (version && (!max || compareVersions(version, max) > 0) ? version : max), null);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}
