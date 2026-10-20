import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Same credentials as paseo-board-dev (server/lookups.ts): JIRA_EMAIL + JIRA_API_TOKEN in the Paseo daemon's
// environment, or a Keychain item (JIRA_KEYCHAIN_SERVICE, default "paseo-board-jira") with accounts "email"/"token".
const JIRA_SEARCH = "https://rogerhr.atlassian.net/rest/api/3/search/jql";

export type Ticket = { status: string; done: boolean; fixVersions: { name: string; released: boolean }[] };

export class JiraCredentialsMissingError extends Error {
  constructor() {
    super("Jira credentials missing (JIRA_EMAIL/JIRA_API_TOKEN or Keychain): RP statuses and \"fix didn't work\" are off");
  }
}

const run = async (file: string, args: string[]) => (await execFileAsync(file, args, { timeout: 15_000 })).stdout.trim();

const secret = (account: "email" | "token") => {
  const fromEnv = account === "email" ? process.env.JIRA_EMAIL : process.env.JIRA_API_TOKEN;
  if (fromEnv) return Promise.resolve(fromEnv);
  const service = process.env.JIRA_KEYCHAIN_SERVICE ?? "paseo-board-jira";
  return run("security", ["find-generic-password", "-a", account, "-s", service, "-w"]).catch(() => "");
};

type JiraIssue = {
  key: string;
  fields: {
    status?: { name?: string; statusCategory?: { key?: string } };
    fixVersions?: { name: string; released?: boolean }[];
  };
};

export async function fetchTickets(keys: string[]): Promise<Map<string, Ticket>> {
  const unique = [...new Set(keys.map((key) => key.toUpperCase()).filter((key) => /^RP-\d+$/.test(key)))];
  if (unique.length === 0) return new Map();
  const [email, token] = await Promise.all([secret("email"), secret("token")]);
  if (!token) throw new JiraCredentialsMissingError();
  const raw = await run("curl", [
    "-sS", "--max-time", "15", "-u", `${email}:${token}`, "-H", "Accept: application/json", "--get", JIRA_SEARCH,
    "--data-urlencode", `jql=key in (${unique.join(",")})`,
    "--data-urlencode", "fields=status,fixVersions",
    "--data-urlencode", "maxResults=100",
  ]);
  const issues = (JSON.parse(raw) as { issues?: JiraIssue[] }).issues ?? [];
  return new Map(
    issues.map((issue) => [
      issue.key.toUpperCase(),
      {
        status: issue.fields.status?.name ?? "?",
        done: issue.fields.status?.statusCategory?.key === "done",
        fixVersions: (issue.fields.fixVersions ?? []).map((version) => ({ name: version.name, released: version.released ?? false })),
      },
    ]),
  );
}
