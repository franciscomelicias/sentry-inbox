const AREAS: [fragment: string, area: string][] = [
  ["/timesheet", "Time"],
  ["/adjustment", "Time"],
  ["/expense", "Expenses"],
  ["/leave", "Leaves"],
  ["/shift", "Shifts"],
  ["/scheduler", "Shifts"],
  ["/employee", "Employee"],
  ["/review", "Reviews"],
  ["/workflow", "Workflows"],
  ["/document", "Documents"],
  ["/dashboard", "Dashboard"],
  ["/integration", "Integrations"],
];

export function areaOf(path: string): string {
  const lower = path.toLowerCase();
  return AREAS.find(([fragment]) => lower.includes(fragment))?.[1] ?? "Other";
}
