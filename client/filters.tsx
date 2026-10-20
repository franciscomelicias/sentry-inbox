import { useState, type RefObject } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { DEFAULT_VIEWS } from "../shared/filter";
import { DEFAULT_FILTERS, SIDES, type Filters, type IssueRow, type Prefs } from "../shared/model";
import type { Styles } from "./styles";

const RELEASES: Filters["release"][] = ["any", "current", "older"];
const TICKETS: { value: Filters["ticket"]; label: string }[] = [
  { value: "any", label: "any" },
  { value: "hasRp", label: "has RP" },
  { value: "noRp", label: "no RP" },
  { value: "rpDone", label: "RP done" },
];

type Props = {
  prefs: Prefs;
  rows: IssueRow[];
  searchRef: RefObject<TextInput | null>;
  updatePrefs: (patch: Partial<Prefs>) => void;
  styles: Styles;
};

export function FilterBar({ prefs, rows, searchRef, updatePrefs, styles }: Props) {
  const { filters } = prefs;
  const [viewName, setViewName] = useState("");
  const set = (patch: Partial<Filters>) => updatePrefs({ filters: { ...filters, ...patch } });
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const areas = [...new Set(rows.map((row) => row.area))].sort();
  const views = [...DEFAULT_VIEWS, ...prefs.savedViews];

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.wrap}>
        <Text style={styles.muted}>View:</Text>
        {views.map((view) => (
          <Chip
            key={view.name}
            label={view.name}
            active={JSON.stringify(view.filters) === JSON.stringify(filters)}
            onPress={() => updatePrefs({ filters: view.filters, ...(view.range ? { range: view.range } : {}) })}
            styles={styles}
          />
        ))}
        <TextInput value={viewName} onChangeText={setViewName} placeholder="name" placeholderTextColor={styles.colors.foregroundMuted} style={[styles.input, { minWidth: 90 }]} />
        <Chip
          label="+ save"
          active={false}
          onPress={() => {
            const name = viewName.trim();
            if (!name) return;
            updatePrefs({ savedViews: [...prefs.savedViews.filter((view) => view.name !== name), { name, filters, range: prefs.range }] });
            setViewName("");
          }}
          styles={styles}
        />
        {prefs.savedViews.some((view) => view.name === viewName.trim()) ? (
          <Chip label="− delete" active={false} onPress={() => updatePrefs({ savedViews: prefs.savedViews.filter((view) => view.name !== viewName.trim()) })} styles={styles} />
        ) : null}
      </View>

      <View style={styles.wrap}>
        <TextInput
          ref={searchRef}
          value={filters.text}
          onChangeText={(text) => set({ text })}
          placeholder="Search (/)"
          placeholderTextColor={styles.colors.foregroundMuted}
          style={styles.input}
        />
        {SIDES.map((side) => (
          <Chip key={side} label={side} active={filters.sides.includes(side)} onPress={() => set({ sides: toggle(filters.sides, side) })} styles={styles} />
        ))}
        <Text style={styles.muted}> Release</Text>
        {RELEASES.map((release) => (
          <Chip key={release} label={release} active={filters.release === release} onPress={() => set({ release })} styles={styles} />
        ))}
        <Text style={styles.muted}> Ticket</Text>
        {TICKETS.map(({ value, label }) => (
          <Chip key={value} label={label} active={filters.ticket === value} onPress={() => set({ ticket: value })} styles={styles} />
        ))}
        <Text style={styles.muted}> events ≥</Text>
        <TextInput
          value={filters.minEvents ? String(filters.minEvents) : ""}
          onChangeText={(text) => set({ minEvents: Number(text) || 0 })}
          keyboardType="numeric"
          style={[styles.input, { minWidth: 44 }]}
        />
        {filters.cell ? <Chip label="✕ heatmap cell" active onPress={() => set({ cell: null })} styles={styles} /> : null}
        {JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS) ? null : <Chip label="✕ clear all" active={false} onPress={() => set(DEFAULT_FILTERS)} styles={styles} />}
      </View>

      {areas.length > 1 ? (
        <View style={styles.wrap}>
          <Text style={styles.muted}>Area</Text>
          {areas.map((area) => (
            <Chip key={area} label={area} active={filters.areas.includes(area)} onPress={() => set({ areas: toggle(filters.areas, area) })} styles={styles} />
          ))}
        </View>
      ) : null}

    </View>
  );
}

function Chip({ label, active, onPress, styles }: { label: string; active: boolean; onPress: () => void; styles: Styles }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text style={active ? styles.chipActive : styles.chip}>{label}</Text>
    </Pressable>
  );
}
