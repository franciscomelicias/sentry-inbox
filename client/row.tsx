import { openExternalUrl } from "@getpaseo/plugin/client";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { IssueGroup } from "../shared/insights";
import type { IssueRow } from "../shared/model";
import { GroupHideMenu, HideMenu } from "./hide-menu";
import { COLUMN, eventsColor, type Styles } from "./styles";

const MAX_REALMS = 5;

type Props = {
  row: IssueRow;
  styles: Styles;
  selected: boolean;
  expanded: boolean;
  hideOpen: boolean;
  nextRelease: string | null;
  agentsAvailable: boolean;
  onSelect: () => void;
  onInvestigate: () => void;
  onTicket: () => void;
  onToggleHide: () => void;
  onHidden: () => void;
  /** The other side of the trace (FE for a BE issue and vice versa), looked up by the caller. */
  linkedRows: IssueRow[];
  onInvestigateLinked: (row: IssueRow) => void;
};

export function IssueRowView(props: Props) {
  const { row, styles } = props;
  const realmCount = row.realms.length;
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={props.onSelect} style={[styles.issue, props.selected ? styles.issueSelected : null]}>
        <Spark daily={row.daily} hot={row.bucket === "spiking" || row.bucket === "new"} styles={styles} />
        <View style={styles.issueMain}>
          <Text style={styles.strong} numberOfLines={1}>
            {row.title}
          </Text>
          <View style={styles.wrap}>
            <Text style={styles.muted}>
              {row.side} · {row.area}
              {row.firstRelease ? ` · first seen ${row.firstRelease}` : ""}
              {row.lastRelease && !row.isCurrentRelease ? ` · last on ${row.lastRelease}` : ""}
            </Text>
            {row.links.length > 0 ? (
              <Text style={styles.linkBadge}>
                ⇄ {otherSide(row)}
                {row.links.length > 1 ? ` ×${row.links.length}` : ""}
              </Text>
            ) : null}
            {row.rp ? <Text style={row.rp.done ? styles.badge : styles.badgeWarning}>{`${row.rp.key} ${row.rp.status}`}</Text> : null}
            {row.spikingKnown ? <Text style={styles.badgeDanger}>known, but spiking</Text> : null}
            {row.hiddenReason ? <Text style={styles.badge}>{HIDDEN_LABELS[row.hiddenReason]}</Text> : null}
          </View>
        </View>
        <EventsCount count={row.count} styles={styles} />
        <Text style={[styles.strong, styles.count, { textAlign: "right" }]}>{realmCount}</Text>
        <Text style={[styles.muted, styles.owner]} numberOfLines={1}>
          {row.owner ?? "—"}
        </Text>
        <View style={styles.actions}>
          <SmallButton label="🔍" hint="Investigate: AI analysis + repro steps (i i)" disabled={!props.agentsAvailable} onPress={props.onInvestigate} styles={styles} />
          <SmallButton label="🎫" hint="Create an RP ticket via lead:sentry (t t)" disabled={!props.agentsAvailable} onPress={props.onTicket} styles={styles} />
          <SmallButton label="🙈" hint="Hide, snooze or mark as known (h)" onPress={props.onToggleHide} styles={styles} />
          <SmallButton label="↗" hint="Open in Sentry" onPress={() => void openExternalUrl(row.permalink)} styles={styles} />
        </View>
      </Pressable>
      {props.hideOpen ? <HideMenu row={row} nextRelease={props.nextRelease} styles={styles} onDone={props.onHidden} /> : null}
      {props.expanded ? (
        <View style={styles.detailBox}>
          <View style={styles.detail}>
            <View style={styles.detailColumn}>
              <Text style={styles.label}>Where</Text>
              <Text style={styles.text}>{row.culprit || "—"}</Text>
              {row.topFrame ? <Text style={styles.code}>{row.topFrame}</Text> : null}
              <Text style={[styles.label, { marginTop: 6 }]}>Realms impacted (sampled events)</Text>
              {row.realms.slice(0, MAX_REALMS).map((realm) => (
                <Text key={realm.name} style={styles.text}>
                  {realm.name} · {realm.events} ev
                </Text>
              ))}
              {realmCount > MAX_REALMS ? <Text style={styles.muted}>+{realmCount - MAX_REALMS} more</Text> : null}
              {realmCount === 0 ? <Text style={styles.muted}>No realm in the sampled events</Text> : null}
            </View>
            <View style={styles.detailColumn}>
              <Text style={styles.label}>Investigation</Text>
              {row.triage?.verdict ? (
                <>
                  <Text style={styles.text}>{row.triage.verdict}</Text>
                  {(row.triage.reproSteps ?? []).map((step, index) => (
                    <Text key={index} style={styles.muted}>
                      {index + 1}. {step}
                    </Text>
                  ))}
                  <Text style={styles.muted}>
                    confidence: {row.triage.confidence ?? "?"}
                    {row.triage.fixedIn ? ` · fixed in ${row.triage.fixedIn}` : ""}
                  </Text>
                </>
              ) : (
                <Text style={styles.muted}>Not investigated yet</Text>
              )}
            </View>
          </View>
          {row.links.map((link) => {
            const linked = props.linkedRows.find((candidate) => candidate.id === link.issueId);
            return (
              <View key={link.issueId} style={styles.linkedCard}>
                <View style={styles.row}>
                  <Text style={[styles.linkBadge, { marginRight: 8 }]}>⇄ {otherSide(row)}</Text>
                  <Text style={[styles.strong, { flex: 1 }]}>{link.title}</Text>
                  <SmallButton label="🔍" hint="Investigate this side" disabled={!props.agentsAvailable || !linked} onPress={() => linked && props.onInvestigateLinked(linked)} styles={styles} />
                  <SmallButton label="↗" hint="Open in Sentry" onPress={() => void openExternalUrl(link.permalink)} styles={styles} />
                </View>
                <Text style={styles.muted}>
                  {link.shortId}
                  {linked ? ` · ${linked.area} · ${linked.count} events · ${linked.realms.length} realms${linked.firstRelease ? ` · first seen ${linked.firstRelease}` : ""}` : ""}
                </Text>
                {linked?.culprit ? <Text style={styles.text}>{linked.culprit}</Text> : null}
                {linked?.topFrame ? <Text style={styles.code}>{linked.topFrame}</Text> : null}
                <Text style={styles.muted}>
                  Same request in {link.matched} of {link.sampled} sampled events · RequestId {link.requestIds.slice(0, 2).join(", ")}
                  {link.requestIds.length > 2 ? ` +${link.requestIds.length - 2}` : ""}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const otherSide = (row: IssueRow) => (row.side === "FE" ? "BE" : "FE");

const HIDDEN_LABELS: Record<NonNullable<IssueRow["hiddenReason"]>, string> = {
  known: "known",
  hidden: "hidden",
  snooze: "snoozed",
  staleFe: "stale FE",
  foldedIntoBe: "shown in its BE row",
};

/** One line for identical errors; opens to the individual Sentry issues, rendered by the caller as `children`. */
export function GroupRowView({
  group,
  open,
  hideOpen,
  onToggle,
  onToggleHide,
  styles,
  children,
}: {
  group: IssueGroup;
  open: boolean;
  hideOpen: boolean;
  onToggle: () => void;
  onToggleHide: () => void;
  styles: Styles;
  children: React.ReactNode;
}) {
  const first = group.rows[0];
  const areas = [...new Set(group.rows.map((row) => row.area))].join(", ");
  const linked = group.rows.filter((row) => row.links.length > 0).length;
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.issue}>
        <Spark daily={group.daily} hot={group.rows.some((row) => row.bucket === "spiking" || row.bucket === "new")} styles={styles} />
        <View style={styles.issueMain}>
          <View style={styles.row}>
            <Text style={styles.groupBadge}>
              {open ? "▾" : "▸"} ×{group.rows.length}
            </Text>
            <Text style={[styles.strong, { flex: 1 }]} numberOfLines={1}>
              {first.title}
            </Text>
          </View>
          <View style={styles.wrap}>
            <Text style={styles.muted}>
              {first.side} · {areas} · {group.rows.length} Sentry issues with this message
            </Text>
            {linked > 0 ? <Text style={styles.linkBadge}>⇄ {linked} with a {first.side === "FE" ? "backend" : "frontend"} trace</Text> : null}
          </View>
        </View>
        <EventsCount count={group.count} styles={styles} />
        <Text style={[styles.strong, styles.count, { textAlign: "right" }]}>{group.realmCount}</Text>
        <Text style={[styles.muted, styles.owner]}>—</Text>
        <View style={styles.actions}>
          <SmallButton label="🙈" hint={`Hide, snooze or mark all ${group.rows.length} as known`} onPress={onToggleHide} styles={styles} />
        </View>
      </Pressable>
      {hideOpen ? <GroupHideMenu title={first.title} project={first.project} size={group.rows.length} styles={styles} onDone={onToggleHide} /> : null}
      {open ? <View style={{ marginLeft: 16, borderLeftWidth: 2, borderLeftColor: styles.colors.border }}>{children}</View> : null}
    </View>
  );
}

function EventsCount({ count, styles }: { count: number; styles: Styles }) {
  return (
    <View style={styles.count}>
      <Text style={[styles.countPill, { backgroundColor: eventsColor(styles.colors, count) }]}>{count}</Text>
    </View>
  );
}

function Spark({ daily, hot, styles }: { daily: number[]; hot: boolean; styles: Styles }) {
  const max = Math.max(1, ...daily);
  return (
    <View style={styles.spark}>
      {daily.map((count, index) => (
        <View key={index} style={{ flex: 1, height: Math.max(1, (count / max) * 18), backgroundColor: hot ? styles.colors.statusDanger : styles.colors.foregroundMuted }} />
      ))}
    </View>
  );
}

/** Column titles above the list; widths match IssueRowView's right-hand columns. */
export function ColumnHeader({ styles }: { styles: Styles }) {
  return (
    <View style={styles.columnHeader}>
      <Text style={[styles.columnLabel, { width: COLUMN.trend }]}>14 days</Text>
      <Text style={[styles.columnLabel, { flex: 1 }]}>Issue</Text>
      <Text style={[styles.columnLabel, styles.count, { textAlign: "right" }]}>Events</Text>
      <Text style={[styles.columnLabel, styles.count, { textAlign: "right" }]}>Realms</Text>
      <Text style={[styles.columnLabel, styles.owner]}>Owner</Text>
      <Text style={[styles.columnLabel, styles.actions, { textAlign: "right" }]}>Actions</Text>
    </View>
  );
}

export function SmallButton({
  label,
  hint,
  disabled,
  primary,
  onPress,
  styles,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  primary?: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ?? label}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[primary ? styles.buttonPrimary : styles.button, { marginLeft: 4 }, disabled ? styles.disabled : null]}
    >
      <Text style={primary ? styles.buttonPrimaryText : styles.buttonText}>{label}</Text>
      {hovered && hint ? (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={styles.tooltipText}>{hint}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
