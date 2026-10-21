import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { usePaseo } from "@getpaseo/plugin/client";
import { useState } from "react";
import type { IssueRow } from "../shared/model";
import { investigatePrompt, leadBrief, ticketMessage } from "../shared/prompts";

const REPO_PATH = "/Users/franciscomelicias/Documents/roger-platform";
const PROVIDER = "claude/claude-opus-5-5";
const LEAD_LABELS = { source: "sentry-inbox-lead" };
const LEAD_TITLE = "lead:sentry";
const WORKSPACE_TITLE = "Sentry inbox";

/**
 * One workspace for everything Sentry: lead:sentry's. Investigations are new chats inside it, never new workspaces.
 * The plugin API can't pin a workspace; pin "Sentry inbox" once in the sidebar and it stays pinned.
 */
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

  const findLead = async () => {
    const { entries } = await paseo.agents.list({ filter: { includeArchived: false, labels: LEAD_LABELS }, page: { limit: 1 } });
    return entries[0]?.agent ?? null;
  };

  const ensureLead = async (): Promise<{ id: string; workspaceId: string }> => {
    let lead = await findLead();
    if (!lead) {
      await paseo.agents.create({ config: { provider: PROVIDER }, cwd: REPO_PATH, title: LEAD_TITLE, labels: LEAD_LABELS, prompt: leadBrief() });
      lead = await findLead();
    }
    if (!lead?.workspaceId) throw new Error("lead:sentry has no workspace yet; try again in a moment");
    const workspace = paseo.workspaces.ref(lead.workspaceId);
    if ((await workspace.refresh())?.title !== WORKSPACE_TITLE) await workspace.setTitle(WORKSPACE_TITLE);
    return { id: lead.id, workspaceId: lead.workspaceId };
  };

  const openLead = () => run(LEAD_TITLE, async () => (await ensureLead()).id);

  const investigate = (row: IssueRow) =>
    run(row.shortId, async () => {
      const lead = await ensureLead();
      const title = `Investigate ${row.shortId}`;
      const { entries } = await paseo.agents.list({ filter: { includeArchived: false } });
      const existing = entries.map((entry) => entry.agent).find((agent) => agent.title === title && agent.workspaceId === lead.workspaceId);
      if (existing) return existing.id;
      const agent = await paseo.workspaces.ref(lead.workspaceId).agents.create({ config: { provider: PROVIDER }, title, prompt: investigatePrompt(row) });
      return agent.id;
    });

  const ticket = (row: IssueRow) =>
    run(row.shortId, async () => {
      const lead = await ensureLead();
      await paseo.agents.ref(lead.id).send(ticketMessage(row));
      return lead.id;
    });

  return { openLead, investigate, ticket, pending, error, available: navigation !== undefined };
}
