import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { serviceOf } from "../shared/areas";

export type Colors = PluginSurfaceProps["theme"]["colors"];
export type Styles = ReturnType<typeof createStyles>;

/** Widths shared by the column header and the rows, so the numbers line up. */
export const COLUMN = { trend: 64, count: 60, owner: 110, actions: 146 };

// Paseo's theme has no blue (its accent is green): fixed colours for the quiet count and the FE↔BE link.
const QUIET_BLUE = "#3b82f6";
const LINK_VIOLET = "#8b5cf6";

// One colour per service, dark enough for white text; all integrations share one.
const SERVICE_COLORS: Record<string, string> = {
  frontend: "#0891b2",
  "customer-api": "#4f46e5",
  "public-api": "#c026d3",
  "customer-mcp": "#0d9488",
  notification: "#b45309",
};
const INTEGRATION_COLOR = "#4d7c0f";
const OTHER_SERVICE_COLOR = "#475569";

export const serviceColor = (project: string) =>
  SERVICE_COLORS[serviceOf(project)] ?? (project.includes("integration") ? INTEGRATION_COLOR : OTHER_SERVICE_COLOR);

const BUSY_EVENTS = 100;
const NOTABLE_EVENTS = 20;

/** Pill colour for an event count: red when busy, orange when notable, accent otherwise. */
export const eventsColor = (colors: Colors, count: number) =>
  count >= BUSY_EVENTS ? colors.statusDanger : count >= NOTABLE_EVENTS ? colors.statusWarning : QUIET_BLUE;

export function createStyles(colors: Colors, compact: boolean) {
  const chip = {
    fontSize: 12,
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden" as const,
    borderWidth: 1,
  };
  const row = { flexDirection: "row" as const, alignItems: "center" as const };
  return {
    colors,
    screen: { flex: 1, backgroundColor: colors.surface0 },
    // Everything above the issue list stays put; only the list scrolls.
    fixed: { paddingHorizontal: compact ? 12 : 20, paddingTop: compact ? 12 : 16, gap: 10 },
    list: { flex: 1 },
    listContent: { paddingHorizontal: compact ? 12 : 20, paddingBottom: 20, gap: 0 },
    columnHeader: { ...row, gap: 10, paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    columnLabel: { color: colors.foregroundMuted, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5 },
    tooltip: {
      position: "absolute" as const,
      bottom: "100%" as const,
      right: 0,
      marginBottom: 4,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 4,
      minWidth: 150,
      backgroundColor: colors.foreground,
      zIndex: 10,
    },
    tooltipText: { color: colors.surface0, fontSize: 11 },
    row,
    wrap: { ...row, flexWrap: "wrap" as const, gap: 6 },
    header: { ...row, gap: 10, flexWrap: "wrap" as const },
    title: { color: colors.foreground, fontSize: 18, fontWeight: "600" as const },
    text: { color: colors.foreground, fontSize: 13 },
    strong: { color: colors.foreground, fontSize: 13, fontWeight: "600" as const },
    muted: { color: colors.foregroundMuted, fontSize: 12 },
    label: { color: colors.foregroundMuted, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: 0.5 },
    error: { color: colors.statusDanger, fontSize: 12 },
    warning: { color: colors.statusWarning, fontSize: 12 },
    banner: { borderWidth: 1, borderColor: colors.statusWarning, borderRadius: 6, padding: 8, gap: 4 },
    bannerDanger: { borderWidth: 1, borderColor: colors.statusDanger, borderRadius: 6, padding: 8, gap: 4 },
    button: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 },
    buttonPrimary: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, backgroundColor: colors.accent },
    // Same width for every icon button, so action columns line up whatever the glyph.
    iconButton: { width: 32, paddingHorizontal: 0, alignItems: "center" as const },
    buttonText: { color: colors.foreground, fontSize: 12 },
    buttonPrimaryText: { color: colors.accentForeground, fontSize: 12, fontWeight: "600" as const },
    disabled: { opacity: 0.5 },
    chip: { ...chip, color: colors.foregroundMuted, borderColor: colors.border, backgroundColor: colors.surface1 },
    chipActive: { ...chip, color: colors.accentForeground, borderColor: colors.accent, backgroundColor: colors.accent },
    badge: { ...chip, fontSize: 11, paddingVertical: 0, color: colors.foregroundMuted, borderColor: colors.border },
    badgeWarning: { ...chip, fontSize: 11, paddingVertical: 0, color: colors.statusWarning, borderColor: colors.statusWarning },
    badgeDanger: { ...chip, fontSize: 11, paddingVertical: 0, color: colors.statusDanger, borderColor: colors.statusDanger },
    panel: { backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, gap: 8 },
    tabs: { ...row, flexWrap: "wrap" as const, borderBottomWidth: 1, borderBottomColor: colors.border },
    tab: { paddingVertical: 6, paddingHorizontal: 10 },
    tabActive: { paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 2, borderBottomColor: colors.accent },
    tabText: { color: colors.foregroundMuted, fontSize: 13 },
    tabTextActive: { color: colors.foreground, fontSize: 13, fontWeight: "600" as const },
    issue: { ...row, gap: 10, paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    issueSelected: { backgroundColor: colors.surface2 },
    issueMain: { flex: 1, gap: 2, minWidth: 0 },
    count: { width: COLUMN.count, alignItems: "flex-end" as const },
    countPill: { minWidth: 34, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10, overflow: "hidden" as const, textAlign: "center" as const, fontSize: 12, fontWeight: "700" as const, color: "#fff" },
    serviceBadge: { ...chip, fontSize: 11, paddingVertical: 0, fontWeight: "600" as const, color: "#fff", borderColor: "transparent" },
    linkBadge: { ...chip, fontSize: 11, paddingVertical: 0, fontWeight: "600" as const, color: "#fff", borderColor: LINK_VIOLET, backgroundColor: LINK_VIOLET },
    groupBadge: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10, overflow: "hidden" as const, fontSize: 11, fontWeight: "700" as const, marginRight: 6, color: colors.accentForeground, backgroundColor: colors.accent },
    owner: { width: COLUMN.owner },
    actions: { ...row, width: COLUMN.actions, justifyContent: "flex-end" as const },
    detail: { paddingTop: 10, paddingHorizontal: 14, gap: 12, flexDirection: (compact ? "column" : "row") as "column" | "row" },
    detailColumn: { flex: 1, gap: 3 },
    detailBox: { borderLeftWidth: 3, borderLeftColor: colors.accent, backgroundColor: colors.surface1, paddingBottom: 10, gap: 8 },
    linkedCard: { marginHorizontal: 14, padding: 10, gap: 3, borderRadius: 6, borderWidth: 1, borderColor: LINK_VIOLET, backgroundColor: colors.surface0 },
    code: { color: colors.foreground, fontSize: 12, fontFamily: "monospace" },
    input: { color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, minWidth: 160 },
    spark: { ...row, alignItems: "flex-end" as const, height: 18, width: 64, gap: 1 },
    kbd: { color: colors.foregroundMuted, fontSize: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 4 },
  };
}
