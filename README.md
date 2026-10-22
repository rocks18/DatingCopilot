# Pairwise

Pairwise is a persistent, local-first dating agent for macOS. It turns a one-time preference brief into structured criteria, connects to the visible Bumble Web profile through an included Chrome extension, evaluates compatibility locally, executes Like or Pass, and records the result in a persistent journal.

## What works

- One-time onboarding with natural-language interpretation and explicit confirmation.
- Editable partner preferences, strict/balanced/exploratory policy, and configurable weights.
- Deterministic scoring with separate deal-breaker checks, unknown evidence, confidence, and plain-English explanations.
- User-provided bio, prompt, interest, lifestyle, communication, and value analysis.
- Browser-local photo quality checks for resolution, brightness, contrast, sharpness, and variety. Photo files are not saved.
- Persistent SQLite journal for candidates, assistant decisions, user decisions, jobs, and privacy-safe activity events.
- Duplicate prevention, restart recovery, pause/resume, exponential retry state, and health reporting.
- JSON backup, restore, and local reset.
- A Chrome Manifest V3 browser controller that extracts the visible profile, requests a local decision, clicks Like or Pass, and continues until paused, limited, or blocked by a page error.
- Manual-input and simulation adapters remain available for testing and corrections.
- Light/dark themes and responsive desktop/mobile layouts.

## Requirements

- macOS (the app is designed and browser-tested for macOS-friendly local use)
- Node.js 24 or newer; the verified environment used Node.js 26.9.0
- npm 11+
- Chrome if you want to run the included Playwright browser test

## Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `npm run dev` starts both the Next.js app and the durable local worker. Preferences are requested only when no confirmed configuration exists.

## Connect Bumble Web

1. Start Pairwise with `npm run dev` and complete the one-time preference setup.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**, choose **Load unpacked**, and select:

   ```text
   /Users/raghav/datingCopilot/browser-extension
   ```

4. Open Bumble Web and navigate to its profile queue.
5. Click the **Pairwise Dating Agent** extension, choose the number of profiles for the run, and press **Start agent**.

The extension stops if Pairwise is paused, the run limit is reached, the local server disconnects, the visible profile cannot be read, or a Like/Pass control cannot be found. It does not copy the Bumble password, session cookies, or authentication tokens into Pairwise.

For a production build:

```bash
npm run build
npm start
```

## Data location and privacy

The default database is `.data/pairwise.sqlite`. SQLite WAL files may appear next to it while the app is running. Override the location with:

```bash
PAIRWISE_DB_PATH=/absolute/path/to/pairwise.sqlite npm run dev
```

- The database is local and excluded from Git.
- Photo files stay in the browser; only numerical quality metrics and non-sensitive observations reach the local server.
- Activity records use generic event text and exclude candidate names, bios, prompts, and photo content.
- No external AI provider is enabled. The local engine is the default and complete fallback.
- Backups contain preferences, user-provided candidate inputs, and user decisions. They do not contain original photo files.

## Decision model

The default weighted dimensions are:

| Dimension | Default |
| --- | ---: |
| Relationship intentions | 25% |
| Shared interests | 20% |
| Lifestyle | 20% |
| Communication | 15% |
| Values and priorities | 20% |

Known dimensions are normalized across their configured weights. Missing dimensions remain unknown and are excluded from the aggregate. Confidence combines weighted evidence coverage with the share of explicit versus text-derived evidence. Confirmed deal-breaker conflicts override the aggregate score.

The engine produces one of four assistant assessments:

- Strong potential match
- Possible match
- Insufficient information
- Does not meet stated criteria

These labels are the assistant's assessment of supplied information, not a claim about another person's actual feelings, character, or intent.

## Commands

```bash
npm test          # Vitest service, persistence, recovery, privacy, and adapter tests
npm run lint      # ESLint
npm run typecheck # TypeScript without emitting files
npm run build     # Optimized Next.js production build
npm run test:e2e  # Playwright onboarding-to-demo browser flow
```

## Backup and restore

Use **Settings & privacy → Export backup** before moving or resetting the workspace. Restore the JSON file from the same screen. Imports are validated, duplicate candidates are ignored, and new work is queued through the same recovery-safe pipeline.

## Troubleshooting

- **Port 3000 is busy:** run `npm run dev:web -- -p 3001` for the UI and `npm run worker` in another terminal, then open port 3001.
- **A candidate is queued:** make sure the worker process is running. Restarting `npm run dev` recovers interrupted jobs automatically.
- **The agent is paused:** use the status control in the top-right corner to resume it.
- **A profile says insufficient information:** supply or correct explicit evidence. Unknown fields are intentionally not guessed.
- **A photo is rejected:** use JPEG, PNG, or WebP under 10 MB. HEIC is not currently decoded.
- **SQLite cannot open:** make sure the directory in `PAIRWISE_DB_PATH` is writable and only use a local filesystem path.
- **Extension says Pairwise is offline:** keep `npm run dev` running on port 3000, then reload the Bumble tab.
- **Extension says it cannot find Like/Pass:** leave the Bumble profile queue visible. If Bumble changed its controls, the bridge stops instead of clicking an uncertain element.
- **Browser connection is not shown:** open the Bumble tab and the Pairwise extension; the dashboard updates within five seconds after the extension heartbeat.

## Architecture and research

- [Repository assessment](docs/REPOSITORY_ASSESSMENT.md)
- [Architecture and adapter contract](docs/ARCHITECTURE.md)

No code from the inspected Bumble automation repositories was copied into Pairwise. The included browser controller is a clean local implementation. Its extraction and action loop is tested against a local Bumble-shaped fixture; an authenticated live-account run still needs to be verified from the user’s own Bumble session because no account credentials are stored in this project.
# DatingCopilot
