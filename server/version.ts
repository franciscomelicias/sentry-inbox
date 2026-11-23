import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { VERSION } from "../shared/version";
import { compareVersions } from "./classify";
import { pluginDir } from "./paths";

const execFileAsync = promisify(execFile);
const MAC_PASEO = "/Applications/Paseo.app/Contents/Resources/bin/paseo";

const REPO = "franciscomelicias/sentry-inbox";
const CHECK_MS = 6 * 3600 * 1000;

export type VersionInfo = { current: string; latest: string | null; url: string };

let checked: { at: number; latest: Promise<{ version: string; url: string } | null> } | null = null;

/** GitHub's latest release, checked at most every 6h; unauthenticated (60 calls/h), so a failure just means no warning. */
export async function getVersion(): Promise<VersionInfo> {
  const current = VERSION;
  if (!checked || Date.now() - checked.at > CHECK_MS) checked = { at: Date.now(), latest: latestRelease() };
  const latest = await checked.latest;
  return latest && compareVersions(latest.version, current) > 0
    ? { current, latest: latest.version, url: latest.url }
    : { current, latest: null, url: `https://github.com/${REPO}/releases` };
}

export async function update(): Promise<{ updated: boolean; message: string }> {
  const cwd = pluginDir();
  const git = (...args: string[]) => execFileAsync("git", args, { cwd, timeout: 60_000 });
  const before = (await git("rev-parse", "HEAD")).stdout.trim();
  await git("pull", "--ff-only", "origin", "main");
  const after = (await git("rev-parse", "HEAD")).stdout.trim();
  if (before === after) return { updated: false, message: "Already up to date" };
  // npm often comes from nvm, which only an interactive shell loads; the daemon's PATH may have neither.
  if ((await git("diff", "--name-only", before, after)).stdout.includes("package-lock.json")) {
    await execFileAsync(process.env.SHELL ?? "/bin/sh", ["-ilc", "npm install --no-audit --no-fund"], { cwd, timeout: 5 * 60_000 });
  }
  checked = null;
  // Reloading stops this server, so it runs detached after the reply is sent.
  const paseo = existsSync(MAC_PASEO) ? MAC_PASEO : "paseo";
  setTimeout(() => spawn(paseo, ["plugin", "reload", "sentry-inbox"], { detached: true, stdio: "ignore" }).unref(), 500);
  return { updated: true, message: "Updated, reloading…" };
}

async function latestRelease(): Promise<{ version: string; url: string } | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) return null;
    const release = (await response.json()) as { tag_name: string; html_url: string };
    return { version: release.tag_name.replace(/^v/, ""), url: release.html_url };
  } catch {
    return null;
  }
}
