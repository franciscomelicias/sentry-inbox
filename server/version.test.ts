import { describe, expect, it, vi } from "vitest";
import packageJson from "../package.json";

const release = (tag: string) => vi.fn(async () => new Response(JSON.stringify({ tag_name: tag, html_url: `https://github.com/r/releases/tag/${tag}` })));

describe("getVersion", () => {
  it("ships the package.json version (npm version rewrites shared/version.ts)", async () => {
    expect((await import("../shared/version")).VERSION).toBe(packageJson.version);
  });

  it("warns when GitHub's latest release is newer", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", release("v999.0.0"));
    const { getVersion } = await import("./version");
    expect(await getVersion()).toEqual({ current: packageJson.version, latest: "999.0.0", url: "https://github.com/r/releases/tag/v999.0.0" });
  });

  it("stays quiet when up to date or GitHub fails", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", release(`v${packageJson.version}`));
    expect((await (await import("./version")).getVersion()).latest).toBeNull();
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await (await import("./version")).getVersion()).latest).toBeNull();
  });
});
