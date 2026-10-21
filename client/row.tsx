import { openExternalUrl } from "@getpaseo/plugin/client";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { IssueRow } from "../shared/model";
import { HideMenu } from "./hide-menu";
import { COLUMN, type Styles } from "./styles";

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
};

export function IssueRowView(props: Props) {
  const { row, styles } = props;
  const max = Math.max(1, ...row.daily);
  const realmCount = row.realms.length;
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={props.onSelect} style={[styles.issue, props.selected ? styles.issueSelected : null]}>
        <View style={styles.spark}>
          {row.daily.map((count, index) => (
            <View
              key={index}
              style={{ flex: 1, height: Math.max(1, (count / max) * 18), backgroundColor: row.bucket === "spiking" || row.bucket === "new" ? styles.colors.statusDanger : styles.colors.foregroundMuted }}
            />
          ))}
        </View>
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
            {row.links.map((link) => (
              <Text key={link.issueId} style={styles.badge}>
                ⇄ {row.side === "FE" ? "BE" : "FE"} {link.shortId} · {link.matched} of {link.sampled}
              </Text>
            ))}
            {row.rp ? <Text style={row.rp.done ? styles.badge : styles.badgeWarning}>{`${row.rp.key} ${row.rp.status}`}</Text> : null}
            {row.spikingKnown ? <Text style={styles.badgeDanger}>known, but spiking</Text> : null}
            {row.hiddenReason ? <Text style={styles.badge}>{HIDDEN_LABELS[row.hiddenReason]}</Text> : null}
          </View>
        </View>
        <Text style={[styles.strong, styles.count, { textAlign: "right" }]}>{row.count}</Text>
        <Text style={[styles.strong, styles.count, { textAlign: "right" }]}>{realmCount}</Text>
        <Text style={[styles.muted, styles.owner]} numberOfLines={1}>
          {row.owner ?? "—"}
        </Text>
        <View style={styles.actions}>
          <SmallButton label="🔍" hint="Investigate: AI analysis + repro steps (i i)" disabled={!props.agentsAvailable} onPress={props.onInvestigate} styles={styles} />
          <SmallButton label="🎫" hint="Create an RP ticket via lead:sentry (t t)" disabled={!props.agentsAvailable} onPress={props.onTicket} styles={styles} />
          <SmallButton label="🙈" hint="Hide, snooze or mark as known (h)" onPress={props.onToggleHide} styles={styles} />
        </View>
      </Pressable>
      {props.hideOpen ? <HideMenu row={row} nextRelease={props.nextRelease} styles={styles} onDone={props.onHidden} /> : null}
      {props.expanded ? (
        <View style={styles.detail}>
          <View style={styles.detailColumn}>
            <Text style={styles.label}>Realms impacted (sampled events)</Text>
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
            <Pressable accessibilityRole="link" onPress={() => void openExternalUrl(row.permalink)}>
              <Text style={[styles.text, { textDecorationLine: "underline" }]}>Open {row.shortId} in Sentry</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const HIDDEN_LABELS: Record<NonNullable<IssueRow["hiddenReason"]>, string> = {
  known: "known",
  hidden: "hidden",
  snooze: "snoozed",
  staleFe: "stale FE",
  foldedIntoBe: "shown in its BE row",
};

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
