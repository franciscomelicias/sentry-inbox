import { z } from "zod";

export const RULE_KINDS = ["known", "ugly", "hidden", "snooze"] as const;

export const ruleMatchSchema = z.object({
  issueId: z.string().optional(),
  project: z.string().optional(),
  type: z.string().optional(),
  messageRegex: z.string().optional(),
  culprit: z.string().optional(),
  realm: z.array(z.string()).optional(),
});

export const ruleInputSchema = z.object({
  kind: z.enum(RULE_KINDS),
  match: ruleMatchSchema,
  reason: z.string(),
  rp: z.string().optional(),
  until: z
    .object({
      date: z.string().optional(),
      release: z.string().optional(),
      eventsPerDayAbove: z.number().optional(),
    })
    .optional(),
});

export const ruleSchema = ruleInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  createdBy: z.enum(["screen", "lead"]),
});

export type RuleInput = z.infer<typeof ruleInputSchema>;
export type Rule = z.infer<typeof ruleSchema>;

export const triageEntrySchema = z.object({
  verdict: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  reproSteps: z.array(z.string()).optional(),
  fixedIn: z.string().optional(),
  rp: z.string().optional(),
  investigatedAt: z.string().optional(),
});

export type TriageEntry = z.infer<typeof triageEntrySchema>;
export type Triage = Record<string, TriageEntry>;

export type EventFacts = {
  eventId: string;
  issueId: string;
  project: string;
  release: string | null;
  feVersion: string | null;
  realm: string | null;
  requestId: string | null;
  topFrame: { path: string; line: number } | null;
  timestamp: string;
};

export const SIDES = ["FE", "BE", "MCP", "INT"] as const;
export type Side = (typeof SIDES)[number];

export const ORIGINS = ["browser", "script", "mixed"] as const;
export type Origin = (typeof ORIGINS)[number];

export const STATES = ["new", "regressed", "spiking", "ongoing"] as const;
export type IssueState = (typeof STATES)[number];
export const BUCKETS = [...STATES, "ugly", "fixFailed", "hidden"] as const;
export type Bucket = (typeof BUCKETS)[number];
export const HIDDEN_REASONS = ["known", "hidden", "snooze", "staleFe", "foldedIntoBe"] as const;
export type HiddenReason = (typeof HIDDEN_REASONS)[number];

const linkSchema = z.object({
  issueId: z.string(),
  shortId: z.string(),
  title: z.string(),
  permalink: z.string(),
  /** Request ids (ROGERHR-REQUEST-ID) seen on both sides: the proof of the link. */
  requestIds: z.array(z.string()),
  matched: z.number(),
  sampled: z.number(),
});

export const issueRowSchema = z.object({
  id: z.string(),
  shortId: z.string(),
  title: z.string(),
  type: z.string(),
  culprit: z.string(),
  project: z.string(),
  side: z.enum(SIDES),
  area: z.string(),
  permalink: z.string(),
  firstSeen: z.string(),
  lastSeen: z.string(),
  firstRelease: z.string().nullable(),
  lastRelease: z.string().nullable(),
  isCurrentRelease: z.boolean(),
  count: z.number(),
  userCount: z.number(),
  daily: z.array(z.number()),
  bucket: z.enum(BUCKETS),
  hiddenReason: z.enum(HIDDEN_REASONS).optional(),
  ruleId: z.string().optional(),
  spikingKnown: z.boolean(),
  realms: z.array(z.object({ name: z.string(), events: z.number(), users: z.number() })),
  links: z.array(linkSchema),
  rp: z.object({ key: z.string(), status: z.string(), done: z.boolean() }).optional(),
  triage: triageEntrySchema.optional(),
  owner: z.string().optional(),
  /** customer-api only: browser when the sampled events carry our FE's version header, script when none does. */
  origin: z.enum(ORIGINS).optional(),
  /** "path:line" of our code where it was thrown, from the sampled events. */
  topFrame: z.string().optional(),
});

export type IssueRow = z.infer<typeof issueRowSchema>;

export const graphsSchema = z.object({
  headline: z.object({ eventsPerHourNow: z.number(), eventsPerHourBefore: z.number() }),
  hourly: z.array(z.object({ at: z.string(), count: z.number() })),
  releases: z.array(z.object({ version: z.string(), at: z.string() })),
  perArea: z.array(z.object({ area: z.string(), before: z.number(), after: z.number(), unit: z.enum(["hour", "day"]) })),
  dayLabels: z.array(z.string()),
});

export type Graphs = z.infer<typeof graphsSchema>;

export const RANGES = ["deploy", "24h", "7d", "14d"] as const;
export type Range = (typeof RANGES)[number];

export const inboxSchema = z.object({
  rows: z.array(issueRowSchema),
  deploy: z.object({ version: z.string(), at: z.string() }).nullable(),
  rangeStart: z.string(),
  rules: z.array(z.object({ rule: ruleSchema, hits: z.number(), dead: z.boolean() })),
  invalidRules: z.array(z.string()),
  errors: z.array(z.string()),
  staleSince: z.string().nullable(),
  fetchedAt: z.string(),
});

export type Inbox = z.infer<typeof inboxSchema>;

export const filtersSchema = z.object({
  sides: z.array(z.enum(SIDES)),
  areas: z.array(z.string()),
  projects: z.array(z.string()).default([]),
  release: z.enum(["current", "older", "any"]),
  origin: z.enum(["any", "browser", "script"]).default("any"),
  ticket: z.enum(["any", "hasRp", "noRp", "rpDone"]),
  minUsers: z.number(),
  minEvents: z.number(),
  text: z.string(),
  cell: z.object({ issueId: z.string(), day: z.number() }).nullable(),
});

export type Filters = z.infer<typeof filtersSchema>;

export const DEFAULT_FILTERS: Filters = {
  sides: [],
  areas: [],
  projects: [],
  release: "any",
  origin: "any",
  ticket: "any",
  minUsers: 0,
  minEvents: 0,
  text: "",
  cell: null,
};

export const prefsSchema = z.object({
  range: z.enum(RANGES),
  tab: z.enum(BUCKETS),
  filters: filtersSchema,
  savedViews: z.array(z.object({ name: z.string(), filters: filtersSchema, range: z.enum(RANGES).optional() })),
});

export type Prefs = z.infer<typeof prefsSchema>;
