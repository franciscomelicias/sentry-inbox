# sentry-inbox: Paseo plugin

A triage screen for RogerHR's production Sentry errors. Open **Sentry inbox** in the Paseo sidebar.

- Hides what we consider normal: **known** errors (rules), **stale frontends** (every sampled event sent from an older FE
  bundle after the current release went live, or chunk-load errors), and frontend errors already shown in their backend row. Hidden is never silent: the
  **Hidden** tab lists every rule with its hit count, flags rules with 0 hits in 30 days as dead, and shows invalid ones.
- A known error that **spikes** (last 24h > 10× its 14-day daily median and ≥ 20) comes back with a "known, but spiking" badge.
- Tabs: **New** · **Regressed** · **Spiking** · **Ongoing** · **Known but ugly** (known, but still a raw error for the user)
  · **Fix didn't work** (RP done and released, still happening on that release or later) · **Hidden**.
- **Since last deploy** is the default range; also 24h / 7d / 14d.
- **prod / dev** switch in the header: dev reads every `-dev` project across the staging, test and preprod environments
  at once; an **Environment** filter then narrows to one of them (it only shows when the rows span more than one).
- **FE+BE linked** by RequestId (`ROGERHR-REQUEST-ID` on both sides): a small violet `⇄ BE` / `⇄ FE` badge on the row; the expanded row shows the other side as a card (title, endpoint, file:line, events, realms, matched RequestIds) with its own 🔍 and ↗. Groups say how many members have a trace.
- **↗** opens the issue in Sentry.
- **Realms impacted** (from the latest 20 events per issue), owner hint from `git blame` of the line that threw.
- **Graphs** (`g`, closed on open; their data only loads once you open them): new issues and realms since deploy, events/hour before vs after the deploy, per-area before/after,
  7-day hourly bars with release markers, and an error × day heatmap (tap a cell to filter).
- **Identical errors are grouped**: same side + same message = one line (▸ ×N, summed events and realms); open it to see each Sentry issue, 🙈 hides or marks all of them with one rule on the exact message.
- **Filters** and **saved views**: side, area, release (current/older), customer-api origin (all/browser/script), ticket, events ≥ N, search.
- **Origin** (customer-api only): an event is from a browser when it carries `ROGERHR-FRONTEND-VERSION`, else from a script.
  A row gets a `🤖 script` badge (or `🤖 script + browser`) from its sampled events; unauthenticated requests count as script.
- **🙈 Hide…**: this issue, every exception of that type, a realm, snooze 7 days, until next release, until > N/day,
  mark as known, mark as known but ugly.
- **🔍 Investigate**: opens a new read-only Opus chat in the "Sentry inbox" workspace (lead:sentry's; pin it once in the sidebar) that writes its verdict and repro steps into
  `triage.json`; the verdict then shows in the expanded row.
- **🎫 Ticket**: asks lead:sentry to run `/create-ticket` for the issue (with the verdict), then the RP shows on the row.
- **💬 lead:sentry**: a long-lived agent (created on first click, labelled `source: sentry-inbox-lead`) that owns the
  judgement calls. Ask in plain words: "hide all demo realms", "PayrollLocked on adjustments is known, RP-1234".
- Keys: `j`/`k` move, `o` expand, `i i` investigate, `t t` ticket (press twice: they start agents), `h`/`u` hide menu, `g` graphs, `/` search, `?` help.

The plugin only **reads** Sentry and Jira; it never writes to Sentry.

## Requirements

- Paseo ≥ 0.10.3 with plugins enabled, Node.js and npm.
- A **Sentry auth token** with `org:read`, `project:read`, `event:read` (Sentry → Settings → Auth Tokens), either:
  - `SENTRY_AUTH_TOKEN` in the Paseo daemon's environment, or
  - a Keychain item: `security add-generic-password -s sentry-inbox -a token -w <token>`
- Optional, for RP statuses and "Fix didn't work": the Jira credentials paseo-board-dev uses (`JIRA_EMAIL` +
  `JIRA_API_TOKEN`, or Keychain service `paseo-board-jira` with accounts `email` and `token`).
- The roger-platform checkout at `/Users/franciscomelicias/Documents/roger-platform` (agents' cwd, `git blame`).

## Install

```bash
cd ~/paseo-plugins/sentry-inbox
npm install
npm run typecheck && npm test
paseo plugin install ~/paseo-plugins/sentry-inbox
paseo plugin ls        # sentry-inbox must be "running"
```

## Update / debug

- After editing: `paseo plugin reload sentry-inbox`. Logs: `paseo plugin logs sentry-inbox`.
- Shared state (screen + lead:sentry), `~/.sentry-inbox/`:
  - `rules.json`: hide/known/ugly/snooze rules. The screen refuses to write it while it doesn't parse.
  - `triage.json`: investigation verdicts and RP keys, keyed by Sentry issue id.
- Cache, `~/.cache/sentry-inbox/`: `prefs.json` (range, tab, filters, views), `inbox.json` (last good inbox, served
  with a "stale" banner when Sentry is rate-limited or down), `facts/<issueId>.json` (sampled events, refetched only
  when the issue's lastSeen moves).
- The first load samples 20 events for every unresolved prod issue (≤ 200 issues); later loads only refetch changed issues.
- Override the dirs with `SENTRY_INBOX_HOME` / `SENTRY_INBOX_CACHE`. `SENTRY_INBOX_FAKE_429=1` simulates a rate limit.
- Tuning lives in code: spike thresholds and stale-FE messages in `server/classify.ts`, area table in `shared/areas.ts`,
  caps in `server/sentry.ts` / `server/inbox.ts`, agent model in `client/agents.ts`.
