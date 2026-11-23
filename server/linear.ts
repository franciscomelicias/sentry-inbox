import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// A Linear personal API key (read is enough): LINEAR_API_KEY in the Paseo daemon's environment, or a Keychain item
// (LINEAR_KEYCHAIN_SERVICE, default "sentry-inbox", account "linear").
const LINEAR_API = "https://api.linear.app/graphql";
export const TICKET_KEY = /^ROG-\d+$/i;

export type Ticket = { status: string; done: boolean; releases: { name: string; released: boolean }[] };

export class LinearCredentialsMissingError extends Error {
  constructor() {
    super("Linear API key missing (LINEAR_API_KEY or Keychain): ticket statuses and \"fix didn't work\" are off");
  }
}

const run = async (file: string, args: string[]) => (await execFileAsync(file, args, { timeout: 15_000 })).stdout.trim();

const apiKey = () => {
  if (process.env.LINEAR_API_KEY) return Promise.resolve(process.env.LINEAR_API_KEY);
  const service = process.env.LINEAR_KEYCHAIN_SERVICE ?? "sentry-inbox";
  return run("security", ["find-generic-password", "-a", "linear", "-s", service, "-w"]).catch(() => "");
};

// `id: { in }` takes identifiers and skips unknown ones (typo, deleted ticket): one request, no retry.
// Done tickets get archived after a while, hence includeArchived.
// ponytail: one page of 250 tickets; page through `pageInfo` if rules and triage ever link more.
const QUERY = `query Tickets($ids: [ID!]) {
  issues(filter: { id: { in: $ids } }, first: 250, includeArchived: true) {
    nodes { identifier state { name type } releases { nodes { name stage { type } } } }
  }
}`;

type LinearIssue = {
  identifier: string;
  state?: { name?: string; type?: string } | null;
  releases?: { nodes?: { name: string; stage?: { type?: string } | null }[] } | null;
};

export function parseLinearIssues(body: string, status: number): Map<string, Ticket> {
  let parsed: { data?: { issues?: { nodes?: LinearIssue[] } } | null; errors?: { message?: string }[] } = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    // A non-JSON body (proxy page, empty 401) is handled by the check below.
  }
  const nodes = parsed.data?.issues?.nodes;
  if (status >= 400 || !nodes) {
    const messages = (parsed.errors ?? []).map((error) => error.message).filter(Boolean);
    throw new Error(`Linear query failed (${status}): ${messages.join(" ") || "no details"}`);
  }
  return new Map(
    nodes.map((issue) => [
      issue.identifier.toUpperCase(),
      {
        status: issue.state?.name ?? "?",
        done: issue.state?.type === "completed" || issue.state?.type === "canceled",
        releases: (issue.releases?.nodes ?? []).map((release) => ({ name: release.name, released: release.stage?.type === "completed" })),
      },
    ]),
  );
}

export async function fetchTickets(keys: string[]): Promise<Map<string, Ticket>> {
  const unique = [...new Set(keys.map((key) => key.toUpperCase()).filter((key) => TICKET_KEY.test(key)))];
  if (unique.length === 0) return new Map();
  const token = await apiKey();
  if (!token) throw new LinearCredentialsMissingError();
  // A personal API key goes as is, without "Bearer".
  const raw = await run("curl", [
    "-sS", "--max-time", "15", "-H", `Authorization: ${token}`, "-H", "Content-Type: application/json", "-w", "\n%{http_code}",
    "--data", JSON.stringify({ query: QUERY, variables: { ids: unique } }), LINEAR_API,
  ]);
  const newline = raw.lastIndexOf("\n");
  return parseLinearIssues(raw.slice(0, newline), Number(raw.slice(newline + 1)));
}
