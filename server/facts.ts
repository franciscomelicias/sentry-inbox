import type { EventFacts } from "../shared/model";

type Frame = {
  module?: string | null;
  filename?: string | null;
  absPath?: string | null;
  lineNo?: number | null;
  inApp?: boolean | null;
};

/** The subset of a Sentry event (`/issues/<id>/events/?full=true`) this plugin reads. */
export type SentryEvent = {
  eventID: string;
  dateCreated: string;
  tags?: { key: string; value: string }[];
  contexts?: Record<string, Record<string, unknown> | undefined>;
  entries?: { type: string; data?: { values?: unknown[] } }[];
};

export const isFrontendProject = (project: string) => project.includes("frontend");

export function extractFacts(event: SentryEvent, issueId: string, project: string): EventFacts {
  const contexts = event.contexts ?? {};
  const release = event.tags?.find((tag) => tag.key === "release")?.value ?? null;
  const frontend = isFrontendProject(project);
  return {
    eventId: event.eventID,
    issueId,
    project,
    release,
    // BE contexts come from SentryConfiguration.java; FE ones from roger-frontend's api error capture.
    realm: text(contexts["Realm"]?.Name) ?? text(contexts["realm"]?.name),
    feVersion: frontend ? release : text(contexts["Request Info"]?.FrontendVersion),
    requestId: frontend
      ? (text(contexts["api_request"]?.id) ?? lastApiRequestUuid(event))
      : text(contexts["Request Info"]?.RequestId),
    topFrame: topFrame(event),
    timestamp: event.dateCreated,
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function entryValues(event: SentryEvent, type: string): unknown[] {
  return event.entries?.find((entry) => entry.type === type)?.data?.values ?? [];
}

function lastApiRequestUuid(event: SentryEvent): string | null {
  const crumbs = entryValues(event, "breadcrumbs") as { category?: string; data?: { requestUuid?: unknown } }[];
  const api = crumbs.filter((crumb) => crumb.category === "api");
  return text(api.at(-1)?.data?.requestUuid);
}

/** Sentry lists frames outermost first, so the last in-app frame is where the error was thrown. */
function topFrame(event: SentryEvent): EventFacts["topFrame"] {
  const exception = entryValues(event, "exception")[0] as { stacktrace?: { frames?: Frame[] } } | undefined;
  const frame = exception?.stacktrace?.frames?.filter((candidate) => candidate.inApp).at(-1);
  if (!frame) return null;
  const path = framePath(frame);
  return path ? { path, line: frame.lineNo ?? 0 } : null;
}

function framePath(frame: Frame): string | null {
  const filename = frame.filename ?? frame.absPath ?? null;
  // JVM frames only carry the bare file name; the module gives the package path.
  if (frame.module && filename && /\.(java|kt)$/.test(filename)) {
    return `${frame.module.split("$")[0].replaceAll(".", "/")}${filename.slice(filename.lastIndexOf("."))}`;
  }
  return filename?.replace(/^\.\//, "") ?? null;
}
