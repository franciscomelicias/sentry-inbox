import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { applyFilters } from "../shared/filter";
import { groupRows } from "../shared/insights";
import { jiraBrowseUrl, STAGES, type Bucket, type Inbox, type IssueRow, type Prefs, type Range } from "../shared/model";
import { getGraphsRpc, getInboxRpc, getPrefsRpc, getVersionRpc, setPrefsRpc } from "../shared/rpc";
import { useAgents } from "./agents";
import { FilterBar } from "./filters";
import { GraphsPanel } from "./graphs";
import { ColumnHeader, GroupRowView, IssueRowView, SmallButton } from "./row";
import { RulesPanel } from "./rules-panel";
import { createStyles, type Styles } from "./styles";
import { listenShortcuts } from "./web";

const AUTO_REFRESH_MS = 15 * 60 * 1000;
const STALE_MS = 5 * 60 * 1000;
const ARM_MS = 3000;

const TABS: { bucket: Bucket; label: string }[] = [
  { bucket: "new", label: "New" },
  { bucket: "regressed", label: "Regressed" },
  { bucket: "spiking", label: "Spiking" },
  { bucket: "ongoing", label: "Ongoing" },
  { bucket: "ugly", label: "Known but ugly" },
  { bucket: "fixFailed", label: "Fix didn't work" },
  { bucket: "hidden", label: "Hidden" },
];

const RANGE_LABELS: Record<Range, string> = { deploy: "Since last deploy", "24h": "24h", "7d": "7d", "14d": "14d" };

const SHORTCUTS = [
  ["j / k", "next / previous issue"],
  ["o", "expand"],
  ["i i", "investigate (press twice)"],
  ["t t", "ticket (press twice)"],
  ["h", "hide…"],
  ["u", "known but ugly (opens hide…)"],
  ["g", "graphs"],
  ["/", "search"],
  ["?", "this help"],
];

export function InboxSurface({ theme, layout, navigation }: PluginSurfaceProps) {
  const styles = useMemo(() => createStyles(theme.colors, layout.compact), [theme, layout.compact]);
  const [prefs, updatePrefs] = usePrefs();
  const agents = useAgents(navigation);
  const fetchInbox = useRpc(getInboxRpc);
  const range = prefs?.range ?? "deploy";
  const stage = prefs?.stage ?? "prod";
  const inbox = useQuery({
    queryKey: ["sentry-inbox", stage, range],
    queryFn: () => fetchInbox({ stage, range, force: false }),
    enabled: prefs !== null,
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
    refetchInterval: AUTO_REFRESH_MS,
  });
  const fetchVersion = useRpc(getVersionRpc);
  const version = useQuery({ queryKey: ["sentry-inbox-version"], queryFn: () => fetchVersion({}), staleTime: Infinity });
  const queryClient = useQueryClient();
  const forceRefresh = () =>
    void queryClient.fetchQuery({ queryKey: ["sentry-inbox", stage, range], queryFn: () => fetchInbox({ stage, range, force: true }), staleTime: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hideId, setHideId] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [showHelp, setShowHelp] = useState(false);
  // Closed on every open, and its data is only fetched once opened.
  const [graphsOpen, setGraphsOpen] = useState(false);
  const fetchGraphs = useRpc(getGraphsRpc);
  const graphs = useQuery({
    queryKey: ["sentry-inbox-graphs", stage, range],
    queryFn: () => fetchGraphs({ stage, range }),
    enabled: graphsOpen && prefs !== null,
    staleTime: STALE_MS,
  });
  // i and t start agents: Paseo doesn't tell a surface whether it's visible, so a key needs a confirming second press.
  const [armed, setArmed] = useState<{ key: string; id: string; at: number } | null>(null);
  const searchRef = useRef<TextInput>(null);

  const allRows = inbox.data?.rows ?? [];
  const byId = new Map(allRows.map((row) => [row.id, row]));
  const rows = prefs ? applyFilters(allRows, prefs.filters) : allRows;
  const tab = prefs?.tab ?? "new";
  const tabRows = rows.filter((row) => row.bucket === tab);
  const groups = groupRows(tabRows);
  // j/k walk what's on screen: issues inside a closed group are skipped.
  const navRows = groups.flatMap((group) => (group.rows.length === 1 || openGroups.has(group.key) ? group.rows : []));
  const nextReleaseOf = (row: IssueRow) => bumpPatch(row.lastRelease ?? inbox.data?.deploy?.version ?? null);

  useEffect(
    () =>
      listenShortcuts((key) => {
        const index = navRows.findIndex((row) => row.id === selectedId);
        const selected = navRows[index];
        if (key === "j" || key === "k") {
          const next = navRows[Math.min(Math.max(index + (key === "j" ? 1 : -1), 0), navRows.length - 1)];
          if (next) setSelectedId(next.id);
          return true;
        }
        if (key === "/") {
          searchRef.current?.focus();
          return true;
        }
        if (key === "g") {
          setGraphsOpen((open) => !open);
          return true;
        }
        if (key === "?") {
          setShowHelp((shown) => !shown);
          return true;
        }
        if (!selected) return false;
        if (key === "o") setExpandedId((id) => (id === selected.id ? null : selected.id));
        else if (key === "t" && selected.rp) void openExternalUrl(jiraBrowseUrl(selected.rp.key));
        else if (key === "i" || key === "t") {
          const confirmed = armed?.key === key && armed.id === selected.id && Date.now() - armed.at < ARM_MS;
          if (!confirmed) {
            setArmed({ key, id: selected.id, at: Date.now() });
            return true;
          }
          setArmed(null);
          void (key === "i" ? agents.investigate(selected) : agents.ticket(selected));
        }
        else if (key === "h" || key === "u") setHideId((id) => (id === selected.id ? null : selected.id));
        else return false;
        return true;
      }),
    [navRows, selectedId, agents, armed],
  );

  if (prefs === null) return <Text style={[styles.muted, { padding: 20 }]}>Loading…</Text>;

  return (
    <View style={styles.screen}>
      <View style={styles.fixed}>
      <View style={styles.header}>
        <Text style={styles.title}>Sentry inbox</Text>
        {version.data ? (
          <Pressable accessibilityRole="link" onPress={() => void openExternalUrl(version.data.url)}>
            <Text style={version.data.latest ? styles.badgeWarning : styles.muted}>
              {version.data.latest ? `v${version.data.current} · ⬆ v${version.data.latest} available` : `v${version.data.current}`}
            </Text>
          </Pressable>
        ) : null}
        {STAGES.map((value) => (
          // Project and environment filters name one stage's projects: drop them on a switch.
          <Pressable key={value} accessibilityRole="button" onPress={() => updatePrefs({ stage: value, filters: { ...prefs.filters, projects: [], environments: [] } })}>
            <Text style={stage === value ? styles.chipActive : styles.chip}>{value}</Text>
          </Pressable>
        ))}
        <Text style={styles.muted}>·</Text>
        {(Object.keys(RANGE_LABELS) as Range[]).map((value) => (
          <Pressable key={value} accessibilityRole="button" onPress={() => updatePrefs({ range: value })}>
            <Text style={range === value ? styles.chipActive : styles.chip}>
              {RANGE_LABELS[value]}
              {value === "deploy" && inbox.data?.deploy ? ` · ${inbox.data.deploy.version} · ${ago(inbox.data.deploy.at)}` : ""}
            </Text>
          </Pressable>
        ))}
        <View style={{ flexGrow: 1 }} />
        {inbox.data ? <Text style={styles.muted}>updated {ago(inbox.data.fetchedAt)}</Text> : null}
        <SmallButton label="💬 lead:sentry" primary disabled={!agents.available || agents.pending !== null} onPress={() => void agents.openLead()} styles={styles} />
        <SmallButton label={inbox.isFetching ? "…" : "↻"} hint="Refresh" disabled={inbox.isFetching} onPress={forceRefresh} styles={styles} />
      </View>

      <Banners inbox={inbox.data} error={inbox.error} styles={styles} />
      {agents.error ? <Text style={styles.error}>{agents.error}</Text> : null}
      {armed && Date.now() - armed.at < ARM_MS ? (
        <Text style={styles.warning}>Press {armed.key} again to {armed.key === "i" ? "investigate" : "create a ticket for"} the selected issue</Text>
      ) : null}
      {agents.pending ? <Text style={styles.muted}>Opening agent for {agents.pending}…</Text> : null}
      {inbox.isLoading ? <Text style={styles.muted}>Loading Sentry… (the first load samples every issue's events, it can take a minute)</Text> : null}

      {inbox.data ? (
        <>
          <GraphsPanel
            graphs={graphs.data}
            loading={graphs.isFetching}
            error={graphs.error}
            rows={prefs.filters.cell ? applyFilters(allRows, { ...prefs.filters, cell: null }) : rows}
            deployAt={inbox.data.deploy?.at ?? null}
            open={graphsOpen}
            onToggle={() => setGraphsOpen((open) => !open)}
            onCell={(issueId, day, bucket) => updatePrefs({ tab: bucket, filters: { ...prefs.filters, cell: { issueId, day } } })}
            styles={styles}
          />
          <FilterBar prefs={prefs} rows={allRows} searchRef={searchRef} updatePrefs={updatePrefs} styles={styles} />
          <View style={styles.tabs}>
            {TABS.map(({ bucket, label }) => {
              const count = rows.filter((row) => row.bucket === bucket).length;
              const suffix = bucket === "hidden" ? ` ${count} · ${inbox.data.rules.length} rules` : ` ${count}`;
              return (
                <Pressable key={bucket} accessibilityRole="tab" onPress={() => updatePrefs({ tab: bucket })} style={tab === bucket ? styles.tabActive : styles.tab}>
                  <Text style={tab === bucket ? styles.tabTextActive : styles.tabText}>
                    {label}
                    {suffix}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <ColumnHeader styles={styles} />
        </>
      ) : null}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
      {inbox.data ? (
        <>
          {tab === "hidden" ? <RulesPanel inbox={inbox.data} styles={styles} /> : null}
          {tabRows.length === 0 ? <Text style={[styles.muted, { padding: 8 }]}>Nothing here.</Text> : null}
          {groups.map((group) => {
            const renderRow = (row: IssueRow) => (
              <IssueRowView
                key={row.id}
                row={row}
                styles={styles}
                selected={row.id === selectedId}
                expanded={row.id === expandedId}
                hideOpen={row.id === hideId}
                nextRelease={nextReleaseOf(row)}
                agentsAvailable={agents.available && agents.pending === null}
                onSelect={() => {
                  setSelectedId(row.id);
                  setExpandedId((id) => (id === row.id ? null : row.id));
                }}
                onInvestigate={() => void agents.investigate(row)}
                onTicket={() => void agents.ticket(row)}
                onToggleHide={() => setHideId((id) => (id === row.id ? null : row.id))}
                onHidden={() => setHideId(null)}
                linkedRows={row.links.flatMap((link) => byId.get(link.issueId) ?? [])}
                onInvestigateLinked={(linked) => void agents.investigate(linked)}
              />
            );
            if (group.rows.length === 1) return renderRow(group.rows[0]);
            return (
              <GroupRowView
                key={group.key}
                group={group}
                open={openGroups.has(group.key)}
                hideOpen={hideId === group.key}
                onToggle={() => toggleGroup(group.key)}
                onToggleHide={() => setHideId((id) => (id === group.key ? null : group.key))}
                onInvestigate={() => void agents.investigateGroup(group.rows)}
                agentsAvailable={agents.available && agents.pending === null}
                styles={styles}
              >
                {group.rows.map(renderRow)}
              </GroupRowView>
            );
          })}
        </>
      ) : null}

      <View style={styles.wrap}>
        {SHORTCUTS.slice(0, showHelp ? SHORTCUTS.length : 0).map(([key, label]) => (
          <Text key={key} style={styles.muted}>
            <Text style={styles.kbd}>{key}</Text> {label}
          </Text>
        ))}
        {showHelp ? null : <Text style={styles.muted}>Press ? for keyboard shortcuts</Text>}
      </View>
      </ScrollView>
    </View>
  );
}

function Banners({ inbox, error, styles }: { inbox: Inbox | undefined; error: unknown; styles: Styles }) {
  const messages = [
    ...(error ? [{ danger: true, text: error instanceof Error ? error.message : String(error) }] : []),
    ...(inbox?.staleSince ? [{ danger: false, text: `Showing data from ${new Date(inbox.staleSince).toLocaleTimeString()} (stale)` }] : []),
    ...(inbox?.errors ?? []).map((text) => ({ danger: false, text })),
    ...(inbox && inbox.invalidRules.length > 0 ? [{ danger: false, text: `${inbox.invalidRules.length} invalid rule(s) skipped, see the Hidden tab` }] : []),
  ];
  if (messages.length === 0) return null;
  return (
    <View style={messages.some((message) => message.danger) ? styles.bannerDanger : styles.banner}>
      {messages.map((message) => (
        <Text key={message.text} style={message.danger ? styles.error : styles.warning}>
          {message.text}
        </Text>
      ))}
    </View>
  );
}

/** Prefs live on the server (~/.cache/sentry-inbox/prefs.json); null until loaded. */
function usePrefs(): [Prefs | null, (patch: Partial<Prefs>) => void] {
  const getPrefs = useRpc(getPrefsRpc);
  const setPrefs = useRpc(setPrefsRpc);
  const [prefs, setLocal] = useState<Prefs | null>(null);
  useEffect(() => {
    void getPrefs({}).then(setLocal);
  }, [getPrefs]);
  const update = (patch: Partial<Prefs>) =>
    setLocal((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      void setPrefs(next);
      return next;
    });
  return [prefs, update];
}

export function bumpPatch(version: string | null): string | null {
  const match = version ? /^(\d+)\.(\d+)\.(\d+)/.exec(version) : null;
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : null;
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}
