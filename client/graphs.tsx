import { Pressable, ScrollView, Text, View } from "react-native";
import { headlineCounts, heatmapRows } from "../shared/insights";
import type { Bucket, Graphs, IssueRow } from "../shared/model";
import type { Styles } from "./styles";

const BAR_HEIGHT = 90;
// The panel sits in the fixed header: capped, so an open panel never squeezes out the issue list.
const MAX_PANEL_HEIGHT = 360;

type Props = {
  /** Undefined until the panel is first opened and its data has loaded. */
  graphs: Graphs | undefined;
  loading: boolean;
  error: unknown;
  /** The rows after filters: issue counts and the heatmap follow the filters, event rates are all errors of the stage. */
  rows: IssueRow[];
  deployAt: string | null;
  open: boolean;
  onToggle: () => void;
  onCell: (issueId: string, day: number, bucket: Bucket) => void;
  styles: Styles;
};

export function GraphsPanel({ graphs, loading, error, rows, deployAt, open, onToggle, onCell, styles }: Props) {
  return (
    <View style={styles.panel}>
      <Pressable accessibilityRole="button" onPress={onToggle}>
        <Text style={styles.label}>
          {open ? "▾" : "▸"} Graphs (g){open && loading ? " · loading…" : ""}
        </Text>
      </Pressable>
      {open && error ? <Text style={styles.error}>{error instanceof Error ? error.message : String(error)}</Text> : null}
      {open && graphs ? (
        <ScrollView style={{ maxHeight: MAX_PANEL_HEIGHT }}>
          <GraphsBody graphs={graphs} rows={rows} deployAt={deployAt} onCell={onCell} styles={styles} />
        </ScrollView>
      ) : null}
    </View>
  );
}

function GraphsBody({ graphs, rows, deployAt, onCell, styles }: Pick<Props, "rows" | "deployAt" | "onCell" | "styles"> & { graphs: Graphs }) {
  const counts = headlineCounts(rows, deployAt ?? new Date(Date.now() - 86_400_000).toISOString());
  const { eventsPerHourNow, eventsPerHourBefore } = graphs.headline;
  const change = eventsPerHourBefore > 0 ? Math.round(((eventsPerHourNow - eventsPerHourBefore) / eventsPerHourBefore) * 100) : null;
  const heatmap = heatmapRows(rows);

  return (
    <View style={{ gap: 8 }}>
      {(
        <>
          <View style={styles.wrap}>
            <Tile value={String(counts.newSinceDeploy)} label={deployAt ? "new issues since deploy" : "new issues, last 24h"} styles={styles} />
            <Tile
              value={change === null ? `${eventsPerHourNow}/h` : `${change > 0 ? "+" : ""}${change}%`}
              label={`events/h since deploy (${eventsPerHourNow} vs ${eventsPerHourBefore})`}
              danger={change !== null && change > 0}
              styles={styles}
            />
            <Tile value={String(counts.realmsWithNew)} label="realms with new errors" styles={styles} />
            <Tile value={String(counts.fixFailed)} label="fix didn't work" danger styles={styles} />
          </View>

          <Text style={styles.label}>Events per hour, 7 days · all errors · releases marked</Text>
          <HourlyBars graphs={graphs} styles={styles} />

          <Text style={styles.label}>
            Per area · before vs since deploy ({graphs.perArea[0]?.unit === "hour" ? "events per hour" : "events per day"})
          </Text>
          <PerArea graphs={graphs} styles={styles} />

          <Text style={styles.label}>Top errors by day · tap a cell to filter</Text>
          <View style={{ gap: 2 }}>
            <View style={styles.row}>
              <View style={{ width: 220 }} />
              {graphs.dayLabels.map((day) => (
                <Text key={day} style={[styles.muted, { flex: 1, fontSize: 9, textAlign: "center" }]}>
                  {day.slice(8)}
                </Text>
              ))}
            </View>
            {heatmap.map((row) => {
              const max = Math.max(1, ...row.daily);
              return (
                <View key={row.id} style={styles.row}>
                  <Text style={[styles.muted, { width: 220 }]} numberOfLines={1}>
                    {row.title}
                  </Text>
                  {row.daily.map((count, day) => (
                    <Pressable
                      key={day}
                      accessibilityRole="button"
                      accessibilityLabel={`${row.title}: ${count} on ${graphs.dayLabels[day]}`}
                      onPress={() => onCell(row.id, day, row.bucket)}
                      style={{ flex: 1, height: 18, margin: 1, borderRadius: 2, backgroundColor: styles.colors.accent, opacity: count === 0 ? 0.06 : 0.15 + 0.85 * (count / max) }}
                    />
                  ))}
                </View>
              );
            })}
            {heatmap.length === 0 ? <Text style={styles.muted}>No visible issues</Text> : null}
          </View>
        </>
      )}
    </View>
  );
}

function HourlyBars({ graphs, styles }: { graphs: Graphs; styles: Styles }) {
  const max = Math.max(1, ...graphs.hourly.map((bucket) => bucket.count));
  const start = graphs.hourly[0] ? Date.parse(graphs.hourly[0].at) : 0;
  const span = graphs.hourly.length > 1 ? Date.parse(graphs.hourly.at(-1)!.at) - start : 1;
  return (
    <View style={{ height: BAR_HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: 0.5 }}>
      {graphs.hourly.map((bucket) => (
        <View key={bucket.at} style={{ flex: 1, height: Math.max(1, (bucket.count / max) * BAR_HEIGHT), backgroundColor: styles.colors.foregroundMuted }} />
      ))}
      {graphs.releases
        .filter((release) => Date.parse(release.at) >= start)
        .map((release) => {
          const left = `${Math.min(100, ((Date.parse(release.at) - start) / span) * 100)}%` as const;
          return (
            <View key={release.version} style={{ position: "absolute", left, top: 0, bottom: 0, borderLeftWidth: 2, borderLeftColor: styles.colors.accent }}>
              <Text style={[styles.muted, { fontSize: 10, marginLeft: 3 }]}>{release.version}</Text>
            </View>
          );
        })}
    </View>
  );
}

function PerArea({ graphs, styles }: { graphs: Graphs; styles: Styles }) {
  const max = Math.max(1, ...graphs.perArea.flatMap((area) => [area.before, area.after]));
  return (
    <View style={{ gap: 4 }}>
      {graphs.perArea.map((area) => (
        <View key={area.area} style={styles.row}>
          <Text style={[styles.muted, { width: 90 }]}>{area.area}</Text>
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ height: 6, width: `${(area.before / max) * 100}%`, backgroundColor: styles.colors.border }} />
            <View style={{ height: 6, width: `${(area.after / max) * 100}%`, backgroundColor: styles.colors.accent }} />
          </View>
          <Text style={[styles.muted, { width: 70, textAlign: "right" }]}>
            {area.before} → {area.after}
          </Text>
        </View>
      ))}
      {graphs.perArea.length === 0 ? <Text style={styles.muted}>No visible issues</Text> : null}
      <Text style={styles.muted}>grey = before deploy · accent = since deploy</Text>
    </View>
  );
}

function Tile({ value, label, danger, styles }: { value: string; label: string; danger?: boolean; styles: Styles }) {
  return (
    <View style={{ minWidth: 140, marginRight: 16 }}>
      <Text style={[styles.title, { fontSize: 22 }, danger && value !== "0" ? { color: styles.colors.statusDanger } : null]}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}
