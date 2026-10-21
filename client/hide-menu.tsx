import { useRpc } from "@getpaseo/plugin/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { IssueRow, RuleInput } from "../shared/model";
import { addRuleRpc } from "../shared/rpc";
import type { Styles } from "./styles";

const SNOOZE_DAYS = 7;
const DEFAULT_PER_DAY = 50;

export function HideMenu({ row, nextRelease, styles, onDone }: { row: IssueRow; nextRelease: string | null; styles: Styles; onDone: () => void }) {
  const addRule = useRpc(addRuleRpc);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [perDay, setPerDay] = useState(String(DEFAULT_PER_DAY));
  const [error, setError] = useState<string | null>(null);
  const byIssue = { issueId: row.id };
  const byKind = { type: row.type, culprit: row.culprit };

  const save = async (input: RuleInput) => {
    setError(null);
    try {
      await addRule(input);
      await queryClient.invalidateQueries({ queryKey: ["sentry-inbox"] });
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const needsReason = (kind: "known" | "ugly") => () =>
    reason.trim() ? void save({ kind, match: byKind, reason: reason.trim() }) : setError("Write the reason first");

  return (
    <View style={[styles.panel, { marginLeft: 74 }]}>
      <Text style={styles.label}>Hide {row.shortId}</Text>
      <View style={styles.wrap}>
        <Item label="This issue" onPress={() => void save({ kind: "hidden", match: byIssue, reason: "hidden from the screen" })} styles={styles} />
        <Item label={`Every ${row.type}`} onPress={() => void save({ kind: "hidden", match: { type: row.type }, reason: "exception type hidden" })} styles={styles} />
        {row.realms.map((realm) => (
          <Item key={realm.name} label={`Realm ${realm.name}`} onPress={() => void save({ kind: "hidden", match: { realm: [realm.name] }, reason: `realm ${realm.name} hidden` })} styles={styles} />
        ))}
        <Item
          label={`Snooze ${SNOOZE_DAYS} days`}
          onPress={() => void save({ kind: "snooze", match: byIssue, reason: "snoozed", until: { date: new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString() } })}
          styles={styles}
        />
        {nextRelease ? (
          <Item label={`Until ${nextRelease}`} onPress={() => void save({ kind: "snooze", match: byIssue, reason: "until next release", until: { release: nextRelease } })} styles={styles} />
        ) : null}
      </View>
      <View style={styles.wrap}>
        <Text style={styles.muted}>Until more than</Text>
        <TextInput value={perDay} onChangeText={setPerDay} keyboardType="numeric" style={[styles.input, { minWidth: 50 }]} />
        <Item
          label="events/day"
          onPress={() => void save({ kind: "snooze", match: byIssue, reason: "until it gets busy", until: { eventsPerDayAbove: Number(perDay) || DEFAULT_PER_DAY } })}
          styles={styles}
        />
      </View>
      <View style={styles.wrap}>
        <TextInput value={reason} onChangeText={setReason} placeholder="Why is it normal? (e.g. locked period, RP-1234)" placeholderTextColor={styles.colors.foregroundMuted} style={[styles.input, { flex: 1 }]} />
        <Item label="Mark as known" onPress={needsReason("known")} styles={styles} />
        <Item label="Known but ugly" onPress={needsReason("ugly")} styles={styles} />
      </View>
      <Text style={styles.muted}>Known / ugly match every {row.type} from {row.culprit || "the same place"}.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function Item({ label, onPress, styles }: { label: string; onPress: () => void; styles: Styles }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text style={styles.chip}>{label}</Text>
    </Pressable>
  );
}

/** Hide actions for a group of identical errors: one rule on the exact message, so new copies stay grouped and hidden. */
export function GroupHideMenu({ title, project, size, styles, onDone }: { title: string; project: string; size: number; styles: Styles; onDone: () => void }) {
  const addRule = useRpc(addRuleRpc);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const match = { project, messageRegex: `^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$` };

  const save = async (input: RuleInput) => {
    setError(null);
    try {
      await addRule(input);
      await queryClient.invalidateQueries({ queryKey: ["sentry-inbox"] });
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const withReason = (kind: "known" | "ugly") => () =>
    reason.trim() ? void save({ kind, match, reason: reason.trim() }) : setError("Write the reason first");

  return (
    <View style={[styles.panel, { marginLeft: 74 }]}>
      <Text style={styles.label}>Hide all {size} issues with this message</Text>
      <View style={styles.wrap}>
        <Item label={`Hide all ${size}`} onPress={() => void save({ kind: "hidden", match, reason: "identical errors hidden from the screen" })} styles={styles} />
        <Item
          label={`Snooze all ${SNOOZE_DAYS} days`}
          onPress={() => void save({ kind: "snooze", match, reason: "snoozed", until: { date: new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString() } })}
          styles={styles}
        />
      </View>
      <View style={styles.wrap}>
        <TextInput value={reason} onChangeText={setReason} placeholder="Why is it normal? (e.g. validation error, RP-1234)" placeholderTextColor={styles.colors.foregroundMuted} style={[styles.input, { flex: 1 }]} />
        <Item label="Mark all as known" onPress={withReason("known")} styles={styles} />
        <Item label="Known but ugly" onPress={withReason("ugly")} styles={styles} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
