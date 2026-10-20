import type { PluginClientContext } from "@getpaseo/plugin/client";
import { InboxSurface } from "./client/inbox";

export default function contribute(client: PluginClientContext) {
  client.addSurface("sentry-inbox", InboxSurface);
  client.addSidebarItem({
    id: "sentry-inbox",
    title: "Sentry inbox",
    icon: "Bug",
    surface: "sentry-inbox",
  });
  return () => {};
}
