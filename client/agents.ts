import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { useState } from "react";
import type { IssueRow } from "../shared/model";
import { investigatePrompt, leadBrief, ticketMessage } from "../shared/prompts";

const REPO_PATH = "/Users/franciscomelicias/Documents/roger-platform";
const PROVIDER = "claude/claude-opus-5-5";
const LEAD_LABELS = { source: "sentry-inbox-lead" };
const LEAD_TITLE = "lead:sentry";

/** lead:sentry (found by label, created on first use), per-issue investigations, and tickets through the lead. */
export function useAgents(navigation: PluginSurfaceProps["navigation"]) {
  const paseo = usePaseo();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<string>) => {
    if (!navigation) return;
    setPending(key);
    setError(null);
    try {
      navigation.openAgent({ agentId: await action() });
    } catch (cause) {
      setError(`${key}: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setPending(null);
    }
  };

  const ensureLead = async (): Promise<string> => {
    const { entries } = await paseo.agents.list({ filter: { includeArchived: false, labels: LEAD_LABELS }, page: { limit: 1 } });
    const existing = entries[0]?.agent;
    if (existing) return existing.id;
    const agent = await paseo.agents.create({ config: { provider: PROVIDER }, cwd: REPO_PATH, title: LEAD_TITLE, labels: LEAD_LABELS, prompt: leadBrief() });
    return agent.id;
  };

  const openLead = () => run(LEAD_TITLE, ensureLead);

  const investigate = (row: IssueRow) =>
    run(row.shortId, async () => {
      const title = `Investigate ${row.shortId}`;
      const { entries } = await paseo.agents.list({ filter: { includeArchived: false } });
      const existing = entries.map((entry) => entry.agent).find((agent) => agent.title === title);
      if (existing) return existing.id;
      const agent = await paseo.agents.create({ config: { provider: PROVIDER }, cwd: REPO_PATH, title, prompt: investigatePrompt(row) });
      return agent.id;
    });

  const ticket = (row: IssueRow) =>
    run(row.shortId, async () => {
      const lead = await ensureLead();
      await paseo.agents.ref(lead).send(ticketMessage(row));
      return lead;
    });

  return { openLead, investigate, ticket, pending, error, available: navigation !== undefined };
}
