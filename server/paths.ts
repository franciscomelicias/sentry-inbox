import { homedir } from "node:os";
import { join } from "node:path";

// Functions, not constants: tests point the env vars at a tmp dir per test.
export const stateDir = () => process.env.SENTRY_INBOX_HOME ?? join(homedir(), ".sentry-inbox");
export const cacheDir = () => process.env.SENTRY_INBOX_CACHE ?? join(homedir(), ".cache", "sentry-inbox");

export const rulesPath = () => join(stateDir(), "rules.json");
export const triagePath = () => join(stateDir(), "triage.json");
