# Repository assessment

Assessment date: 19 October 2026. The repositories were shallow-cloned and inspected for README claims, manifests, source shape, license files, and recent history before implementation.

## Decision summary

| Repository | Finding | License status | Reuse decision |
| --- | --- | --- | --- |
| [Tencent/BrowserSkill](https://github.com/Tencent/BrowserSkill) | Active browser-control infrastructure using a CLI/daemon plus Chrome or Edge extension. Its overall extension-and-local-daemon shape helped validate that a browser bridge is practical. | MIT license file present. | No code copied. Pairwise uses a smaller purpose-built Manifest V3 extension and local HTTP bridge instead of adding BrowserSkill's daemon and CLI. |
| [jofftiquez/bee-farm](https://github.com/jofftiquez/bee-farm) | Puppeteer implementation coupled to Bumble DOM selectors, persisted browser state, stealth plugins, fingerprint changes, random behavior, and automated swiping. Its README itself warns of terms/account risk. Last inspected substantive commit: `fbda8bd`, 4 April 2025. | README says MIT, but no standalone license file or package license field was present in the inspected tree. | Rejected. The automation and anti-detection design conflicts with the PRD, and license evidence is incomplete. |
| [emsha/bumble_bot](https://github.com/emsha/bumble_bot) | Two-commit 2019 experiment with hard-coded local paths, deprecated Selenium XPath calls, whole-screen face detection, and a model trained to rate appearance. The README calls it buggy. | No license file found. | Rejected. Technically obsolete, unlicensed, brittle, and incompatible with the product's fairness and photo-analysis constraints. |
| [nathandev0/Bumble_Automation_Bot](https://github.com/nathandev0/Bumble_Automation_Bot) | The inspected source contains a short contact stub, a demo GIF, and an automated workflow that updates `date.txt`. README claims account creation, session extraction, GPS spoofing, IP rotation, and anti-bot behavior. Recent commits are automated date updates, not evidence of maintained product code. | No license file found. | Rejected. No suitable implementation to reuse, no license grant, and the claimed workflows conflict with the PRD. |

## BrowserSkill notes

Inspected head: `d9a78ae` dated 14 October 2026. The project uses a Rust workspace, pnpm 10, a CLI/daemon, and a Chromium extension. Its documentation says:

- Chrome or Edge based on Chromium 125+ is supported.
- An agent normally gets a separate visible Agent Window.
- Existing tabs are borrowed explicitly and returned.
- The extension shares the selected browser profile's existing login state; it is not a security sandbox.
- Local mode uses a loopback daemon, while remote pairing is separately authenticated.
- Debug history, optional audit logs, screenshots, and recordings each have distinct retention/privacy implications.

This makes BrowserSkill a plausible generic browser transport, but much broader than Pairwise needs. Pairwise now ships its own narrow Chrome extension: it runs inside the already-open Bumble tab, reads the visible profile, calls the local decision engine, and clicks only an explicitly labeled Like or Pass control. It does not install BrowserSkill, copy a browser profile, or store browser sessions.

## Bee Farm notes

Inspected head: `fbda8bd` dated 4 April 2025. Its package depends on Puppeteer 24, `puppeteer-extra`, stealth and user-agent anonymization plugins, Chalk, and Axios. The implementation:

- launches a persistent `user_data` browser directory;
- applies stealth/evasion behavior and user-agent changes;
- can restore cookies;
- relies on Bumble-specific class names and fallback selectors;
- has randomized fallback decisions and automated click actions;
- disables browser security features in launch arguments;
- stores session state and performs swipes.

Even if selectors happened to work today, that architecture is not acceptable for Pairwise. The only retained idea is the high-level separation between profile normalization and compatibility evaluation, implemented independently with deterministic logic and typed local interfaces.

## Older automation projects

`emsha/bumble_bot` was last committed on 3 December 2019 (`063520a`). It hard-codes the author's ChromeDriver and model paths, uses removed Selenium methods, and reduces photo input to an appearance score that triggers a swipe. No dependency manifest or license was present.

`nathandev0/Bumble_Automation_Bot` showed a latest date-file update at `fd46e95` on 18 October 2026, but the actual checked-in `src/main.py` is only descriptive contact text. The repository's claimed device/account creation and evasion workflows are neither suitable nor implemented in a reusable, licensed form in the inspected source.

## Resulting implementation stance

1. Build the preference, analysis, scoring, persistence, recovery, and journal system independently.
2. Keep photo inspection local and limited to technical image-quality metrics.
3. Keep candidate analysis and scoring deterministic and independent of browser lifecycle.
4. Use a minimal local extension bridge instead of importing stale automation or anti-detection code.
5. Stop when page controls are missing or ambiguous rather than guessing.
6. Report the extension as connected only while fresh heartbeats are present; never simulate a live browser connection.
