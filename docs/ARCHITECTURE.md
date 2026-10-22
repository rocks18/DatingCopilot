# Architecture

## Runtime shape

```text
Chrome extension on Bumble Web
  ├─ extracts the currently visible profile
  ├─ sends it to the local bridge API
  ├─ executes the returned Like or Pass action
  └─ stops on pause, run limit, disconnect, or uncertain controls
          │
          ▼
Browser UI
  ├─ one-time onboarding and preference editor
  ├─ manual/simulated candidate input
  ├─ browser-local photo metric extraction
  └─ journal, decisions, integrations, privacy controls
          │
          ▼
Next.js route handlers (typed + Zod validated)
          │
          ├─ deterministic preference parser
          ├─ factual/text-derived profile analyzer
          ├─ compatibility and confidence engine
          ├─ browser bridge heartbeat and evaluation routes
          └─ platform-independent adapter contract
          │
          ▼
SQLite (.data/pairwise.sqlite)
  ├─ preferences
  ├─ candidates and user decisions
  ├─ assistant decision snapshots
  ├─ retryable jobs
  ├─ generic activity events
  ├─ browser bridge state and action counters
  └─ runtime state
          ▲
          │
Durable local worker
  ├─ restart recovery
  ├─ duplicate prevention
  ├─ exponential retry scheduling
  └─ pause/resume and heartbeat
```

## Trust boundaries

- The browser owns original photo bytes. It submits only validated numerical metrics and observations.
- Route handlers validate all writes with Zod before they reach SQLite.
- The worker and request-time processing use the same deterministic services.
- The activity log records event categories and counts, not candidate text.
- External AI is absent by default. A future provider must remain server-only and require explicit consent before personal data is sent.
- The browser bridge accepts requests only with the extension-specific header. CORS responses are limited to Chrome extension origins.
- The extension reads only the visible page and does not submit passwords, cookies, or authentication tokens to Pairwise.
- The final click is performed only after the deterministic local engine returns `like` or `pass`; missing or ambiguous page controls stop the loop.

## Adapter contract

`DatingPlatformAdapter` defines:

- `checkCapabilities()`
- `receiveAuthorizedCandidate(input)`
- `recordRecommendation(candidateId, decision)`
- `recordUserDecision(candidateId, decision)`
- `health()`

`ManualInputAdapter` validates and normalizes user-supplied candidates. `BumbleWebAdapter` represents the installed controller, while the extension heartbeat determines whether the live browser connection is actually present. Browser lifecycle remains separate from compatibility logic: `evaluateBrowserCandidate` normalizes visible text, applies the same scorer used elsewhere, journals the decision, and returns one explicit action.

## Scoring invariants

1. Explicit deal-breaker conflicts are evaluated before the final label.
2. Missing information is `null`/unknown, never zero.
3. Known dimensions are normalized across their known configured weights.
4. Confidence is bounded to 0–1 and reflects evidence coverage and evidence type.
5. The engine is deterministic; there is no random fallback.
6. Photo metrics never create personality, intent, value, or protected-characteristic facts.
7. Browser actions and user-entered decisions are stored separately from assistant assessments.

## Browser run lifecycle

1. The popup starts a bounded run and the content script sends a heartbeat.
2. Visible headings and page text are normalized into candidate facts and text signals.
3. The bridge queues the candidate through the existing duplicate-safe journal and runs the deterministic scorer.
4. `Strong potential match` and `Possible match` return `like`; the other two labels return `pass`.
5. The extension locates a visible, explicitly labeled Like or Pass control and clicks it.
6. It confirms the profile changed before processing again. Any uncertain state stops the run with a visible error.

## Recovery model

Candidates are inserted with a content fingerprint and a unique job key. Re-submission returns the existing record instead of processing twice. A worker takes due jobs, writes a versioned decision snapshot, and records only generic activity. On startup, any `processing` job is moved back to `queued`. Transient failures increment attempts and schedule the next run at `2^attempts` seconds; terminal failures retain a recovery message.

The API also processes due work immediately after a candidate submission. This keeps the app functional when the standalone worker is temporarily unavailable while preserving the same durable queue semantics.
