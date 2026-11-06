const AREAS: [fragment: string, area: string][] = [
  ["/timesheet", "Time"],
  ["/adjustment", "Time"],
  ["/expense", "Expenses"],
  ["/leave", "Leaves"],
  ["/shift", "Shifts"],
  ["/scheduler", "Shifts"],
  // Before "/employee": "/employee-compensations" and "/employee-payments" are compensation, not employee.
  ["compensation", "Compensation"],
  ["employee-payment", "Compensation"],
  ["employee_payment", "Compensation"],
  ["/employee/payment", "Compensation"],
  ["social-charges", "Compensation"],
  ["social_charges", "Compensation"],
  ["/employee", "Employee"],
  ["/review", "Reviews"],
  ["/workflow", "Workflows"],
  ["/document", "Documents"],
  ["/dashboard", "Dashboard"],
  ["/integration", "Integrations"],
];

/** Short Sentry project name: "roger-public-api-prod" → "public-api", "roger-integration-abacus-dev" → "abacus". */
export const serviceOf = (project: string) => project.replace(/^roger-(integration-)?/, "").replace(/-(prod|dev)$/, "");

/** The first path that names an area wins. Pass the endpoint before the top frame: that frame is often a shared filter or repository. */
export function areaOf(...paths: string[]): string {
  for (const path of paths) {
    const lower = path.toLowerCase();
    const area = AREAS.find(([fragment]) => lower.includes(fragment))?.[1];
    if (area) return area;
  }
  return "Other";
}
