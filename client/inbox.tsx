import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { applyFilters } from "../shared/filter";
import type { Bucket, Inbox, IssueRow, Prefs, Range } from "../shared/model";
import { getInboxRpc, getPrefsRpc, setPrefsRpc } from "../shared/rpc";
import { useAgents } from "./agents";
import { FilterBar } from "./filters";
import { GraphsPanel } from "./graphs";
import { IssueRowView, SmallButton } from "./row";
import { RulesPanel } from "./rules-panel";
import { createStyles, type Styles } from "./styles";
import { listenShortcuts } from "./web";

const AUTO_REFRESH_MS = 15 * 60 * 1000;
const STALE_MS = 5 * 60 * 1000;

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
  ["i", "investigate"],
  ["t", "ticket"],
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
  const inbox = useQuery({
    queryKey: ["sentry-inbox", range],
    queryFn: () => fetchInbox({ range, force: false }),
    enabled: prefs !== null,
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
    refetchInterval: AUTO_REFRESH_MS,
  });
  const queryClient = useQueryClient();
  const forceRefresh = () =>
    void queryClient.fetchQuery({ queryKey: ["sentry-inbox", range], queryFn: () => fetchInbox({ range, force: true }), staleTime: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hideId, setHideId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const allRows = inbox.data?.rows ?? [];
  const rows = prefs ? applyFilters(allRows, prefs.filters) : allRows;
  const tab = prefs?.tab ?? "new";
  const tabRows = rows.filter((row) => row.bucket === tab);
  const nextReleaseOf = (row: IssueRow) => bumpPatch(row.lastRelease ?? inbox.data?.deploy?.version ?? null);

  useEffect(
    () =>
      listenShortcuts((key) => {
        const index = tabRows.findIndex((row) => row.id === selectedId);
        const selected = tabRows[index];
        if (key === "j" || key === "k") {
          const next = tabRows[Math.min(Math.max(index + (key === "j" ? 1 : -1), 0), tabRows.length - 1)];
          if (next) setSelectedId(next.id);
          return true;
        }
        if (key === "/") {
          searchRef.current?.focus();
          return true;
        }
        if (key === "g") {
          updatePrefs({ graphsOpen: !prefs?.graphsOpen });
          return true;
        }
        if (key === "?") {
          setShowHelp((shown) => !shown);
          return true;
        }
        if (!selected) return false;
        if (key === "o") setExpandedId((id) => (id === selected.id ? null : selected.id));
        else if (key === "i") void agents.investigate(selected);
        else if (key === "t") void agents.ticket(selected);
        else if (key === "h" || key === "u") setHideId((id) => (id === selected.id ? null : selected.id));
        else return false;
        return true;
      }),
    [tabRows, selectedId, prefs?.graphsOpen, agents],
  );

  if (prefs === null) return <Text style={[styles.muted, { padding: 20 }]}>Loading…</Text>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Sentry inbox</Text>
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
      {agents.pending ? <Text style={styles.muted}>Opening agent for {agents.pending}…</Text> : null}
      {inbox.isLoading ? <Text style={styles.muted}>Loading Sentry… (the first load samples every issue's events, it can take a minute)</Text> : null}

      {inbox.data ? (
        <>
          <GraphsPanel
            graphs={inbox.data.graphs}
            rows={prefs.filters.cell ? applyFilters(allRows, { ...prefs.filters, cell: null }) : rows}
            deployAt={inbox.data.deploy?.at ?? null}
            open={prefs.graphsOpen}
            onToggle={() => updatePrefs({ graphsOpen: !prefs.graphsOpen })}
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
          {tab === "hidden" ? <RulesPanel inbox={inbox.data} styles={styles} /> : null}
          {tabRows.length === 0 ? <Text style={styles.muted}>Nothing here.</Text> : null}
          {tabRows.map((row) => (
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
            />
          ))}
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
