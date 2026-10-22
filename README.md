# DatingCopilot (Pairwise)

A private, local-first dating assistant and autonomous copilot for macOS. It turns a natural-language preference brief into structured evaluation criteria, connects to **Bumble** (via native Android emulator / USB device automation or Chrome extension), evaluates compatibility locally, executes Like or Pass, and records candidates in a private SQLite journal.

---

## Key Features

- **Native Android Automation (ADB)**:
  - Direct integration with Android emulators or physical Android devices over USB/Wi-Fi using ADB.
  - Automatic detection of Bumble app in the foreground.
  - **Dynamic End-to-End Profile Scrolling**: Automatically scrolls through the full candidate card, capturing every section (bio, questions, interests, badges, and lifestyle) down to the bottom footer.
  - **Automated High-Res Photo Extraction**: Crops clean, deduplicated profile portraits from full-screen phone screenshots and saves them locally.
  - **Symmetrical Card Reset**: Smoothly scrolls back up to the top hero view before confirming and executing a natural Like/Pass swipe.
  - **Continuous Unlimited Mode**: Uninterrupted autonomous swiping across your full Bumble feed.
- **Chrome Browser Extension**:
  - Manifest V3 extension for Bumble Web compatibility evaluation.
- **Privacy & Local-First Processing**:
  - **Zero cloud LLM dependency**: Evaluates and scores candidates on your machine.
  - Candidate media (screenshots, extracted photos) and local SQLite database remain 100% on your local machine and are strictly excluded from Git.
  - Automated **Git Pre-Commit Hook** guards against data leaks.
- **Deterministic Compatibility Scoring**:
  - Multi-dimensional preference matching (intentions, interests, lifestyle, communication, values).
  - Explicit deal-breaker conflict detection.
  - High-confidence explanations and visual rating quality metrics.
- **Local SQLite Journal**:
  - Tracks candidate history, swipes, scores, and activity logs.
  - Duplicate profile prevention and interrupted-run recovery.

---

## Requirements

- **macOS**
- **Node.js**: v22+ (verified with Node.js v26.x)
- **Android SDK & Platform Tools**: `adb` and `emulator` (if using Android automation)
- **Android Device or Emulator**: e.g., Android Studio AVD running Bumble

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start the local server and background runners
```bash
npm run dev
```
`npm run dev` starts three concurrent processes:
- **Next.js Web UI**: [http://localhost:3000](http://localhost:3000)
- **Background Worker**: Evaluation engine and asynchronous job processor.
- **Android Runner**: Heartbeat loop monitoring ADB, phone state, and Bumble.

---

## Android Automation Setup

1. **Launch your Android Emulator or connect phone via USB**:
   ```bash
   emulator -avd <your_avd_name>
   ```
2. **Verify connection**:
   ```bash
   adb devices
   ```
3. Open the **Pairwise UI** at [http://localhost:3000](http://localhost:3000).
4. Set your partner preferences on the onboarding screen.
5. In the Android integration panel, set **Run limit** to `Unlimited (continuous)` (or your desired number) and click **Start Android agent**.
6. The copilot will automatically detect the candidate card, scroll through all details, extract photos, score compatibility, and execute the swipe.

---

## Local Data & Privacy Protection

All personal and candidate data is kept strictly private on your computer:

| Data Type | Storage Location | Privacy Status |
|---|---|---|
| **Cropped Profile Photos** | `public/photos/` | Local only (ignored by git) |
| **Phone Screenshots** | `public/screenshots/` | Local only (ignored by git) |
| **SQLite Database** | `.data/pairwise.sqlite` | Local only (ignored by git) |

### Git Pre-Commit Security Hook
A double-protection pre-commit hook is included to prevent any accidental push of screenshots, photos, or databases:
```bash
# To install or refresh the pre-commit hook:
cp scripts/git-pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```
If any media file or database is staged, the hook immediately aborts the commit.

---

## Available Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run web dashboard, worker, and Android runner concurrently |
| `npm run android` | Run standalone Android runner process |
| `npm run worker` | Run standalone local worker process |
| `npm test` | Run Vitest unit & integration test suite (53 tests) |
| `npm run test:e2e` | Run Playwright end-to-end browser tests |
| `npm run build` | Build optimized Next.js production bundle |
| `npm run typecheck` | Run TypeScript type checks without emitting files |

---

## License

Private and local-first. Built for personal dating compatibility assistance.
