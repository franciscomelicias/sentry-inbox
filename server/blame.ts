import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const REPO_PATH = "/Users/franciscomelicias/Documents/roger-platform";

let repoFiles: Promise<string[]> | null = null;
const owners = new Map<string, Promise<string | null>>();

export function parseBlameAuthor(porcelain: string): string | null {
  const author = /^author (.+)$/m.exec(porcelain)?.[1] ?? null;
  return author === "Not Committed Yet" ? null : author;
}

/** The repo file whose path ends with the Sentry frame path; the longest frame path is the most specific. */
export function repoPathFor(framePath: string, files: string[]): string | null {
  const suffix = `/${framePath.replace(/^\/+/, "")}`;
  return files.find((file) => `/${file}`.endsWith(suffix)) ?? null;
}

/** Owner hint for the line an error was thrown on; null when the file or line can't be found. */
export function ownerOf(framePath: string, line: number): Promise<string | null> {
  const key = `${framePath}:${line}`;
  if (!owners.has(key)) owners.set(key, lookup(framePath, line));
  return owners.get(key)!;
}

async function lookup(framePath: string, line: number): Promise<string | null> {
  try {
    repoFiles ??= execFileAsync("git", ["-C", REPO_PATH, "ls-files"], { maxBuffer: 64 * 1024 * 1024 }).then(({ stdout }) =>
      stdout.split("\n"),
    );
    const file = repoPathFor(framePath, await repoFiles);
    if (!file || line < 1) return null;
    const { stdout } = await execFileAsync("git", ["-C", REPO_PATH, "blame", "--porcelain", "-L", `${line},${line}`, "--", file]);
    return parseBlameAuthor(stdout);
  } catch {
    return null;
  }
}
