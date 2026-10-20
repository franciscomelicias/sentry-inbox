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
  listDeployedReleases,
  listIssues,
  listProdProjects,
  SentryAuthError,
  SentryRateLimitError,
  type Release,
  type SentryIssue,
} from "./sentry";
import { readCachedFacts, readInboxCache, readRules, readTriage, writeCachedFacts, writeInboxCache } from "./store";

const FRESH_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const DEAD_RULE_MS = 30 * DAY_MS;
// Sentry's issue-events endpoint is rate limited per user: stay well under it.
const EVENTS_CONCURRENCY = 2;
const OWNER_CONCURRENCY = 8;
const STATS_BATCH = 100;
const FE_PROJECT = "roger-frontend-prod";
const BE_PROJECT = "roger-customer-api-prod";

/** What Sentry returned; rules, triage and the range are applied on every load, so a new rule shows at once. */
type SentryData = {
  fetchedAt: string;
  issues: SentryIssue[];
  facts: Map<string, EventFacts[]>;
  hourly24: Map<string, number[]>;
  hourly: { at: string; count: number }[];
  fe: Release[];
  be: Release[];
  errors: string[];
};

let latest: { at: number; data: Promise<SentryData> } | null = null;
let projects: Promise<{ slug: string; id: string }[]> | null = null;

export async function getInbox({ range, force }: { range: Range; force: boolean }): Promise<Inbox> {
  try {
    const inbox = await assemble(await loadSentry(force), range);
    await writeInboxCache(inbox);
    return inbox;
  } catch (cause) {
    // A bad token must be fixed, not hidden behind old data.
    if (cause instanceof SentryAuthError) throw cause;
    const stale = await readInboxCache();
    if (!stale) throw cause;
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ...stale, staleSince: stale.staleSince ?? stale.fetchedAt, errors: [...stale.errors.filter((error) => error !== message), message] };
  }
}

/** One Sentry fetch shared by every load within FRESH_MS, including concurrent ones. */
function loadSentry(force: boolean): Promise<SentryData> {
  if (!force && latest && Date.now() - latest.at < FRESH_MS) return latest.data;
  const data = fetchSentry();
  latest = { at: Date.now(), data };
  data.catch(() => {
    if (latest?.data === data) latest = null;
  });
  return data;
}

async function fetchSentry(): Promise<SentryData> {
  projects ??= listProdProjects().catch((cause) => {
    projects = null;
    throw cause;
  });
  const prod = await projects;
  const projectIds = prod.map((project) => project.id);
  const releasesOf = (slug: string) => {
    const id = prod.find((project) => project.slug === slug)?.id;
    return id ? listDeployedReleases(id) : Promise.resolve([]);
  };
  const [issues, fe, be, hourly] = await Promise.all([listIssues(projectIds), releasesOf(FE_PROJECT), releasesOf(BE_PROJECT), hourlyTotals(projectIds)]);
  const [{ facts, failed }, hourly24] = await Promise.all([factsFor(issues), stats24h(issues.map((issue) => issue.id), projectIds)]);
  const errors = failed > 0 ? [`${failed} issue(s) without fresh events (Sentry errors or rate limit): realms, links and stale-FE use older or no samples for them`] : [];
  return { fetchedAt: new Date().toISOString(), issues, facts, hourly24, hourly, fe, be, errors };
}

async function assemble(data: SentryData, range: Range): Promise<Inbox> {
  const now = new Date();
  const errors = [...data.errors];
  const currentFe = data.fe.at(-1) ?? null;
  const currentBe = data.be.at(-1) ?? null;
  const deploy = [currentFe, currentBe].filter((release) => release !== null).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  if (!deploy && range === "deploy") errors.push("No deployed release found; showing last 24h");
  const rangeStart = rangeStartOf(range, deploy, now);

  const [rulesFile, triage] = await Promise.all([readRules(), readTriage()]);
  if (rulesFile.fileError) errors.push(`rules.json can't be parsed (${rulesFile.fileError}): no rules applied`);
  const rpKeys = [...rulesFile.rules.flatMap((rule) => (rule.rp ? [rule.rp] : [])), ...Object.values(triage).flatMap((entry) => (entry.rp ? [entry.rp] : []))];
  const tickets = await fetchTickets(rpKeys).catch((cause): Map<string, Ticket> => {
    errors.push(cause instanceof Error ? cause.message : String(cause));
    return new Map();
  });

  const since = new Date(now.getTime() - 14 * DAY_MS).toISOString();
  const releases = [...data.fe.map((release) => ({ ...release, side: "FE" as const })), ...data.be.map((release) => ({ ...release, side: "BE" as const }))];
  const { rows, ruleHits } = classifyIssues({
    issues: data.issues,
    facts: data.facts,
    hourly24: data.hourly24,
    rules: rulesFile.rules,
    triage,
    tickets,
    currentRelease: { FE: currentFe, BE: currentBe },
    releases,
    rangeStart,
    now: now.toISOString(),
  });

  await inPool(
    rows.filter((row) => row.bucket !== "hidden"),
    OWNER_CONCURRENCY,
    async (row) => {
      const frame = data.facts.get(row.id)?.find((fact) => fact.topFrame)?.topFrame;
      const owner = frame ? await ownerOf(frame.path, frame.line) : null;
      if (owner) row.owner = owner;
    },
  );

  // FE and BE ship the same version numbers: one marker per version, at its first prod event.
  const markers = [...new Map(releases.filter((release) => release.at >= since).sort((a, b) => b.at.localeCompare(a.at)).map((release) => [release.version, { version: release.version, at: release.at }])).values()].sort((a, b) => a.at.localeCompare(b.at));

  return {
    rows,
    graphs: buildGraphs({ rows, hourly: data.hourly, hourly24: data.hourly24, releases: markers, deployAt: deploy?.at ?? null, now: now.toISOString() }),
    deploy,
    rangeStart,
    rules: rulesFile.rules.map((rule) => {
      const hits = ruleHits.get(rule.id) ?? 0;
      return { rule, hits, dead: hits === 0 && now.getTime() - Date.parse(rule.createdAt) > DEAD_RULE_MS };
    }),
    invalidRules: rulesFile.invalid,
    errors,
    staleSince: null,
    fetchedAt: data.fetchedAt,
  };
}

function rangeStartOf(range: Range, deploy: Release | null, now: Date): string {
  const hoursBack = { deploy: 24, "24h": 24, "7d": 7 * 24, "14d": 14 * 24 }[range];
  if (range === "deploy" && deploy) return deploy.at;
  return new Date(now.getTime() - hoursBack * 3600 * 1000).toISOString();
}

/**
 * Sampled facts per issue; an issue whose lastSeen hasn't moved reuses its cached sample without an API call.
 * A failed fetch keeps the older sample (or none) instead of failing the inbox; a rate limit stops further fetches.
 */
async function factsFor(issues: SentryIssue[]): Promise<{ facts: Map<string, EventFacts[]>; failed: number }> {
  const facts = new Map<string, EventFacts[]>();
  let failed = 0;
  let rateLimited = false;
  await inPool(issues, EVENTS_CONCURRENCY, async (issue) => {
    const cached = await readCachedFacts(issue.id);
    if (cached?.lastSeen === issue.lastSeen) {
      facts.set(issue.id, cached.facts);
      return;
    }
    try {
      if (rateLimited) throw new SentryRateLimitError("skipped after a rate limit");
      const sampled = (await latestEvents(issue.id)).map((event) => extractFacts(event, issue.id, issue.project.slug));
      await writeCachedFacts(issue.id, issue.lastSeen, sampled);
      facts.set(issue.id, sampled);
    } catch (cause) {
      if (cause instanceof SentryAuthError) throw cause;
      if (cause instanceof SentryRateLimitError) rateLimited = true;
      failed++;
      facts.set(issue.id, cached?.facts ?? []);
    }
  });
  return { facts, failed };
}

async function stats24h(ids: string[], projectIds: string[]): Promise<Map<string, number[]>> {
  const batches = Array.from({ length: Math.ceil(ids.length / STATS_BATCH) }, (_, index) => ids.slice(index * STATS_BATCH, (index + 1) * STATS_BATCH));
  const maps = await Promise.all(batches.map((batch) => issueStats24h(batch, projectIds)));
  return new Map(maps.flatMap((map) => [...map]));
}

async function inPool<T>(items: T[], size: number, task: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  };
  await Promise.all(Array.from({ length: size }, worker));
}
