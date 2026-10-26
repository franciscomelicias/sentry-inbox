import type { EventFacts, Graphs, Inbox, Range, Stage } from "../shared/model";
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
  listProjects,
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
const feProject = (stage: Stage) => `roger-frontend-${stage}`;
const beProject = (stage: Stage) => `roger-customer-api-${stage}`;

/** What Sentry returned; rules, triage and the range are applied on every load, so a new rule shows at once. */
type SentryData = {
  fetchedAt: string;
  issues: SentryIssue[];
  facts: Map<string, EventFacts[]>;
  hourly24: Map<string, number[]>;
  projectIds: string[];
  fe: Release[];
  be: Release[];
  errors: string[];
};

const latest = new Map<Stage, { at: number; data: Promise<SentryData> }>();
const latestHourly = new Map<Stage, { at: number; hourly: Promise<{ at: string; count: number }[]> }>();
const projects = new Map<Stage, Promise<{ slug: string; id: string }[]>>();

export async function getInbox({ stage, range, force }: { stage: Stage; range: Range; force: boolean }): Promise<Inbox> {
  try {
    const inbox = await assemble(await loadSentry(stage, force), range);
    await writeInboxCache(stage, inbox);
    return inbox;
  } catch (cause) {
    // A bad token must be fixed, not hidden behind old data.
    if (cause instanceof SentryAuthError) throw cause;
    const stale = await readInboxCache(stage);
    if (!stale) throw cause;
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ...stale, staleSince: stale.staleSince ?? stale.fetchedAt, errors: [...stale.errors.filter((error) => error !== message), message] };
  }
}

/** One Sentry fetch shared by every load within FRESH_MS, including concurrent ones. */
function loadSentry(stage: Stage, force: boolean): Promise<SentryData> {
  const cached = latest.get(stage);
  if (!force && cached && Date.now() - cached.at < FRESH_MS) return cached.data;
  const data = fetchSentry(stage);
  latest.set(stage, { at: Date.now(), data });
  data.catch(() => {
    if (latest.get(stage)?.data === data) latest.delete(stage);
  });
  return data;
}

async function fetchSentry(stage: Stage): Promise<SentryData> {
  if (!projects.has(stage)) {
    projects.set(
      stage,
      listProjects(stage).catch((cause) => {
        projects.delete(stage);
        throw cause;
      }),
    );
  }
  const stageProjects = await projects.get(stage)!;
  const projectIds = stageProjects.map((project) => project.id);
  const releasesOf = (slug: string) => {
    const id = stageProjects.find((project) => project.slug === slug)?.id;
    return id ? listDeployedReleases(id, stage) : Promise.resolve([]);
  };
  const [issues, fe, be] = await Promise.all([listIssues(projectIds, stage), releasesOf(feProject(stage)), releasesOf(beProject(stage))]);
  const [{ facts, failed }, hourly24] = await Promise.all([factsFor(issues, stage), stats24h(issues.map((issue) => issue.id), projectIds, stage)]);
  const errors = failed > 0 ? [`${failed} issue(s) without fresh events (Sentry errors or rate limit): realms, links and stale-FE use older or no samples for them`] : [];
  return { fetchedAt: new Date().toISOString(), issues, facts, hourly24, projectIds, fe, be, errors };
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

  return {
    rows,
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

export async function getGraphs({ stage, range }: { stage: Stage; range: Range }): Promise<Graphs> {
  const data = await loadSentry(stage, false);
  const [inbox, hourly] = await Promise.all([assemble(data, range), loadHourly(data.projectIds, stage)]);
  const since = new Date(Date.now() - 14 * DAY_MS).toISOString();
  // FE and BE ship the same version numbers: one marker per version, at its first prod event.
  const markers = new Map([...data.fe, ...data.be].filter((release) => release.at >= since).sort((a, b) => b.at.localeCompare(a.at)).map((release) => [release.version, release]));
  return buildGraphs({
    rows: inbox.rows,
    hourly,
    hourly24: data.hourly24,
    releases: [...markers.values()].sort((a, b) => a.at.localeCompare(b.at)),
    deployAt: inbox.deploy?.at ?? null,
    now: new Date().toISOString(),
  });
}

function loadHourly(projectIds: string[], stage: Stage) {
  const cached = latestHourly.get(stage);
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.hourly;
  const hourly = hourlyTotals(projectIds, stage);
  latestHourly.set(stage, { at: Date.now(), hourly });
  hourly.catch(() => {
    latestHourly.delete(stage);
  });
  return hourly;
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
async function factsFor(issues: SentryIssue[], stage: Stage): Promise<{ facts: Map<string, EventFacts[]>; failed: number }> {
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
      const sampled = (await latestEvents(issue.id, stage)).map((event) => extractFacts(event, issue.id, issue.project.slug));
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

async function stats24h(ids: string[], projectIds: string[], stage: Stage): Promise<Map<string, number[]>> {
  const batches = Array.from({ length: Math.ceil(ids.length / STATS_BATCH) }, (_, index) => ids.slice(index * STATS_BATCH, (index + 1) * STATS_BATCH));
  const maps = await Promise.all(batches.map((batch) => issueStats24h(batch, projectIds, stage)));
  return new Map(maps.flatMap((map) => [...map]));
}

async function inPool<T>(items: T[], size: number, task: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  };
  await Promise.all(Array.from({ length: size }, worker));
}
