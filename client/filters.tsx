import { useState, type ReactNode, type RefObject } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { DEFAULT_VIEWS } from "../shared/filter";
import { DEFAULT_FILTERS, SIDES, type Filters, type IssueRow, type Prefs } from "../shared/model";
import { serviceOf } from "../shared/areas";
import { serviceColor, type Styles } from "./styles";

const RELEASES: { value: Filters["release"]; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "current", label: "Current" },
  { value: "older", label: "Older" },
];
const TICKETS: { value: Filters["ticket"]; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "hasRp", label: "Has RP" },
  { value: "noRp", label: "No RP" },
  { value: "rpDone", label: "RP done" },
];
const ORIGINS: { value: Filters["origin"]; label: string }[] = [
  { value: "any", label: "All" },
  { value: "browser", label: "Browser" },
  { value: "script", label: "Script" },
];
const LABEL_WIDTH = 72;

type Props = {
  prefs: Prefs;
  rows: IssueRow[];
  searchRef: RefObject<TextInput | null>;
  updatePrefs: (patch: Partial<Prefs>) => void;
  styles: Styles;
};

export function FilterBar({ prefs, rows, searchRef, updatePrefs, styles }: Props) {
  const { filters } = prefs;
  const [viewName, setViewName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Filters>) => updatePrefs({ filters: { ...filters, ...patch } });
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const areas = [...new Set(rows.map((row) => row.area))].sort();
  const projects = [...new Set(rows.map((row) => row.project))].sort();
  const environments = [...new Set(rows.flatMap((row) => row.environments))].sort();
  const activeCount = (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).filter((key) => JSON.stringify(filters[key]) !== JSON.stringify(DEFAULT_FILTERS[key])).length;
  const saveView = () => {
    const name = viewName?.trim();
    if (name) updatePrefs({ savedViews: [...prefs.savedViews.filter((view) => view.name !== name), { name, filters, range: prefs.range }] });
    setViewName(null);
  };

  return (
    <View style={{ gap: 6 }}>
      <FilterRow label="Search" styles={styles}>
        <TextInput
          ref={searchRef}
          value={filters.text}
          onChangeText={(text) => set({ text })}
          placeholder="Title, short id or culprit  ( / )"
          placeholderTextColor={styles.colors.foregroundMuted}
          style={[styles.input, { flexGrow: 1, maxWidth: 420 }]}
        />
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)}>
          <Text style={open || activeCount > 0 ? styles.chipActive : styles.chip}>{`${open ? "▾" : "▸"} Filters${activeCount > 0 ? ` · ${activeCount} active` : ""}`}</Text>
        </Pressable>
        {filters.cell ? <Chip label="✕ Heatmap cell" active onPress={() => set({ cell: null })} styles={styles} /> : null}
        {activeCount > 0 ? <Chip label={`✕ Clear ${activeCount} filter${activeCount > 1 ? "s" : ""}`} active={false} onPress={() => set(DEFAULT_FILTERS)} styles={styles} /> : null}
      </FilterRow>
      {!open && activeCount > 0 ? (
        <FilterRow label="" styles={styles}>
          <Text style={styles.muted} numberOfLines={1}>
            {summaryOf(filters).join("  ·  ")}
          </Text>
        </FilterRow>
      ) : null}
      {open ? (
        <>
          <FilterRow label="Views" styles={styles}>
            {[...DEFAULT_VIEWS, ...prefs.savedViews].map((view) => {
              const saved = prefs.savedViews.includes(view);
              return (
                <View key={view.name} style={{ flexDirection: "row", alignItems: "center" }}>
                  <Chip
                    label={view.name}
                    active={JSON.stringify(view.filters) === JSON.stringify(filters)}
                    onPress={() => updatePrefs({ filters: view.filters, ...(view.range ? { range: view.range } : {}) })}
                    styles={styles}
                  />
                  {saved ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Delete view ${view.name}`} onPress={() => updatePrefs({ savedViews: prefs.savedViews.filter((item) => item !== view) })}>
                      <Text style={[styles.muted, { paddingHorizontal: 4 }]}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {viewName === null ? (
              <Pressable accessibilityRole="button" onPress={() => setViewName("")}>
                <Text style={[styles.muted, { textDecorationLine: "underline" }]}>+ Save current filters…</Text>
              </Pressable>
            ) : (
              <>
                <TextInput autoFocus value={viewName} onChangeText={setViewName} onSubmitEditing={saveView} placeholder="View name" placeholderTextColor={styles.colors.foregroundMuted} style={[styles.input, { minWidth: 120 }]} />
                <Chip label="Save" active onPress={saveView} styles={styles} />
                <Chip label="Cancel" active={false} onPress={() => setViewName(null)} styles={styles} />
          </>
        )}
      </FilterRow>


      <MultiRow label="Side" options={SIDES.map((side) => ({ value: side, label: side }))} selected={filters.sides} onChange={(sides) => set({ sides })} toggle={toggle} styles={styles} />
      <SingleRow label="Release" options={RELEASES} value={filters.release} onChange={(release) => set({ release })} styles={styles} />
      <SingleRow label="Ticket" options={TICKETS} value={filters.ticket} onChange={(ticket) => set({ ticket })} styles={styles} />
      <SingleRow label="Origin" hint="customer-api only" options={ORIGINS} value={filters.origin} onChange={(origin) => set({ origin })} styles={styles} />
      {projects.length > 1 ? (
        <MultiRow
          label="Service"
          options={projects.map((project) => ({ value: project, label: serviceOf(project), color: serviceColor(project) }))}
          selected={filters.projects}
          onChange={(projects) => set({ projects })}
          toggle={toggle}
          styles={styles}
        />
      ) : null}
      {environments.length > 1 ? (
        <MultiRow label="Env" options={environments.map((environment) => ({ value: environment, label: environment }))} selected={filters.environments} onChange={(environments) => set({ environments })} toggle={toggle} styles={styles} />
      ) : null}
      {areas.length > 1 ? (
        <MultiRow label="Area" options={areas.map((area) => ({ value: area, label: area }))} selected={filters.areas} onChange={(areas) => set({ areas })} toggle={toggle} styles={styles} />
      ) : null}
      <FilterRow label="Events" styles={styles}>
        <Text style={styles.muted}>at least</Text>
        <TextInput
          value={filters.minEvents ? String(filters.minEvents) : ""}
          onChangeText={(text) => set({ minEvents: Number(text) || 0 })}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={styles.colors.foregroundMuted}
          style={[styles.input, { minWidth: 56 }]}
        />
      </FilterRow>
        </>
      ) : null}
    </View>
  );
}

/** One short phrase per active filter, for the collapsed panel. */
function summaryOf(filters: Filters): string[] {
  const label = <T extends string>(options: { value: T; label: string }[], value: T) => options.find((option) => option.value === value)?.label ?? value;
  return [
    filters.sides.length > 0 ? `Side ${filters.sides.join(", ")}` : null,
    filters.release !== "any" ? `Release ${label(RELEASES, filters.release).toLowerCase()}` : null,
    filters.ticket !== "any" ? label(TICKETS, filters.ticket) : null,
    filters.origin !== "any" ? `Origin ${label(ORIGINS, filters.origin).toLowerCase()}` : null,
    filters.projects.length > 0 ? `Service ${filters.projects.map(serviceOf).join(", ")}` : null,
    filters.environments.length > 0 ? `Env ${filters.environments.join(", ")}` : null,
    filters.areas.length > 0 ? `Area ${filters.areas.join(", ")}` : null,
    filters.minEvents > 0 ? `≥ ${filters.minEvents} events` : null,
    filters.text.trim() ? `"${filters.text.trim()}"` : null,
    filters.cell ? "Heatmap cell" : null,
  ].filter((part) => part !== null);
}

function FilterRow({ label, hint, children, styles }: { label: string; hint?: string; children: ReactNode; styles: Styles }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <Text style={[styles.label, { width: LABEL_WIDTH, paddingTop: 5 }]}>{label}</Text>
      <View style={[styles.wrap, { flex: 1, alignItems: "center" }]}>
        {children}
        {hint ? <Text style={[styles.muted, { fontStyle: "italic" }]}>{hint}</Text> : null}
      </View>
    </View>
  );
}

function SingleRow<T extends string>(props: { label: string; hint?: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; styles: Styles }) {
  return (
    <FilterRow label={props.label} hint={props.hint} styles={props.styles}>
      {props.options.map(({ value, label }) => (
        <Chip key={value} label={label} active={props.value === value} onPress={() => props.onChange(value)} styles={props.styles} />
      ))}
    </FilterRow>
  );
}

/** Nothing selected means everything: the "All" chip says so and clears the selection. */
function MultiRow<T extends string>(props: {
  label: string;
  options: { value: T; label: string; color?: string }[];
  selected: T[];
  onChange: (selected: T[]) => void;
  toggle: (list: T[], value: T) => T[];
  styles: Styles;
}) {
  return (
    <FilterRow label={props.label} styles={props.styles}>
      <Chip label="All" active={props.selected.length === 0} onPress={() => props.onChange([])} styles={props.styles} />
      {props.options.map(({ value, label, color }) => (
        <Chip key={value} label={label} color={color} active={props.selected.includes(value)} onPress={() => props.onChange(props.toggle(props.selected, value))} styles={props.styles} />
      ))}
    </FilterRow>
  );
}

function Chip({ label, active, color, onPress, styles }: { label: string; active: boolean; color?: string; onPress: () => void; styles: Styles }) {
  const colored = color ? (active ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: color }) : null;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}>
      <Text style={[active ? styles.chipActive : styles.chip, colored]}>{label}</Text>
    </Pressable>
  );
}
