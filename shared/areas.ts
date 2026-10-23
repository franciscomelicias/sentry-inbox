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

/** Short Sentry project name: "roger-public-api-prod" → "public-api", "roger-integration-abacus-prod" → "abacus". */
export const serviceOf = (project: string) => project.replace(/^roger-(integration-)?/, "").replace(/-prod$/, "");

export function areaOf(path: string): string {
  const lower = path.toLowerCase();
  return AREAS.find(([fragment]) => lower.includes(fragment))?.[1] ?? "Other";
}
