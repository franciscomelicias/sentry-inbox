import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SentryEvent } from "./facts";

const execFileAsync = promisify(execFile);

const API = "https://de.sentry.io/api/0";
const ORG = "rogerhr";
const DEFAULT_RETRY_AFTER_S = 60;

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
};

export type Release = { version: string; at: string };

let token: string | null | undefined;
let blockedUntil = 0;

export async function getToken(): Promise<string | null> {
  if (token !== undefined) return token;
  token =
    process.env.SENTRY_AUTH_TOKEN ||
    (await execFileAsync("security", ["find-generic-password", "-s", "sentry-inbox", "-a", "token", "-w"], { timeout: 5_000 })
      .then(({ stdout }) => stdout.trim() || null)
      .catch(() => null));
  return token;
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
    blockedUntil = Date.now() + Number(response.headers.get("retry-after") ?? DEFAULT_RETRY_AFTER_S) * 1000;
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

export async function listProdProjects(): Promise<{ slug: string; id: string }[]> {
  const projects = await sentryPages<{ slug: string; id: string }>(`/organizations/${ORG}/projects/`, {}, 5);
  return projects.filter((project) => project.slug.endsWith("-prod")).map(({ slug, id }) => ({ slug, id }));
}

export function listIssues(projectIds: string[]): Promise<SentryIssue[]> {
  return sentryPages<SentryIssue>(
    `/organizations/${ORG}/issues/`,
    {
      project: projectIds,
      query: "is:unresolved",
      environment: "prod",
      statsPeriod: "14d",
      groupStatsPeriod: "14d",
      sort: "date",
      limit: "100",
    },
    2,
  );
}

/** Hourly counts for the last 24h, oldest first. */
export async function issueStats24h(ids: string[]): Promise<Map<string, number[]>> {
  if (ids.length === 0) return new Map();
  const stats = await sentryGet<SentryIssue[]>(`/organizations/${ORG}/issues-stats/`, {
    groups: ids,
    statsPeriod: "24h",
    groupStatsPeriod: "24h",
    environment: "prod",
  });
  return new Map(stats.map((issue) => [issue.id, (issue.stats?.["24h"] ?? []).map(([, count]) => count)]));
}

type SentryRelease = { version: string; dateCreated: string; dateReleased?: string | null; lastDeploy?: { dateFinished?: string } | null };

const releaseOf = (release: SentryRelease): Release => ({
  version: release.version,
  at: release.lastDeploy?.dateFinished ?? release.dateReleased ?? release.dateCreated,
});

export async function latestRelease(projectId: string): Promise<Release | null> {
  const [release] = await sentryGet<SentryRelease[]>(`/organizations/${ORG}/releases/`, {
    project: projectId,
    per_page: "1",
    sort: "date",
  });
  return release ? releaseOf(release) : null;
}

export async function releasesSince(projectIds: string[], since: string): Promise<Release[]> {
  const releases = await sentryGet<SentryRelease[]>(`/organizations/${ORG}/releases/`, {
    project: projectIds,
    per_page: "25",
    sort: "date",
  });
  const unique = new Map(releases.map(releaseOf).filter((release) => release.at >= since).map((release) => [release.version, release]));
  return [...unique.values()].sort((a, b) => a.at.localeCompare(b.at));
}

export function latestEvents(issueId: string, limit = 20): Promise<SentryEvent[]> {
  return sentryGet<SentryEvent[]>(`/organizations/${ORG}/issues/${issueId}/events/`, {
    full: "true",
    per_page: String(limit),
    environment: "prod",
  });
}

/** Hourly error counts over 7 days across the given projects, oldest first. */
export async function hourlyTotals(projectIds: string[]): Promise<{ at: string; count: number }[]> {
  const stats = await sentryGet<{ data: [number, { count: number }[]][] }>(`/organizations/${ORG}/events-stats/`, {
    project: projectIds,
    interval: "1h",
    statsPeriod: "7d",
    query: "event.type:error",
    environment: "prod",
  });
  return stats.data.map(([seconds, counts]) => ({
    at: new Date(seconds * 1000).toISOString(),
    count: counts.reduce((sum, item) => sum + item.count, 0),
  }));
}
