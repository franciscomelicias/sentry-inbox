import { VERSION } from "../shared/version";
import { compareVersions } from "./classify";

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
