import type { EventFacts, Inbox, Range } from "../shared/model";
import { ownerOf } from "./blame";
import { classifyIssues } from "./classify";
import { extractFacts } from "./facts";
import { buildGraphs } from "./graphs";
import { fetchTickets, type Ticket } from "./jira";
import {
  hourlyTotals,
  issueStats24h,
  latestEvents,
  latestRelease,
  listIssues,
  listProdProjects,
  releasesSince,
  SentryAuthError,
  type Release,
  type SentryIssue,
} from "./sentry";
import { readCachedFacts, readInboxCache, readRules, readTriage, writeCachedFacts, writeInboxCache } from "./store";

const FRESH_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const DEAD_RULE_MS = 30 * DAY_MS;
const EVENTS_CONCURRENCY = 6;
const STATS_BATCH = 100;
const FE_PROJECT = "roger-frontend-prod";
const BE_PROJECT = "roger-customer-api-prod";

const recent = new Map<Range, { at: number; inbox: Inbox }>();
let projects: Promise<{ slug: string; id: string }[]> | null = null;

export async function getInbox({ range, force }: { range: Range; force: boolean }): Promise<Inbox> {
  const cached = recent.get(range);
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return cached.inbox;
  try {
    const inbox = await buildInbox(range);
    recent.set(range, { at: Date.now(), inbox });
    await writeInboxCache(inbox);
    return inbox;
  } catch (cause) {
    // A bad token must be fixed, not hidden behind old data.
    if (cause instanceof SentryAuthError) throw cause;
    const stale = cached?.inbox ?? (await readInboxCache());
    if (!stale) throw cause;
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ...stale, staleSince: stale.staleSince ?? stale.fetchedAt, errors: [...stale.errors.filter((error) => error !== message), message] };
  }
}

async function buildInbox(range: Range): Promise<Inbox> {
  const now = new Date();
  const errors: string[] = [];
  projects ??= listProdProjects().catch((cause) => {
    projects = null;
    throw cause;
  });
  const prod = await projects;
  const projectIds = prod.map((project) => project.id);
  const idOf = (slug: string) => prod.find((project) => project.slug === slug)?.id;

  const [issues, feRelease, beRelease, releases, hourly] = await Promise.all([
    listIssues(projectIds),
    releaseOf(idOf(FE_PROJECT)),
    releaseOf(idOf(BE_PROJECT)),
    releasesFor(idOf(FE_PROJECT), idOf(BE_PROJECT), new Date(now.getTime() - 14 * DAY_MS).toISOString()),
    hourlyTotals(projectIds),
  ]);
  const deploy = [feRelease, beRelease].filter((release) => release !== null).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  if (!deploy) errors.push("No release found; showing last 24h");
  const rangeStart = rangeStartOf(range, deploy, now);

  const [facts, hourly24, rulesFile, triage] = await Promise.all([
    factsFor(issues),
    stats24h(issues.map((issue) => issue.id)),
    readRules(),
    readTriage(),
  ]);
  if (rulesFile.fileError) errors.push(`rules.json can't be parsed (${rulesFile.fileError}): no rules applied`);

  const rpKeys = [...rulesFile.rules.flatMap((rule) => (rule.rp ? [rule.rp] : [])), ...Object.values(triage).flatMap((entry) => (entry.rp ? [entry.rp] : []))];
  const tickets = await fetchTickets(rpKeys).catch((cause): Map<string, Ticket> => {
    errors.push(cause instanceof Error ? cause.message : String(cause));
    return new Map();
  });

  const { rows, ruleHits } = classifyIssues({
    issues,
    facts,
    hourly24,
    rules: rulesFile.rules,
    triage,
    tickets,
    currentRelease: { FE: feRelease?.version ?? null, BE: beRelease?.version ?? null },
    releases,
    rangeStart,
    now: now.toISOString(),
  });

  await Promise.all(
    rows
      .filter((row) => row.bucket !== "hidden")
      .map(async (row) => {
        const frame = facts.get(row.id)?.find((fact) => fact.topFrame)?.topFrame;
        const owner = frame ? await ownerOf(frame.path, frame.line) : null;
        if (owner) row.owner = owner;
      }),
  );

  return {
    rows,
    graphs: buildGraphs({ rows, hourly, hourly24, releases, deployAt: deploy?.at ?? null, now: now.toISOString() }),
    deploy,
    rangeStart,
    rules: rulesFile.rules.map((rule) => {
      const hits = ruleHits.get(rule.id) ?? 0;
      return { rule, hits, dead: hits === 0 && now.getTime() - Date.parse(rule.createdAt) > DEAD_RULE_MS };
    }),
    invalidRules: rulesFile.invalid,
    errors,
    staleSince: null,
    fetchedAt: now.toISOString(),
  };
}

function rangeStartOf(range: Range, deploy: Release | null, now: Date): string {
  const hoursBack = { deploy: 24, "24h": 24, "7d": 7 * 24, "14d": 14 * 24 }[range];
  if (range === "deploy" && deploy) return deploy.at;
  return new Date(now.getTime() - hoursBack * 3600 * 1000).toISOString();
}

const releaseOf = (projectId: string | undefined) => (projectId ? latestRelease(projectId) : Promise.resolve(null));

async function releasesFor(feId: string | undefined, beId: string | undefined, since: string) {
  const [fe, be] = await Promise.all([
    feId ? releasesSince([feId], since) : [],
    beId ? releasesSince([beId], since) : [],
  ]);
  return [...fe.map((release) => ({ ...release, side: "FE" as const })), ...be.map((release) => ({ ...release, side: "BE" as const }))];
}

/** Sampled facts per issue; an issue whose lastSeen hasn't moved reuses its cached sample without an API call. */
async function factsFor(issues: SentryIssue[]): Promise<Map<string, EventFacts[]>> {
  const result = new Map<string, EventFacts[]>();
  const queue = [...issues];
  const worker = async () => {
    for (let issue = queue.shift(); issue; issue = queue.shift()) {
      const cached = await readCachedFacts(issue.id);
      if (cached?.lastSeen === issue.lastSeen) {
        result.set(issue.id, cached.facts);
        continue;
      }
      const events = await latestEvents(issue.id);
      const facts = events.map((event) => extractFacts(event, issue.id, issue.project.slug));
      await writeCachedFacts(issue.id, issue.lastSeen, facts);
      result.set(issue.id, facts);
    }
  };
  await Promise.all(Array.from({ length: EVENTS_CONCURRENCY }, worker));
  return result;
}

async function stats24h(ids: string[]): Promise<Map<string, number[]>> {
  const batches = Array.from({ length: Math.ceil(ids.length / STATS_BATCH) }, (_, index) => ids.slice(index * STATS_BATCH, (index + 1) * STATS_BATCH));
  const maps = await Promise.all(batches.map(issueStats24h));
  return new Map(maps.flatMap((map) => [...map]));
}
