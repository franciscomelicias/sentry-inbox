import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Stage } from "../shared/model";
import type { SentryEvent } from "./facts";

const execFileAsync = promisify(execFile);

const API = "https://de.sentry.io/api/0";
const ORG = "rogerhr";
const DEFAULT_RETRY_AFTER_S = 60;
/** The `-dev` projects report to three environments; dev reads them all at once. */
const ENVIRONMENTS: Record<Stage, string[]> = { prod: ["prod"], dev: ["staging", "test", "preprod"] };

export class SentryAuthError extends Error {
  constructor() {
    super(
      'Sentry token missing or invalid: set SENTRY_AUTH_TOKEN or Keychain item "sentry-inbox" (account "token"), scopes org:read project:read event:read',
    );
  }
}

export class SentryRateLimitError extends Error {}

/** The subset of a Sentry issue (organization issues endpoint) this plugin reads. */
export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string;
  permalink: string;
  firstSeen: string;
  lastSeen: string;
  count: string;
  userCount: number;
  substatus?: string | null;
  project: { id: string; slug: string };
  metadata?: { type?: string; value?: string };
  stats?: Record<string, [number, number][]>;
  /** External links; Sentry's Jira integration adds one per linked ticket. */
  annotations?: { url: string; displayName: string }[];
};

export type Release = { version: string; at: string };

let token: string | undefined;
let blockedUntil = 0;

/** Remembered only once found, so a token added later is picked up without a plugin reload. */
export async function getToken(): Promise<string | null> {
  if (token) return token;
  const found =
    process.env.SENTRY_AUTH_TOKEN ||
    (await execFileAsync("security", ["find-generic-password", "-s", process.env.SENTRY_INBOX_KEYCHAIN_SERVICE ?? "sentry-inbox", "-a", "token", "-w"], { timeout: 5_000 })
      .then(({ stdout }) => stdout.trim())
      .catch(() => ""));
  token = found || undefined;
  return token ?? null;
}

async function request(path: string, params: Record<string, string | string[]> = {}): Promise<Response> {
  if (process.env.SENTRY_INBOX_FAKE_429) blockedUntil = Date.now() + DEFAULT_RETRY_AFTER_S * 1000;
  if (Date.now() < blockedUntil) throw new SentryRateLimitError(`Sentry rate limit, retry after ${new Date(blockedUntil).toLocaleTimeString()}`);
  const auth = await getToken();
  if (!auth) throw new SentryAuthError();
  const url = new URL(path.startsWith("http") ? path : `${API}${path}`);
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item);
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${auth}` } });
  if (response.status === 401 || response.status === 403) {
    token = undefined;
    throw new SentryAuthError();
  }
  if (response.status === 429) {
    // Sentry sends the reset as epoch seconds; Retry-After is not always there.
    const reset = Number(response.headers.get("x-sentry-rate-limit-reset")) * 1000;
    const retryAfter = Number(response.headers.get("retry-after") ?? DEFAULT_RETRY_AFTER_S) * 1000;
    blockedUntil = reset > Date.now() ? reset : Date.now() + retryAfter;
    throw new SentryRateLimitError("Sentry rate limit");
  }
  if (!response.ok) throw new Error(`Sentry ${response.status} on ${url.pathname}`);
  return response;
}

export async function sentryGet<T>(path: string, params?: Record<string, string | string[]>): Promise<T> {
  return (await (await request(path, params)).json()) as T;
}

/** Follows Sentry's `Link: <…>; rel="next"; results="true"` pagination up to `maxPages`. */
async function sentryPages<T>(path: string, params: Record<string, string | string[]>, maxPages: number): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = path;
  for (let page = 0; next && page < maxPages; page++) {
    const response = await request(next, page === 0 ? params : {});
    items.push(...((await response.json()) as T[]));
    const link = response.headers.get("link") ?? "";
    next = /<([^>]+)>;\s*rel="next";\s*results="true"/.exec(link)?.[1] ?? null;
  }
  return items;
}

export async function listProjects(stage: Stage): Promise<{ slug: string; id: string }[]> {
  const projects = await sentryPages<{ slug: string; id: string }>(`/organizations/${ORG}/projects/`, {}, 5);
  return projects.filter((project) => project.slug.endsWith(`-${stage}`)).map(({ slug, id }) => ({ slug, id }));
}

export function listIssues(projectIds: string[], stage: Stage): Promise<SentryIssue[]> {
  return sentryPages<SentryIssue>(
    `/organizations/${ORG}/issues/`,
    {
      project: projectIds,
      query: "is:unresolved",
      environment: ENVIRONMENTS[stage],
      statsPeriod: "14d",
      groupStatsPeriod: "14d",
      sort: "date",
      limit: "100",
    },
    2,
  );
}

/** Hourly counts for the last 24h, oldest first. */
export async function issueStats24h(ids: string[], projectIds: string[], stage: Stage): Promise<Map<string, number[]>> {
  if (ids.length === 0) return new Map();
  const stats = await sentryGet<SentryIssue[]>(`/organizations/${ORG}/issues-stats/`, {
    groups: ids,
    // Without project, Sentry keeps only issues of projects the token's user is a member of.
    project: projectIds,
    statsPeriod: "24h",
    groupStatsPeriod: "24h",
    environment: ENVIRONMENTS[stage],
  });
  return new Map(stats.map((issue) => [issue.id, (issue.stats?.["24h"] ?? []).map(([, count]) => count)]));
}

export type SentryRelease = { version: string; dateCreated: string; firstEvent?: string | null };

/**
 * Releases that reached prod, oldest first, dated by their first prod event. Our CI creates the FE release record when
 * it prepares a release (sourcemaps upload) and never reports deploys, so dateCreated is not when prod switched.
 * ponytail: a deploy with no error at all stays invisible; upgrade with `sentry-cli deploys new -e prod` in deploy.yml.
 */
export function deployedReleases(releases: SentryRelease[]): Release[] {
  return releases
    .filter((release): release is SentryRelease & { firstEvent: string } => Boolean(release.firstEvent))
    .map((release) => ({ version: release.version, at: release.firstEvent }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export async function listDeployedReleases(projectId: string, stage: Stage): Promise<Release[]> {
  const releases = await sentryGet<SentryRelease[]>(`/organizations/${ORG}/releases/`, {
    project: projectId,
    environment: ENVIRONMENTS[stage],
    per_page: "25",
    sort: "date",
  });
  return deployedReleases(releases);
}

export function latestEvents(issueId: string, stage: Stage, limit = 20): Promise<SentryEvent[]> {
  return sentryGet<SentryEvent[]>(`/organizations/${ORG}/issues/${issueId}/events/`, {
    full: "true",
    per_page: String(limit),
    environment: ENVIRONMENTS[stage],
  });
}

/** Hourly error counts over 7 days across the given projects, oldest first. */
export async function hourlyTotals(projectIds: string[], stage: Stage): Promise<{ at: string; count: number }[]> {
  const stats = await sentryGet<{ data: [number, { count: number }[]][] }>(`/organizations/${ORG}/events-stats/`, {
    project: projectIds,
    interval: "1h",
    statsPeriod: "7d",
    query: "event.type:error",
    environment: ENVIRONMENTS[stage],
  });
  return stats.data.map(([seconds, counts]) => ({
    at: new Date(seconds * 1000).toISOString(),
    count: counts.reduce((sum, item) => sum + item.count, 0),
  }));
}
