import type { PluginServerContext } from "@getpaseo/plugin/server";
import { addRuleRpc, deleteRuleRpc, getGraphsRpc, getInboxRpc, getPrefsRpc, getVersionRpc, setPrefsRpc } from "./shared/rpc";
import { getGraphs, getInbox } from "./server/inbox";
import { addRule, deleteRule, readPrefs, writePrefs } from "./server/store";
import { getVersion } from "./server/version";

export default function contribute(server: PluginServerContext) {
  server.handle(getInboxRpc, getInbox);
  server.handle(getGraphsRpc, getGraphs);
  server.handle(addRuleRpc, addRule);
  server.handle(deleteRuleRpc, async ({ id }) => {
    await deleteRule(id);
    return {};
  });
  server.handle(getPrefsRpc, readPrefs);
  server.handle(getVersionRpc, getVersion);
  server.handle(setPrefsRpc, async (prefs) => {
    await writePrefs(prefs);
    return {};
  });
  return () => {};
}
