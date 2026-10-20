import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

export type Colors = PluginSurfaceProps["theme"]["colors"];
export type Styles = ReturnType<typeof createStyles>;

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
    content: { padding: compact ? 12 : 20, gap: 12 },
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
    count: { width: 56, alignItems: "flex-end" as const },
    detail: { paddingVertical: 10, paddingHorizontal: 14, borderLeftWidth: 3, borderLeftColor: colors.accent, backgroundColor: colors.surface1, gap: 12, flexDirection: (compact ? "column" : "row") as "column" | "row" },
    detailColumn: { flex: 1, gap: 3 },
    input: { color: colors.foreground, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, minWidth: 160 },
    spark: { ...row, alignItems: "flex-end" as const, height: 18, width: 64, gap: 1 },
    kbd: { color: colors.foregroundMuted, fontSize: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 4 },
  };
}
