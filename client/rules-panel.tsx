import { useRpc } from "@getpaseo/plugin/client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import type { Inbox, Rule } from "../shared/model";
import { deleteRuleRpc } from "../shared/rpc";
import { SmallButton } from "./row";
import type { Styles } from "./styles";

export function RulesPanel({ inbox, styles }: { inbox: Inbox; styles: Styles }) {
  const deleteRule = useRpc(deleteRuleRpc);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteRule({ id });
      await queryClient.invalidateQueries({ queryKey: ["sentry-inbox"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.label}>Rules ({inbox.rules.length}) · ~/.sentry-inbox/rules.json</Text>
      {inbox.rules.length === 0 ? <Text style={styles.muted}>No rules yet. Hide an issue or ask lead:sentry.</Text> : null}
      {inbox.rules.map(({ rule, hits, dead }) => (
        <View key={rule.id} style={[styles.wrap, { justifyContent: "space-between" }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.wrap}>
              <Text style={rule.kind === "ugly" ? styles.badgeWarning : styles.badge}>{rule.kind}</Text>
              <Text style={styles.text}>{rule.reason}</Text>
              {rule.rp ? <Text style={styles.badge}>{rule.rp}</Text> : null}
              {dead ? <Text style={styles.badgeWarning}>dead · 0 hits in 30 days</Text> : null}
            </View>
            <Text style={styles.muted}>
              {matchSummary(rule)}
              {untilSummary(rule)} · by {rule.createdBy} · {hits} hit{hits === 1 ? "" : "s"}
            </Text>
          </View>
          <SmallButton label="Delete" onPress={() => void remove(rule.id)} styles={styles} />
        </View>
      ))}
      {inbox.invalidRules.length > 0 ? (
        <View style={{ gap: 2 }}>
          <Text style={styles.warning}>Invalid rules, skipped (fix them in rules.json or ask lead:sentry):</Text>
          {inbox.invalidRules.map((line) => (
            <Text key={line} style={styles.muted}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function matchSummary(rule: Rule): string {
  const { issueId, project, type, messageRegex, culprit, realm } = rule.match;
  return [
    issueId && `issue ${issueId}`,
    project && `project ${project}`,
    type && `type ${type}`,
    messageRegex && `message /${messageRegex}/`,
    culprit && `from ${culprit}`,
    realm && `realm ${realm.join(", ")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function untilSummary(rule: Rule): string {
  const { date, release, eventsPerDayAbove } = rule.until ?? {};
  const parts = [date && `until ${date.slice(0, 10)}`, release && `until ${release}`, eventsPerDayAbove !== undefined && `until > ${eventsPerDayAbove}/day`];
  const text = parts.filter(Boolean).join(", ");
  return text ? ` · ${text}` : "";
}
