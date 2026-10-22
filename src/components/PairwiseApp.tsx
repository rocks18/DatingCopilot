"use client";

import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Copy,
  Database,
  Download,
  ExternalLink,
  Maximize2,
  FileHeart,
  Gauge,
  HeartHandshake,
  History,
  ImagePlus,
  Info,
  Laptop,
  LockKeyhole,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserRoundSearch,
  Wifi,
  Cpu,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_PREFERENCES } from "@/lib/defaults";
import { analyzePhotoFile } from "@/lib/photo-analyzer";
import type {
  ActivityRecord,
  AndroidAgentState,
  CandidateInput,
  CandidateRecord,
  CompatibilityDecision,
  DimensionKey,
  PhotoObservation,
  Preferences,
  RuntimeState,
} from "@/lib/types";
import type { IntegrationCapability } from "@/lib/integrations";

type View = "overview" | "optimizer" | "preferences" | "compatibility" | "analysis" | "journal" | "history" | "integrations" | "settings";

interface Snapshot {
  preferences: Preferences | null;
  candidates: CandidateRecord[];
  activities: ActivityRecord[];
  runtime: RuntimeState;
  android?: AndroidAgentState;
  summary: { analyzed: number; pending: number; insufficient: number; conflicts: number };
}

const NAVIGATION: Array<{ id: View; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "optimizer", label: "Profile Optimizer", icon: Sparkles },
  { id: "preferences", label: "Partner preferences", icon: HeartHandshake },
  { id: "compatibility", label: "Compatibility engine", icon: BrainCircuit },
  { id: "analysis", label: "Profile analysis", icon: UserRoundSearch },
  { id: "journal", label: "Candidate journal", icon: FileHeart },
  { id: "history", label: "Decision history", icon: History },
  { id: "integrations", label: "Integrations", icon: Laptop },
  { id: "settings", label: "Settings & privacy", icon: Settings2 },
];

const EMPTY_CANDIDATE: CandidateInput = {
  displayName: "",
  age: null,
  location: "",
  distanceKm: null,
  relationshipIntentions: [],
  interests: [],
  lifestyle: [],
  communication: [],
  values: [],
  explicitConflicts: [],
  bio: "",
  prompts: [],
  photos: [],
  source: "manual",
};

const DEMO_CANDIDATE: CandidateInput = {
  displayName: "Avery · demo profile",
  age: 31,
  location: "Bengaluru",
  distanceKm: 12,
  relationshipIntentions: ["serious relationship"],
  interests: ["travel", "cooking", "reading"],
  lifestyle: ["active lifestyle", "non-smoker"],
  communication: ["clear communication", "good listener"],
  values: ["kindness", "independence", "growth"],
  explicitConflicts: [],
  bio: "Product designer, weekend hiker, and an enthusiastic home cook. Looking for a serious relationship built on honesty and curiosity.",
  prompts: ["A perfect Sunday: a long walk, a new recipe, and calling family."],
  photos: [],
  source: "simulation",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function formatDate(value: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function splitList(value: string) {
  return [...new Set(value.split(/,|\n/).map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function StatusDot({ tone = "green" }: { tone?: "green" | "amber" | "red" | "grey" }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />;
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "violet" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

function EmptyState({ icon: Icon, title, copy, action }: { icon: typeof Activity; title: string; copy: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={22} /></div>
      <h3>{title}</h3>
      <p>{copy}</p>
      {action}
    </div>
  );
}

export function PairwiseApp() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationCapability[]>([]);
  const [activeView, setActiveView] = useState<View>("overview");
  const [selectedCandidate, setSelectedCandidate] = useState<number | null>(null);
  const [editingCandidate, setEditingCandidate] = useState<CandidateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const load = useCallback(async () => {
    try {
      const [nextSnapshot, integrationResult] = await Promise.all([
        requestJson<Snapshot>("/api/bootstrap", { cache: "no-store" }),
        requestJson<{ integrations: IntegrationCapability[] }>("/api/integrations", { cache: "no-store" }),
      ]);
      setSnapshot(nextSnapshot);
      setIntegrations(integrationResult.integrations);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load local data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("pairwise-theme");
    const nextTheme = savedTheme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    const themeTimer = window.setTimeout(() => setTheme(nextTheme), 0);
    const loadTimer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(themeTimer);
      window.clearTimeout(loadTimer);
    };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function savePreferences(preferences: Preferences) {
    await requestJson("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(preferences),
    });
    await load();
    setToast("Preferences saved locally");
  }

  async function handleAndroidCommand(
    command: "start" | "pause" | "launch" | "connect_wifi" | "disconnect_wifi" | "refresh_devices",
    runLimit?: number,
    ip?: string,
  ) {
    try {
      await requestJson("/api/android", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command, runLimit, ip }),
      });
      await load();
      setToast(
        command === "start"
          ? "Android agent swiping started"
          : command === "pause"
          ? "Android agent paused"
          : command === "connect_wifi"
          ? "Wi-Fi debugging connected"
          : command === "disconnect_wifi"
          ? "Wi-Fi debugging disconnected"
          : command === "refresh_devices"
          ? "Device list refreshed"
          : "Bumble launched",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute Android command");
    }
  }

  function changeTheme(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("pairwise-theme", next);
  }

  if (loading) return <LoadingScreen />;
  if (error && !snapshot) return <FatalError message={error} onRetry={() => void load()} />;
  if (!snapshot) return null;

  if (!snapshot.preferences?.confirmed) {
    return <Onboarding onComplete={savePreferences} />;
  }

  const currentCandidate = snapshot.candidates.find((candidate) => candidate.id === selectedCandidate) ?? null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActiveView("overview")} aria-label="Pairwise overview">
          <span className="brand-mark"><span>P</span></span>
          <span><strong>Pairwise</strong><small>Dating agent</small></span>
        </button>

        <nav aria-label="Primary navigation">
          {NAVIGATION.map(({ id, label, icon: Icon }) => (
            <button key={id} aria-label={label} className={activeView === id ? "nav-item active" : "nav-item"} onClick={() => setActiveView(id)}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="privacy-chip"><ShieldCheck size={15} /><span>Local browser agent</span></div>
          <p>The extension evaluates the visible Bumble profile, executes Like or Pass, and journals the result locally.</p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="eyebrow"><span>PAIRWISE /</span> {NAVIGATION.find((item) => item.id === activeView)?.label}</div>
          <div className="topbar-actions">
            <button
              className={`state-control ${snapshot.runtime.paused ? "paused" : ""}`}
              onClick={async () => {
                await requestJson("/api/runtime", {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ paused: !snapshot.runtime.paused }),
                });
                await load();
              }}
            >
              {snapshot.runtime.paused ? <Play size={14} /> : <Pause size={14} />}
              <StatusDot tone={snapshot.runtime.paused ? "amber" : "green"} />
              Agent {snapshot.runtime.paused ? "paused" : "ready"}
            </button>
            <button className="icon-button" onClick={() => changeTheme(theme === "light" ? "dark" : "light")} aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}>
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
        </header>

        <div className="content">
          {error && <div className="inline-error"><CircleAlert size={16} />{error}<button onClick={() => setError(null)}><X size={14} /></button></div>}
          {activeView === "overview" && <Overview snapshot={snapshot} bumble={integrations.find((item) => item.id === "bumble")} onNavigate={setActiveView} onSelect={(id) => { setSelectedCandidate(id); setActiveView("journal"); }} />}
          {activeView === "optimizer" && <ProfileOptimizerView preferences={snapshot.preferences} />}
          {activeView === "preferences" && <PreferencesView initial={snapshot.preferences} onSave={savePreferences} />}
          {activeView === "compatibility" && <CompatibilityView preferences={snapshot.preferences} candidates={snapshot.candidates} onSave={savePreferences} />}
          {activeView === "analysis" && (
            <ProfileAnalysis
              key={editingCandidate?.id ?? "new-profile"}
              editing={editingCandidate}
              onCancelEdit={() => setEditingCandidate(null)}
              onSaved={async (candidateId, message) => {
                setEditingCandidate(null);
                await load();
                setSelectedCandidate(candidateId);
                setActiveView("journal");
                setToast(message);
              }}
            />
          )}
          {activeView === "journal" && (
            <Journal
              candidates={snapshot.candidates}
              selected={currentCandidate}
              onSelect={setSelectedCandidate}
              onAdd={() => setActiveView("analysis")}
              onEdit={(candidate) => { setEditingCandidate(candidate); setActiveView("analysis"); }}
              onDelete={async (id) => {
                if (!window.confirm("Delete this local candidate record and its decision history?")) return;
                await requestJson(`/api/candidates/${id}`, { method: "DELETE" });
                setSelectedCandidate(null);
                await load();
                setToast("Candidate deleted locally");
              }}
              onRecord={async (id, decision) => {
                await requestJson(`/api/candidates/${id}/decision`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ decision, note: "" }),
                });
                await load();
                setToast("Your decision was recorded locally");
              }}
            />
          )}
          {activeView === "history" && <DecisionHistory candidates={snapshot.candidates} onSelect={(id) => { setSelectedCandidate(id); setActiveView("journal"); }} />}
          {activeView === "integrations" && (
            <IntegrationsView
              integrations={integrations}
              android={snapshot.android}
              onAndroidCommand={handleAndroidCommand}
            />
          )}
          {activeView === "settings" && (
            <SettingsView
              theme={theme}
              onTheme={changeTheme}
              onRestored={async () => { await load(); setToast("Backup restored"); }}
              onReset={async () => {
                await requestJson("/api/reset", { method: "POST" });
                await load();
              }}
            />
          )}
        </div>
      </main>

      {toast && <div className="toast"><CircleCheck size={17} />{toast}</div>}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="brand-mark large"><span>P</span></div>
      <p>Opening your private workspace…</p>
    </div>
  );
}

function FatalError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="loading-screen error-screen">
      <CircleAlert size={28} />
      <h1>Pairwise could not open</h1>
      <p>{message}</p>
      <button className="primary-button" onClick={onRetry}><RefreshCw size={15} />Try again</button>
    </div>
  );
}

function Onboarding({ onComplete }: { onComplete: (preferences: Preferences) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [narrative, setNarrative] = useState("");
  const [preferences, setPreferences] = useState<Preferences>(structuredClone(EMPTY_PREFERENCES));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function interpret() {
    setBusy(true);
    setError(null);
    try {
      const result = await requestJson<{ preferences: Preferences }>("/api/preferences/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ narrative }),
      });
      setPreferences(result.preferences);
      setStep(1);
    } catch (interpretError) {
      setError(interpretError instanceof Error ? interpretError.message : "Could not interpret that description.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await onComplete({ ...preferences, confirmed: true });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save preferences.");
      setBusy(false);
    }
  }

  return (
    <div className="onboarding-shell">
      <header className="onboarding-header">
        <div className="brand"><span className="brand-mark"><span>P</span></span><span><strong>Pairwise</strong><small>Autonomous dating agent</small></span></div>
        <span className="local-badge"><LockKeyhole size={14} />Stored locally on this Mac</span>
      </header>
      <div className="onboarding-grid">
        <aside className="onboarding-aside">
          <div className="editorial-number">0{step + 1}</div>
          <p className="kicker">ONE-TIME SETUP</p>
          <h1>{["Describe what matters", "Review the interpretation", "Choose your decision style", "Confirm your privacy choices"][step]}</h1>
          <p>{[
            "Write naturally. The local parser will organize only what you say, then ask you to confirm every field.",
            "Nothing is final yet. Correct, remove, or add anything the parser misunderstood.",
            "This setting changes recommendation thresholds—not just the interface.",
            "Pairwise works without Bumble access or an external AI provider.",
          ][step]}</p>
          <div className="step-list">
            {["Your intent", "Structured preferences", "Decision policy", "Privacy & save"].map((label, index) => (
              <div key={label} className={`step-item ${index === step ? "active" : ""} ${index < step ? "done" : ""}`}>
                <span>{index < step ? <Check size={13} /> : index + 1}</span>{label}
              </div>
            ))}
          </div>
        </aside>
        <section className="onboarding-card">
          {error && <div className="inline-error"><CircleAlert size={16} />{error}</div>}
          {step === 0 && (
            <div className="onboarding-panel">
              <div className="field-head"><label htmlFor="intent">In your own words</label><span>{narrative.length}/4000</span></div>
              <textarea
                id="intent"
                className="intent-area"
                maxLength={4000}
                value={narrative}
                onChange={(event) => setNarrative(event.target.value)}
                placeholder="I want a serious relationship with someone who enjoys travel, communicates clearly, values independence, and…"
                autoFocus
              />
              <div className="suggestion-row">
                {['serious relationship', 'clear communication', 'shared interests', 'non-negotiables'].map((item) => <span key={item}>{item}</span>)}
              </div>
              <div className="panel-note"><Sparkles size={17} /><div><strong>Local interpretation</strong><p>No profile data leaves your Mac, and nothing will be invented on your behalf.</p></div></div>
              <div className="button-row end"><button className="primary-button" disabled={narrative.trim().length < 10 || busy} onClick={() => void interpret()}>{busy ? "Interpreting…" : "Interpret my preferences"}<ArrowRight size={16} /></button></div>
            </div>
          )}
          {step === 1 && (
            <div className="onboarding-panel scroll-panel">
              <PreferenceFields preferences={preferences} onChange={setPreferences} compact />
              <div className="button-row between"><button className="secondary-button" onClick={() => setStep(0)}>Back</button><button className="primary-button" onClick={() => setStep(2)}>Looks right<ArrowRight size={16} /></button></div>
            </div>
          )}
          {step === 2 && (
            <div className="onboarding-panel">
              <PolicyPicker value={preferences.policy} onChange={(policy) => setPreferences({ ...preferences, policy })} />
              <div className="engine-preview">
                <div><span>Deal-breaker rule</span><strong>Always overrides score</strong></div>
                <div><span>Unknown evidence</span><strong>Excluded, never penalized</strong></div>
                <div><span>Scoring mode</span><strong>Deterministic & reproducible</strong></div>
              </div>
              <div className="button-row between"><button className="secondary-button" onClick={() => setStep(1)}>Back</button><button className="primary-button" onClick={() => setStep(3)}>Continue<ArrowRight size={16} /></button></div>
            </div>
          )}
          {step === 3 && (
            <div className="onboarding-panel">
              <div className="privacy-hero"><ShieldCheck size={28} /><div><p className="kicker">PRIVACY DEFAULT</p><h2>Your data stays yours.</h2></div></div>
              <div className="privacy-list">
                <div><Check size={16} /><span><strong>Local SQLite storage</strong><small>Preferences, supplied profiles, and decisions stay in this project’s local data folder.</small></span></div>
                <div><Check size={16} /><span><strong>Local Bumble browser control</strong><small>The optional extension reads the visible profile and can execute Like or Pass. Passwords and cookies are not copied into Pairwise.</small></span></div>
                <div><Check size={16} /><span><strong>Photos are not retained</strong><small>Quality metrics are computed in this browser; the image files are not uploaded or saved.</small></span></div>
                <div><Check size={16} /><span><strong>No external AI by default</strong><small>The deterministic local engine works without an API key.</small></span></div>
              </div>
              <label className="confirm-line"><input type="checkbox" required id="privacy-confirm" /> <span>I reviewed the interpreted preferences and understand how the local browser agent uses them.</span></label>
              <div className="button-row between"><button className="secondary-button" onClick={() => setStep(2)}>Back</button><button className="primary-button" disabled={busy} onClick={() => {
                const checkbox = document.getElementById("privacy-confirm") as HTMLInputElement | null;
                if (!checkbox?.checked) { setError("Confirm the privacy summary before saving."); return; }
                void finish();
              }}>{busy ? "Saving…" : "Save & open Pairwise"}<ArrowRight size={16} /></button></div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ListInput({ label, value, onChange, hint }: { label: string; value: string[]; onChange: (value: string[]) => void; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value.join(", ")} onChange={(event) => onChange(splitList(event.target.value))} placeholder={hint ?? "Comma-separated"} />
    </label>
  );
}

function PreferenceFields({ preferences, onChange, compact = false }: { preferences: Preferences; onChange: (next: Preferences) => void; compact?: boolean }) {
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) => onChange({ ...preferences, [key]: value });
  return (
    <div className={compact ? "preference-fields compact" : "preference-fields"}>
      <div className="form-section-head"><div><span>01</span><h3>Essential context</h3></div><p>These fields are saved only after your confirmation.</p></div>
      <div className="field-grid three">
        <label className="field"><span>Minimum age</span><input type="number" min={18} max={99} value={preferences.ageRange.min} onChange={(e) => set("ageRange", { ...preferences.ageRange, min: Number(e.target.value) })} /></label>
        <label className="field"><span>Maximum age</span><input type="number" min={18} max={99} value={preferences.ageRange.max} onChange={(e) => set("ageRange", { ...preferences.ageRange, max: Number(e.target.value) })} /></label>
        <label className="field"><span>Radius (km)</span><input type="number" min={1} value={preferences.radiusKm ?? ""} onChange={(e) => set("radiusKm", e.target.value ? Number(e.target.value) : null)} placeholder="Flexible" /></label>
      </div>
      <ListInput label="Acceptable locations" value={preferences.acceptableLocations} onChange={(value) => set("acceptableLocations", value)} hint="e.g. Bengaluru, Mumbai" />
      <div className="form-section-head"><div><span>02</span><h3>Alignment signals</h3></div><p>Unknown candidate fields will not count as mismatches.</p></div>
      <div className="field-grid two">
        <ListInput label="Relationship intentions" value={preferences.relationshipIntentions} onChange={(value) => set("relationshipIntentions", value)} />
        <ListInput label="Shared interests" value={preferences.interests} onChange={(value) => set("interests", value)} />
        <ListInput label="Lifestyle" value={preferences.lifestyle} onChange={(value) => set("lifestyle", value)} />
        <ListInput label="Communication" value={preferences.communication} onChange={(value) => set("communication", value)} />
        <ListInput label="Values" value={preferences.values} onChange={(value) => set("values", value)} />
        <ListInput label="Flexible preferences" value={preferences.flexible} onChange={(value) => set("flexible", value)} hint="e.g. location, age" />
      </div>
      <div className="form-section-head"><div><span>03</span><h3>Hard boundaries</h3></div><p>Explicit conflicts are evaluated before the weighted score.</p></div>
      <div className="field-grid two">
        <ListInput label="Non-negotiables" value={preferences.nonNegotiables} onChange={(value) => set("nonNegotiables", value)} hint="e.g. non-smoker, wants children" />
        <ListInput label="Explicit exclusions" value={preferences.exclusions} onChange={(value) => set("exclusions", value)} hint="e.g. smoking" />
      </div>
    </div>
  );
}

function PolicyPicker({ value, onChange }: { value: Preferences["policy"]; onChange: (value: Preferences["policy"]) => void }) {
  const choices: Array<{ value: Preferences["policy"]; title: string; copy: string; note: string }> = [
    { value: "strict", title: "Strict", copy: "Close alignment before a positive recommendation.", note: "Higher evidence threshold" },
    { value: "balanced", title: "Balanced", copy: "Allows reasonable differences where evidence is clear.", note: "Recommended starting point" },
    { value: "exploratory", title: "Exploratory", copy: "Considers a wider range without ignoring deal-breakers.", note: "Broader consideration" },
  ];
  return (
    <div className="policy-grid">
      {choices.map((choice) => (
        <button key={choice.value} className={value === choice.value ? "policy-card selected" : "policy-card"} onClick={() => onChange(choice.value)}>
          <span className="radio-mark">{value === choice.value && <Check size={13} />}</span>
          <h3>{choice.title}</h3><p>{choice.copy}</p><small>{choice.note}</small>
        </button>
      ))}
    </div>
  );
}

function PageIntro({ kicker, title, copy, action }: { kicker: string; title: string; copy: string; action?: React.ReactNode }) {
  return (
    <div className="page-intro">
      <div><p className="kicker">{kicker}</p><h1>{title}</h1><p>{copy}</p></div>
      {action}
    </div>
  );
}

function Overview({ snapshot, bumble, onNavigate, onSelect }: { snapshot: Snapshot; bumble?: IntegrationCapability; onNavigate: (view: View) => void; onSelect: (id: number) => void }) {
  const latest = snapshot.candidates.slice(0, 3);
  const androidConnected = Boolean(snapshot.android?.deviceConnected);
  const isEmulator = Boolean(snapshot.android?.deviceSerial?.startsWith("emulator-"));
  const isWifi = Boolean(snapshot.android?.deviceSerial?.includes(":"));
  const isUsb = Boolean(androidConnected && !isEmulator && !isWifi);

  const connectionButtonLabel = isEmulator
    ? "Emulator: Pixel 5 (Background Mode)"
    : isWifi
    ? `Wi-Fi: ${snapshot.android?.deviceSerial}`
    : isUsb
    ? `USB: ${snapshot.android?.deviceModel || "Phone"}`
    : bumble?.connected
    ? "View live connection"
    : "Connect Bumble";

  return (
    <div>
      <PageIntro
        kicker="YOUR PRIVATE WORKSPACE"
        title="Set the brief. Let the agent swipe."
        copy="Pairwise automates Bumble using your Native ARM64 Android Emulator or phone (USB / Wi-Fi). It evaluates profiles against your criteria, executes Like or Pass, and journals every result."
        action={
          <button className="primary-button" onClick={() => onNavigate("integrations")}>
            {isEmulator ? <Cpu size={16} /> : isWifi ? <Wifi size={16} /> : androidConnected ? <Smartphone size={16} /> : <Laptop size={16} />}
            {connectionButtonLabel}
          </button>
        }
      />
      <section className="hero-status">
        <div className="hero-copy">
          <div className="live-label">
            <StatusDot tone={snapshot.runtime.paused ? "amber" : (androidConnected || bumble?.connected) ? "green" : "grey"} />
            {snapshot.runtime.paused
              ? "Agent paused"
              : isEmulator
              ? `Native ARM64 Emulator active · Background mode (${snapshot.android?.deviceSerial})${snapshot.android?.running ? " · Actively swiping" : ""}`
              : isWifi
              ? `Android phone on Wi-Fi (${snapshot.android?.deviceSerial})${snapshot.android?.running ? " · Actively swiping" : ""}`
              : isUsb
              ? `Android phone via USB (${snapshot.android?.deviceModel || "Phone"})${snapshot.android?.running ? " · Actively swiping" : ""}`
              : bumble?.connected
              ? "Bumble browser connected"
              : "Connect Android Emulator or Phone via USB/Wi-Fi"}
          </div>
          <h2>{sentenceCase(snapshot.preferences!.policy)} decisions.<br />Your boundaries stay first.</h2>
          <p>Pairwise converts every recommendation into a real action while keeping your confirmed deal-breakers first.</p>
          <div className="hero-meta">
            <span><Database size={15} />Local SQLite</span>
            <span><Play size={15} />Automatic Like / Pass</span>
            <span>{isEmulator ? <Cpu size={15} /> : <Smartphone size={15} />}{isEmulator ? "Native ARM64 AVD" : isWifi ? "Wi-Fi Debugging" : "Android ADB"}</span>
          </div>
        </div>
        <div className="orbit-visual" aria-hidden="true"><div className="orbit one" /><div className="orbit two" /><div className="core"><HeartHandshake size={28} /></div><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /></div>
      </section>

      <div className="metric-grid">
        <Metric label="Profiles analyzed" value={snapshot.summary.analyzed} note="Browser agent + manual" icon={UserRoundSearch} />
        <Metric label="Needs more context" value={snapshot.summary.insufficient} note="Unknown ≠ mismatch" icon={Info} />
        <Metric label="Explicit conflicts" value={snapshot.summary.conflicts} note="Boundary override applied" icon={CircleAlert} />
        <Metric label="Last processed" value={snapshot.runtime.lastSuccessfulProcessingAt ? "Ready" : "—"} note={formatDate(snapshot.runtime.lastSuccessfulProcessingAt)} icon={Clock3} />
      </div>

      <div className="dashboard-grid">
        <section className="panel wide">
          <div className="panel-title"><div><p className="kicker">RECENT ANALYSIS</p><h2>Candidate journal</h2></div><button className="text-button" onClick={() => onNavigate("journal")}>View journal<ChevronRight size={15} /></button></div>
          {latest.length ? <div className="candidate-list compact-list">{latest.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onClick={() => onSelect(candidate.id)} />)}</div> : <EmptyState icon={FileHeart} title="No profiles analyzed yet" copy="Add user-provided profile details or run the clearly labeled local demo." action={<button className="secondary-button" onClick={() => onNavigate("analysis")}>Add first profile</button>} />}
        </section>
        <section className="panel activity-panel">
          <div className="panel-title"><div><p className="kicker">ACTIVITY</p><h2>Local agent log</h2></div></div>
          <div className="activity-list">
            {snapshot.activities.slice(0, 6).map((activity) => (
              <div className="activity-item" key={activity.id}><StatusDot tone={activity.level === "error" ? "red" : activity.level === "warning" ? "amber" : "green"} /><div><p>{activity.message}</p><small>{formatDate(activity.createdAt)}</small></div></div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: typeof Activity }) {
  return <div className="metric"><div className="metric-icon"><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function PreferencesView({ initial, onSave }: { initial: Preferences; onSave: (preferences: Preferences) => Promise<void> }) {
  const [preferences, setPreferences] = useState(structuredClone(initial));
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <PageIntro kicker="THE BRIEF" title="Partner preferences" copy="Your confirmed criteria are the source of truth. Edit them whenever your priorities change." action={<button className="primary-button" disabled={saving} onClick={async () => { setSaving(true); await onSave(preferences); setSaving(false); }}>{saving ? "Saving…" : "Save changes"}<Check size={16} /></button>} />
      <section className="panel form-panel">
        <label className="field"><span>Your original brief</span><textarea value={preferences.narrative} onChange={(event) => setPreferences({ ...preferences, narrative: event.target.value })} rows={4} /></label>
        <PreferenceFields preferences={preferences} onChange={setPreferences} />
      </section>
    </div>
  );
}

const DIMENSION_COPY: Record<DimensionKey, string> = {
  relationshipIntentions: "Relationship intentions",
  sharedInterests: "Shared interests",
  lifestyle: "Lifestyle compatibility",
  communication: "Communication preferences",
  values: "Values & priorities",
};

function CompatibilityView({ preferences: initial, candidates, onSave }: { preferences: Preferences; candidates: CandidateRecord[]; onSave: (preferences: Preferences) => Promise<void> }) {
  const [preferences, setPreferences] = useState(structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const total = Object.values(preferences.weights).reduce((sum, weight) => sum + weight, 0);
  const latest = candidates.find((candidate) => candidate.decision)?.decision ?? null;
  return (
    <div>
      <PageIntro kicker="HOW DECISIONS WORK" title="Compatibility engine" copy="Tune what matters. Scores are recalculated from known evidence; unknown dimensions are excluded." action={<button className="primary-button" disabled={saving || total !== 100} onClick={async () => { setSaving(true); await onSave(preferences); setSaving(false); }}>{saving ? "Saving…" : "Save engine"}<Check size={16} /></button>} />
      <div className="dashboard-grid engine-grid">
        <section className="panel">
          <div className="panel-title"><div><p className="kicker">WEIGHTING</p><h2>Evidence dimensions</h2></div><Pill tone={total === 100 ? "green" : "red"}>{total}% total</Pill></div>
          <div className="weight-list">
            {(Object.keys(preferences.weights) as DimensionKey[]).map((key) => (
              <label className="weight-row" key={key}><span>{DIMENSION_COPY[key]}</span><input type="range" min={0} max={60} value={preferences.weights[key]} onChange={(e) => setPreferences({ ...preferences, weights: { ...preferences.weights, [key]: Number(e.target.value) } })} /><strong>{preferences.weights[key]}%</strong></label>
            ))}
          </div>
          {total !== 100 && <p className="validation-note"><CircleAlert size={14} />Weights must total exactly 100% before saving.</p>}
        </section>
        <section className="panel">
          <div className="panel-title"><div><p className="kicker">SELECTIVITY</p><h2>Decision policy</h2></div></div>
          <PolicyPicker value={preferences.policy} onChange={(policy) => setPreferences({ ...preferences, policy })} />
        </section>
      </div>
      <section className="panel engine-rules">
        <div className="panel-title"><div><p className="kicker">GUARDRAILS</p><h2>Rules that never move</h2></div></div>
        <div className="rule-grid">
          <div><span>01</span><h3>Deal-breakers override</h3><p>A high score cannot erase an explicit conflict.</p></div>
          <div><span>02</span><h3>Unknown stays unknown</h3><p>Missing evidence is excluded, not scored as a mismatch.</p></div>
          <div><span>03</span><h3>Same input, same answer</h3><p>No randomness is used in scoring or labels.</p></div>
          <div><span>04</span><h3>Evidence is visible</h3><p>Confidence reflects how much weighted information is known.</p></div>
        </div>
      </section>
      {latest && <DecisionCard decision={latest} />}
    </div>
  );
}

function ProfileAnalysis({ editing, onCancelEdit, onSaved }: { editing: CandidateRecord | null; onCancelEdit: () => void; onSaved: (id: number, message: string) => Promise<void> }) {
  const [form, setForm] = useState<CandidateInput>(editing ? structuredClone(editing.input) : structuredClone(EMPTY_CANDIDATE));
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(input: CandidateInput) {
    setBusy(true); setError(null);
    try {
      const result = await requestJson<{ candidate: CandidateRecord; duplicate?: boolean }>(editing ? `/api/candidates/${editing.id}` : "/api/candidates", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      await onSaved(result.candidate.id, result.duplicate ? "This profile was already in your journal" : editing ? "Corrections saved and re-analyzed" : "Profile analyzed locally");
      setForm(structuredClone(EMPTY_CANDIDATE));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not analyze this profile.");
    } finally { setBusy(false); }
  }

  async function handlePhotos(files: FileList | null) {
    if (!files?.length) return;
    setPhotoBusy(true); setError(null);
    try {
      const observations = await Promise.all([...files].slice(0, 12).map(analyzePhotoFile));
      setForm((current) => ({ ...current, photos: observations }));
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "Could not inspect those photos.");
    } finally { setPhotoBusy(false); }
  }

  return (
    <div>
      <PageIntro kicker={editing ? "CORRECT THE RECORD" : "MANUAL INPUT"} title={editing ? `Edit ${editing.input.displayName}` : "Analyze a profile"} copy="Use this screen for corrections or one-off profiles. Normal browser-agent runs are captured automatically." action={editing ? <button className="secondary-button" onClick={onCancelEdit}><X size={15} />Cancel edit</button> : <button className="secondary-button" onClick={() => void submit(DEMO_CANDIDATE)} disabled={busy}><Sparkles size={15} />Run local demo</button>} />
      {error && <div className="inline-error"><CircleAlert size={16} />{error}</div>}
      <form className="profile-layout" onSubmit={(event) => { event.preventDefault(); void submit(form); }}>
        <section className="panel profile-form">
          <div className="form-section-head"><div><span>01</span><h3>Profile facts</h3></div><Pill>Explicitly supplied</Pill></div>
          <div className="field-grid two">
            <label className="field"><span>Name or alias</span><input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="e.g. Maya" /></label>
            <label className="field"><span>Age</span><input type="number" min={18} max={99} value={form.age ?? ""} onChange={(e) => setForm({ ...form, age: e.target.value ? Number(e.target.value) : null })} placeholder="Unknown" /></label>
            <label className="field"><span>Location</span><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Unknown is okay" /></label>
            <label className="field"><span>Distance (km)</span><input type="number" min={0} value={form.distanceKm ?? ""} onChange={(e) => setForm({ ...form, distanceKm: e.target.value ? Number(e.target.value) : null })} placeholder="Unknown" /></label>
          </div>
          <ListInput label="Stated relationship intentions" value={form.relationshipIntentions} onChange={(value) => setForm({ ...form, relationshipIntentions: value })} />
          <div className="field-grid two">
            <ListInput label="Stated interests" value={form.interests} onChange={(value) => setForm({ ...form, interests: value })} />
            <ListInput label="Lifestyle details" value={form.lifestyle} onChange={(value) => setForm({ ...form, lifestyle: value })} />
            <ListInput label="Communication preferences" value={form.communication} onChange={(value) => setForm({ ...form, communication: value })} />
            <ListInput label="Stated values" value={form.values} onChange={(value) => setForm({ ...form, values: value })} />
          </div>
          <label className="field"><span>Bio</span><textarea rows={5} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Paste user-provided bio text…" /></label>
          <label className="field"><span>Prompts (one per line)</span><textarea rows={4} value={form.prompts.join("\n")} onChange={(e) => setForm({ ...form, prompts: e.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} placeholder="A perfect Sunday…" /></label>
          <ListInput label="Known conflicts with your preferences" value={form.explicitConflicts} onChange={(value) => setForm({ ...form, explicitConflicts: value })} hint="Only explicit, verified conflicts" />
        </section>
        <aside className="profile-aside">
          <section className="panel upload-panel">
            <div className="form-section-head"><div><span>02</span><h3>Photo quality</h3></div><Pill tone="green">Not saved</Pill></div>
            <label className="dropzone"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => void handlePhotos(e.target.files)} /><ImagePlus size={24} /><strong>{photoBusy ? "Inspecting locally…" : "Choose profile photos"}</strong><span>JPEG, PNG or WebP · max 10 MB each</span></label>
            {form.photos.length > 0 && <PhotoMetrics photos={form.photos} onClear={() => setForm({ ...form, photos: [] })} />}
            <div className="privacy-mini"><LockKeyhole size={15} /><p><strong>Browser-local inspection</strong>Only numerical clarity, lighting, and composition metrics are submitted to the local server.</p></div>
          </section>
          <section className="panel submit-panel">
            <p className="kicker">BEFORE ANALYSIS</p><h3>No appearance-based personality claims.</h3><p>Pairwise does not infer character, values, intent, or sensitive traits from photos.</p>
            <button className="primary-button full" disabled={busy || !form.displayName.trim()} type="submit">{busy ? "Analyzing…" : editing ? "Save corrections" : "Analyze locally"}<ArrowRight size={16} /></button>
          </section>
        </aside>
      </form>
    </div>
  );
}

function PhotoMetrics({ photos, onClear }: { photos: PhotoObservation[]; onClear: () => void }) {
  return (
    <div className="photo-metrics"><div className="photo-metrics-head"><span>{photos.length} photo{photos.length === 1 ? "" : "s"} inspected</span><button type="button" onClick={onClear}>Clear</button></div>{photos.map((photo) => <div className="photo-result" key={photo.name}><div><strong>{photo.name}</strong><small>{photo.width} × {photo.height}</small></div><div className="mini-bars"><span style={{ "--value": photo.brightness } as React.CSSProperties}>Light</span><span style={{ "--value": photo.sharpness } as React.CSSProperties}>Clarity</span></div></div>)}</div>
  );
}

function Journal({ candidates, selected, onSelect, onAdd, onEdit, onDelete, onRecord }: { candidates: CandidateRecord[]; selected: CandidateRecord | null; onSelect: (id: number) => void; onAdd: () => void; onEdit: (candidate: CandidateRecord) => void; onDelete: (id: number) => void; onRecord: (id: number, decision: "interested" | "maybe" | "pass") => Promise<void> }) {
  const [query, setQuery] = useState("");
  const visible = candidates.filter((candidate) => candidate.input.displayName.toLowerCase().includes(query.toLowerCase()));
  if (selected) return <CandidateDetail candidate={selected} onBack={() => onSelect(0)} onEdit={() => onEdit(selected)} onDelete={() => onDelete(selected.id)} onRecord={(decision) => onRecord(selected.id, decision)} />;
  return (
    <div>
      <PageIntro kicker="PERSISTENT JOURNAL" title="Candidate journal" copy="Every captured profile, analysis, browser action, and correction stays recoverable across app restarts." action={<button className="primary-button" onClick={onAdd}><Plus size={16} />Add profile</button>} />
      <section className="panel">
        <div className="journal-toolbar"><label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search candidates" /></label><span>{visible.length} record{visible.length === 1 ? "" : "s"}</span></div>
        {visible.length ? <div className="candidate-list">{visible.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onClick={() => onSelect(candidate.id)} />)}</div> : <EmptyState icon={FileHeart} title={query ? "No matching candidates" : "Your journal is empty"} copy={query ? "Try a different search." : "Analyze a user-provided profile or run the local demo."} action={!query ? <button className="secondary-button" onClick={onAdd}>Add profile</button> : undefined} />}
      </section>
    </div>
  );
}

function CandidateRow({ candidate, onClick }: { candidate: CandidateRecord; onClick: () => void }) {
  const tone = candidate.decision?.label === "Strong potential match" ? "green" : candidate.decision?.label === "Does not meet stated criteria" ? "red" : candidate.decision?.label === "Insufficient information" ? "amber" : "violet";
  const pic = candidate.analysis?.pictureRating;
  return (
    <button className="candidate-row" onClick={onClick}>
      {candidate.input.profileImages?.[0] ? (
        <img
          src={candidate.input.profileImages[0]}
          alt={candidate.input.displayName}
          style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0, border: "1px solid var(--line)" }}
        />
      ) : (
        <span className="avatar">{candidate.input.displayName.charAt(0).toUpperCase()}</span>
      )}
      <span className="candidate-main"><strong>{candidate.input.displayName}</strong><small>{[candidate.input.age, candidate.input.location].filter(Boolean).join(" · ") || "Details not supplied"}</small></span>
      <span className="candidate-source">{candidate.source === "simulation" ? "Demo" : sentenceCase(candidate.source)}</span>
      {pic && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "rgba(234, 179, 8, 0.12)", border: "1px solid rgba(234, 179, 8, 0.28)", fontSize: 12, fontWeight: 600, color: "#facc15" }} title={`Visual Rating: ${pic.rating10}/10 · ${pic.tier}`}>
          ⭐ {pic.rating10}
        </span>
      )}
      <span className="candidate-score">{candidate.decision?.score ?? "—"}<small>{candidate.decision?.score !== null && candidate.decision ? "/ 100" : "score"}</small></span>
      <Pill tone={tone}>{candidate.decision?.label ?? sentenceCase(candidate.status)}</Pill>
      <ChevronRight size={16} />
    </button>
  );
}

function CandidateDetail({ candidate, onBack, onEdit, onDelete, onRecord }: { candidate: CandidateRecord; onBack: () => void; onEdit: () => void; onDelete: () => void; onRecord: (decision: "interested" | "maybe" | "pass") => Promise<void> }) {
  const [screenshotMode, setScreenshotMode] = useState<"grid" | "stitch">("grid");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const pic = candidate.analysis?.pictureRating;
  return (
    <div>
      <button className="back-button" onClick={onBack}>← Candidate journal</button>
      <div className="detail-heading">
        {candidate.input.profileImages?.[0] ? (
          <img
            src={candidate.input.profileImages[0]}
            alt={candidate.input.displayName}
            style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover", border: "2px solid var(--accent)", boxShadow: "0 4px 14px rgba(0,0,0,0.3)", cursor: "pointer", flexShrink: 0 }}
            onClick={() => setSelectedPhotoIndex(0)}
            title="Click to view full photo"
          />
        ) : (
          <div className="avatar large-avatar">{candidate.input.displayName.charAt(0).toUpperCase()}</div>
        )}
        <div><p className="kicker">{candidate.source === "simulation" ? "SIMULATION · NOT A REAL PERSON" : candidate.source === "bumble" ? "BUMBLE ANDROID · PHONE AGENT" : "CAPTURED PROFILE"}</p><h1>{candidate.input.displayName}</h1><p>{[candidate.input.age, candidate.input.location, candidate.input.distanceKm !== null ? `${candidate.input.distanceKm} km away` : ""].filter(Boolean).join(" · ")}</p></div><div className="detail-actions"><button className="secondary-button" onClick={onEdit}>Correct input</button><button className="icon-button danger" onClick={onDelete} aria-label="Delete candidate"><Trash2 size={16} /></button></div></div>
      {candidate.decision ? <DecisionCard decision={candidate.decision} /> : <section className="panel"><EmptyState icon={Clock3} title={`Analysis ${candidate.status}`} copy="The local worker will resume this task automatically when available." /></section>}
      <section className="panel user-decision-card">
        <div><p className="kicker">YOUR CALL</p><h2>Record your decision</h2><p>The assistant’s assessment is advice; the final decision remains yours.</p></div>
        <div className="decision-buttons">
          {(["interested", "maybe", "pass"] as const).map((decision) => (
            <button key={decision} className={candidate.userDecision === decision ? "active" : ""} onClick={() => void onRecord(decision)}>{decision === "interested" ? "Interested" : sentenceCase(decision)}{candidate.userDecision === decision && <Check size={14} />}</button>
          ))}
        </div>
      </section>

      {/* Explicit Her Bio & Conversational Prompts */}
      {(candidate.input.bio || (candidate.input.structuredPrompts && candidate.input.structuredPrompts.length > 0) || (candidate.input.prompts && candidate.input.prompts.length > 0)) && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-title">
            <div>
              <p className="kicker">EXPLICIT PROFILE CONTENT</p>
              <h2>Her Bio & Conversational Prompts</h2>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {candidate.input.bio && <Pill tone="violet">Bio present</Pill>}
              {((candidate.input.structuredPrompts?.length ?? 0) > 0 || (candidate.input.prompts?.length ?? 0) > 0) && (
                <Pill tone="green">
                  {(candidate.input.structuredPrompts?.length ?? 0) > 0
                    ? `${candidate.input.structuredPrompts!.length} prompts`
                    : `${candidate.input.prompts.length} prompts`}
                </Pill>
              )}
            </div>
          </div>

          {/* Explicit Bio */}
          {candidate.input.bio && (
            <div style={{ marginTop: 12, padding: "16px 20px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--accent)" }}>
                  About Her · Personal Bio
                </span>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(candidate.input.bio)}
                  style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                  title="Copy bio to clipboard"
                >
                  <Copy size={13} /> Copy bio
                </button>
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--foreground)", whiteSpace: "pre-line", margin: 0, fontStyle: "italic" }}>
                "{candidate.input.bio}"
              </p>
            </div>
          )}

          {/* Explicit Prompts */}
          {((candidate.input.structuredPrompts && candidate.input.structuredPrompts.length > 0) || (candidate.input.prompts && candidate.input.prompts.length > 0)) && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 10 }}>
                Conversational Prompts & Answers
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                {candidate.input.structuredPrompts && candidate.input.structuredPrompts.length > 0
                  ? candidate.input.structuredPrompts.map((p, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: "14px 16px",
                          background: "var(--surface-2)",
                          borderRadius: 12,
                          border: "1px solid var(--line)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
                            {p.question}
                          </span>
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(`${p.question}: ${p.answer}`)}
                            style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}
                            title="Copy prompt"
                          >
                            <Copy size={11} />
                          </button>
                        </div>
                        <p style={{ fontSize: 14, color: "var(--foreground)", margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
                          {p.answer}
                        </p>
                      </div>
                    ))
                  : candidate.input.prompts.map((promptText, idx) => {
                      const splitIdx = promptText.indexOf(":");
                      const q = splitIdx > -1 ? promptText.slice(0, splitIdx) : "Prompt";
                      const a = splitIdx > -1 ? promptText.slice(splitIdx + 1).trim() : promptText;
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: "14px 16px",
                            background: "var(--surface-2)",
                            borderRadius: 12,
                            border: "1px solid var(--line)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
                              {q}
                            </span>
                            <button
                              type="button"
                              onClick={() => void navigator.clipboard.writeText(promptText)}
                              style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}
                              title="Copy prompt"
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                          <p style={{ fontSize: 14, color: "var(--foreground)", margin: 0, lineHeight: 1.5, fontWeight: 500 }}>
                            {a}
                          </p>
                        </div>
                      );
                    })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Visual Appeal & Picture Rating */}
      {pic && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-title">
            <div>
              <p className="kicker">AI VISUAL EVALUATION</p>
              <h2>Picture Rating & Attractiveness</h2>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Pill tone={pic.rating10 >= 8.5 ? "green" : pic.rating10 >= 7.0 ? "violet" : "amber"}>
                {pic.tier}
              </Pill>
            </div>
          </div>

          <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", marginTop: 8, padding: "16px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--line)" }}>
            <div style={{ textAlign: "center", minWidth: 120 }}>
              <div style={{ fontSize: 38, fontWeight: 800, color: "var(--foreground)", lineHeight: 1 }}>
                {pic.rating10}
                <small style={{ fontSize: 16, fontWeight: 500, color: "var(--muted)" }}> / 10</small>
              </div>
              <div style={{ color: "#facc15", fontSize: 18, marginTop: 4 }}>
                {"★".repeat(Math.round(pic.stars))}
                {"☆".repeat(Math.max(0, 5 - Math.round(pic.stars)))}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {pic.score} / 100 photogenic index
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 260, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
              {[
                { label: "Clarity & Detail", val: pic.metrics.clarity },
                { label: "Lighting & Exposure", val: pic.metrics.lighting },
                { label: "Color Vibrance", val: pic.metrics.vibrance },
                { label: "Portrait Framing", val: pic.metrics.composition },
              ].map((m) => (
                <div key={m.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: "var(--muted)" }}>{m.label}</span>
                    <strong style={{ color: "var(--foreground)" }}>{m.val}%</strong>
                  </div>
                  <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${m.val}%`,
                        height: "100%",
                        background: m.val >= 80 ? "var(--green)" : m.val >= 65 ? "var(--accent)" : "var(--amber)",
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {pic.highlights && pic.highlights.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {pic.highlights.map((h) => (
                <span key={h} style={{ padding: "4px 10px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, color: "var(--foreground)" }}>
                  {h}
                </span>
              ))}
            </div>
          )}

          {pic.feedback && (
            <p style={{ marginTop: 10, fontSize: 13, color: "var(--muted)", fontStyle: "italic", borderLeft: "3px solid var(--accent)", paddingLeft: 12 }}>
              "{pic.feedback}"
            </p>
          )}
        </section>
      )}
      {/* Physical & lifestyle metadata */}
      {(candidate.input.profileUrl || (candidate.input.physicalDetails && Object.keys(candidate.input.physicalDetails).length > 0)) && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-title">
            <div>
              <p className="kicker">PHYSICAL & LIFESTYLE ATTRIBUTES</p>
              <h2>Profile metadata</h2>
            </div>
            {candidate.input.profileUrl && (
              <a
                href={candidate.input.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="secondary-button"
                style={{ fontSize: 13, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <ExternalLink size={14} /> Bumble profile URL
              </a>
            )}
          </div>
          {candidate.input.physicalDetails && Object.keys(candidate.input.physicalDetails).length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              {Object.entries(candidate.input.physicalDetails).map(([key, value]) => (
                <div key={key} style={{ padding: "6px 12px", background: "var(--surface-2)", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "var(--muted)" }}>{key}:</span>
                  <strong style={{ color: "var(--text)" }}>{sentenceCase(value)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Extracted Clean Profile Photos Gallery */}
      {candidate.input.profileImages && candidate.input.profileImages.length > 0 && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-title">
            <div>
              <p className="kicker">EXTRACTED PROFILE PHOTOS</p>
              <h2>Her High-Resolution Photos</h2>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Pill tone="green">✨ {candidate.input.profileImages.length} clean {candidate.input.profileImages.length === 1 ? "photo" : "photos"}</Pill>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 14 }}>
            {candidate.input.profileImages.map((src, idx) => {
              const obs = candidate.input.photos?.[idx];
              const isHero = idx === 0;
              return (
                <div
                  key={src}
                  style={{
                    borderRadius: 14,
                    overflow: "hidden",
                    border: "1px solid var(--line)",
                    background: "var(--surface-2)",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                  }}
                >
                  <div style={{ padding: "8px 14px", fontSize: 12, background: "var(--surface)", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, color: isHero ? "var(--accent)" : "var(--foreground)" }}>
                      {isHero ? "★ Primary Hero Portrait" : `Photo ${idx + 1}`}
                    </span>
                    {obs && (
                      <span style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
                        <Sparkles size={11} style={{ color: "var(--accent)" }} />
                        {Math.round(obs.sharpness * 100)}% clarity
                      </span>
                    )}
                  </div>
                  <div
                    style={{ position: "relative", cursor: "pointer", background: "#0a0a0c", overflow: "hidden", aspectRatio: "3/4" }}
                    onClick={() => setSelectedPhotoIndex(idx)}
                    title="Click to zoom in full resolution"
                  >
                    <img
                      src={src}
                      alt={`${candidate.input.displayName} photo ${idx + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    <div style={{
                      position: "absolute",
                      bottom: 10,
                      right: 10,
                      background: "rgba(0,0,0,0.65)",
                      backdropFilter: "blur(6px)",
                      color: "#fff",
                      borderRadius: 8,
                      padding: "4px 8px",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}>
                      <Maximize2 size={12} /> Inspect
                    </div>
                  </div>
                  <div style={{ padding: "10px 14px", background: "var(--surface)", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => setSelectedPhotoIndex(idx)}
                      style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, padding: 0, fontWeight: 600 }}
                    >
                      <Maximize2 size={13} /> Lightbox zoom
                    </button>
                    <a
                      href={src}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--muted)", fontSize: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      Original HD <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Captured Phone Screenshots Gallery */}
      {candidate.input.screenshots && candidate.input.screenshots.length > 0 && (
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-title">
            <div>
              <p className="kicker">CAPTURED PROOF</p>
              <h2>Phone screenshots & full profile</h2>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: 8, padding: 3, border: "1px solid var(--line)" }}>
                <button
                  type="button"
                  onClick={() => setScreenshotMode("grid")}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    background: screenshotMode === "grid" ? "var(--surface)" : "transparent",
                    color: screenshotMode === "grid" ? "var(--text)" : "var(--muted)",
                    fontWeight: screenshotMode === "grid" ? 600 : 400,
                  }}
                >
                  Gallery
                </button>
                <button
                  type="button"
                  onClick={() => setScreenshotMode("stitch")}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "none",
                    cursor: "pointer",
                    background: screenshotMode === "stitch" ? "var(--surface)" : "transparent",
                    color: screenshotMode === "stitch" ? "var(--text)" : "var(--muted)",
                    fontWeight: screenshotMode === "stitch" ? 600 : 400,
                  }}
                >
                  Full Profile Scroll
                </button>
              </div>
              <Pill tone="green">{candidate.input.screenshots.length} captured</Pill>
            </div>
          </div>

          {screenshotMode === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 12 }}>
              {candidate.input.screenshots.map((src, index) => {
                const label = index === 0 ? "1. Top View (Photo & Identity)" : index === 1 ? "2. Mid View (Bio & Attributes)" : `${index + 1}. Scrolled View (Prompts & Badges)`;
                return (
                  <div key={src} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", background: "#000" }}>
                    <div style={{ padding: "7px 12px", fontSize: 11, color: "var(--muted)", background: "var(--surface-2)", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>{label}</span>
                      <a href={src} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 11, textDecoration: "none" }}>Open full ↗</a>
                    </div>
                    <a href={src} target="_blank" rel="noreferrer" title="Click to view full size">
                      <img src={src} alt={`${candidate.input.displayName} screen ${index + 1}`} style={{ width: "100%", height: "auto", display: "block" }} />
                    </a>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <div style={{ width: "100%", maxWidth: 420, borderRadius: 24, overflow: "hidden", border: "4px solid var(--line)", boxShadow: "0 20px 40px rgba(0,0,0,0.4)", background: "#000" }}>
                <div style={{ background: "var(--surface-2)", padding: "8px 16px", fontSize: 12, color: "var(--muted)", borderBottom: "1px solid var(--line)", textAlign: "center" }}>
                  Continuous Phone Profile Mockup
                </div>
                <div style={{ maxHeight: 680, overflowY: "auto" }}>
                  {candidate.input.screenshots.map((src, index) => (
                    <img
                      key={src}
                      src={src}
                      alt={`${candidate.input.displayName} screen ${index + 1}`}
                      style={{ width: "100%", height: "auto", display: "block" }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {candidate.analysis && <div className="dashboard-grid evidence-grid"><section className="panel"><div className="panel-title"><div><p className="kicker">FACTS</p><h2>Explicit information</h2></div><Pill tone="green">{candidate.analysis.facts.length} items</Pill></div><div className="evidence-list">{candidate.analysis.facts.map((item, index) => <div key={`${item.field}-${index}`}><span>{item.field}</span><strong>{item.value}</strong></div>)}</div></section><section className="panel"><div className="panel-title"><div><p className="kicker">UNCERTAINTY</p><h2>Inferred or missing</h2></div></div>{candidate.analysis.inferences.map((item, index) => <div className="inference" key={`${item.field}-${index}`}><Info size={14} /><span>Bio may indicate <strong>{item.value}</strong><small>{Math.round(item.confidence * 100)}% text signal · not established fact</small></span></div>)}{candidate.analysis.unknowns.map((unknown) => <div className="unknown" key={unknown}><span>?</span>{sentenceCase(unknown)}</div>)}</section></div>}

      {/* Interactive Photo Lightbox Modal */}
      {selectedPhotoIndex !== null && candidate.input.profileImages && candidate.input.profileImages[selectedPhotoIndex] && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.88)",
            backdropFilter: "blur(10px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={() => setSelectedPhotoIndex(null)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "92vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
                marginBottom: 12,
                color: "#fff",
              }}
            >
              <div>
                <strong style={{ fontSize: 16 }}>{candidate.input.displayName}</strong>
                <span style={{ marginLeft: 8, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  Photo {selectedPhotoIndex + 1} of {candidate.input.profileImages.length}
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <a
                  href={candidate.input.profileImages[selectedPhotoIndex]}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: "#fff",
                    background: "rgba(255,255,255,0.15)",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 13,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <ExternalLink size={14} /> Full Resolution
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedPhotoIndex(null)}
                  style={{
                    background: "rgba(255,255,255,0.15)",
                    border: "none",
                    color: "#fff",
                    borderRadius: "50%",
                    width: 36,
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {candidate.input.profileImages.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPhotoIndex((prev) =>
                      prev! > 0 ? prev! - 1 : candidate.input.profileImages!.length - 1
                    )
                  }
                  style={{
                    position: "absolute",
                    left: -48,
                    background: "rgba(0,0,0,0.6)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#fff",
                    borderRadius: "50%",
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    zIndex: 10,
                  }}
                  title="Previous photo"
                >
                  <ChevronLeft size={22} />
                </button>
              )}

              <img
                src={candidate.input.profileImages[selectedPhotoIndex]}
                alt={`${candidate.input.displayName} full size`}
                style={{
                  maxWidth: "85vw",
                  maxHeight: "76vh",
                  borderRadius: 14,
                  boxShadow: "0 25px 60px rgba(0,0,0,0.8)",
                  objectFit: "contain",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              />

              {candidate.input.profileImages.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedPhotoIndex((prev) =>
                      prev! < candidate.input.profileImages!.length - 1 ? prev! + 1 : 0
                    )
                  }
                  style={{
                    position: "absolute",
                    right: -48,
                    background: "rgba(0,0,0,0.6)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#fff",
                    borderRadius: "50%",
                    width: 40,
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    zIndex: 10,
                  }}
                  title="Next photo"
                >
                  <ChevronRight size={22} />
                </button>
              )}
            </div>

            {candidate.input.photos?.[selectedPhotoIndex]?.observations && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {candidate.input.photos[selectedPhotoIndex].observations.map((obs) => (
                  <span
                    key={obs}
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      color: "#fff",
                    }}
                  >
                    {obs}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DecisionCard({ decision }: { decision: CompatibilityDecision }) {
  const tone = decision.label === "Strong potential match" ? "green" : decision.label === "Does not meet stated criteria" ? "red" : decision.label === "Insufficient information" ? "amber" : "violet";
  return (
    <section className="panel decision-card">
      <div className="decision-summary"><div><p className="kicker">ASSISTANT ASSESSMENT</p><Pill tone={tone}>{decision.label}</Pill><h2>{decision.score ?? "—"}<span>{decision.score !== null ? "/100" : " score"}</span></h2><p>{decision.explanation[0]}</p></div><div className="confidence-ring" style={{ "--confidence": `${decision.confidence * 360}deg` } as React.CSSProperties}><span><strong>{Math.round(decision.confidence * 100)}%</strong><small>confidence</small></span></div></div>
      {decision.conflicts.length > 0 && <div className="conflict-box"><CircleAlert size={18} /><div><strong>Explicit boundary conflict</strong>{decision.conflicts.map((conflict) => <p key={conflict}>{conflict}</p>)}</div></div>}
      <div className="dimension-grid">{decision.dimensions.map((dimension) => <div className="dimension" key={dimension.key}><div><span>{dimension.label}</span><strong>{dimension.score === null ? "Unknown" : `${dimension.score}%`}</strong></div><div className="score-track"><span style={{ width: `${dimension.score ?? 0}%` }} /></div><small>{dimension.unknown ? "Excluded from aggregate" : `${dimension.weight}% weight · ${dimension.evidence.join(", ") || "no direct overlap"}`}</small></div>)}</div>
      <div className="explanation-list">{decision.explanation.slice(1).map((line) => <p key={line}><Check size={14} />{line}</p>)}</div>
      <div className="engine-foot"><span>{decision.engineVersion}</span><span>{Math.round(decision.evidenceCoverage * 100)}% weighted evidence coverage</span></div>
    </section>
  );
}

function DecisionHistory({ candidates, onSelect }: { candidates: CandidateRecord[]; onSelect: (id: number) => void }) {
  const decisions = candidates.filter((candidate) => candidate.decision);
  return (
    <div><PageIntro kicker="AUDIT TRAIL" title="Decision history" copy="A reproducible record of what the engine concluded from the evidence available at that time." />
      <section className="panel">{decisions.length ? <div className="timeline">{decisions.map((candidate) => <button key={candidate.id} onClick={() => onSelect(candidate.id)}><span className="timeline-dot" /><div><small>{formatDate(candidate.updatedAt)}</small><h3>{candidate.input.displayName}</h3><p>{candidate.decision!.label} · {candidate.decision!.score ?? "unknown"}{candidate.decision!.score !== null ? "/100" : ""}</p></div><Pill tone={candidate.decision!.conflicts.length ? "red" : candidate.decision!.confidence < 0.4 ? "amber" : "green"}>{Math.round(candidate.decision!.confidence * 100)}% confidence</Pill></button>)}</div> : <EmptyState icon={History} title="No decisions yet" copy="Completed profile analyses will appear here with their evidence and engine version." />}</section>
    </div>
  );
}

function IntegrationsView({
  integrations,
  android,
  onAndroidCommand,
}: {
  integrations: IntegrationCapability[];
  android?: AndroidAgentState;
  onAndroidCommand: (
    command: "start" | "pause" | "launch" | "connect_wifi" | "disconnect_wifi" | "refresh_devices",
    runLimit?: number,
    ip?: string,
  ) => Promise<void>;
}) {
  const bumble = integrations.find((integration) => integration.id === "bumble");
  const [userRunLimit, setUserRunLimit] = useState<number>(0);
  const [wifiIpInput, setWifiIpInput] = useState("192.168.0.2:5555");
  const [busy, setBusy] = useState(false);
  const runLimit = userRunLimit;

  const deviceReady = Boolean(android?.deviceConnected);
  const isRequested = Boolean(android?.requestedRunning);
  const isRunning = Boolean(android?.running);

  const isEmulator = Boolean(android?.deviceSerial?.startsWith("emulator-"));
  const isWifi = Boolean(android?.deviceSerial?.includes(":"));
  const isUsb = Boolean(deviceReady && !isEmulator && !isWifi);

  async function handleCmd(
    cmd: "start" | "pause" | "launch" | "connect_wifi" | "disconnect_wifi" | "refresh_devices",
    ip?: string,
  ) {
    setBusy(true);
    try {
      await onAndroidCommand(cmd, runLimit, ip);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageIntro
        kicker="AUTOMATION CONTROLLERS"
        title="Connect Bumble"
        copy="Pairwise supports native Apple Silicon Android Emulators, Wi-Fi Wireless Debugging, and USB Cable automation. Visible profiles are scored locally, evaluated against your criteria, and swiped automatically."
      />

      {/* Connection Hardware Switcher Cards */}
      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">
          <div>
            <p className="kicker">HARDWARE TARGETS & CONNECTION STATUS</p>
            <h2>Automation Device Selector</h2>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void handleCmd("refresh_devices")}
            style={{ fontSize: 12, padding: "5px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <RefreshCw size={13} /> Refresh Devices
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 12 }}>
          {/* 1. Native ARM64 Emulator Card */}
          <div
            style={{
              padding: "16px",
              background: isEmulator ? "rgba(139, 92, 246, 0.08)" : "var(--surface-2)",
              borderRadius: 12,
              border: isEmulator ? "2px solid var(--accent)" : "1px solid var(--line)",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Cpu size={18} color={isEmulator ? "var(--accent)" : "var(--muted)"} />
                <strong style={{ fontSize: 14, color: "var(--foreground)" }}>Native ARM64 Emulator</strong>
              </div>
              <Pill tone={isEmulator ? "violet" : "neutral"}>
                {isEmulator ? "Active Target" : "Available"}
              </Pill>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px 0", lineHeight: 1.5 }}>
              Pixel 5 Virtual Machine running locally on your Mac. <strong>Frees your phone completely</strong> for personal calls and apps.
            </p>
            <div style={{ fontSize: 12, color: "var(--foreground)", background: "var(--surface)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--line)" }}>
              Serial: <code>{isEmulator ? android?.deviceSerial : "emulator-5554"}</code>
            </div>
          </div>

          {/* 2. Wi-Fi Wireless Debugging Card */}
          <div
            style={{
              padding: "16px",
              background: isWifi ? "rgba(34, 197, 94, 0.08)" : "var(--surface-2)",
              borderRadius: 12,
              border: isWifi ? "2px solid var(--green)" : "1px solid var(--line)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Wifi size={18} color={isWifi ? "var(--green)" : "var(--muted)"} />
                <strong style={{ fontSize: 14, color: "var(--foreground)" }}>Wi-Fi Wireless Debugging</strong>
              </div>
              <Pill tone={isWifi ? "green" : "neutral"}>
                {isWifi ? "Connected" : "Disconnected"}
              </Pill>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px 0", lineHeight: 1.5 }}>
              Connect wirelessly to your physical phone without cables over local Wi-Fi.
            </p>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="text"
                value={wifiIpInput}
                onChange={(e) => setWifiIpInput(e.target.value)}
                placeholder="192.168.0.2:5555"
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 6,
                  background: "var(--surface)",
                  color: "var(--foreground)",
                  border: "1px solid var(--line)",
                }}
              />
              {isWifi ? (
                <button
                  type="button"
                  className="danger-button"
                  disabled={busy}
                  style={{ fontSize: 12, padding: "5px 10px" }}
                  onClick={() => void handleCmd("disconnect_wifi", wifiIpInput)}
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  style={{ fontSize: 12, padding: "5px 10px" }}
                  onClick={() => void handleCmd("connect_wifi", wifiIpInput)}
                >
                  Connect
                </button>
              )}
            </div>
          </div>

          {/* 3. Physical USB Cable Card */}
          <div
            style={{
              padding: "16px",
              background: isUsb ? "rgba(59, 130, 246, 0.08)" : "var(--surface-2)",
              borderRadius: 12,
              border: isUsb ? "2px solid #3b82f6" : "1px solid var(--line)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Smartphone size={18} color={isUsb ? "#3b82f6" : "var(--muted)"} />
                <strong style={{ fontSize: 14, color: "var(--foreground)" }}>Physical USB Cable</strong>
              </div>
              <Pill tone={isUsb ? "green" : "neutral"}>
                {isUsb ? "Plugged In" : "Unplugged"}
              </Pill>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px 0", lineHeight: 1.5 }}>
              Direct USB-C cable connection to your physical phone. Auto-detected upon plugging in.
            </p>
            <div style={{ fontSize: 12, color: "var(--foreground)", background: "var(--surface)", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--line)" }}>
              {isUsb ? `Model: ${android?.deviceModel || "Android Device"}` : "Plug in phone via USB"}
            </div>
          </div>
        </div>
      </section>

      {/* Active Device Controller Hero */}
      <section className={`panel bridge-hero ${deviceReady ? "connected" : ""}`}>
        <div className="bridge-status">
          <div className={`integration-icon ${deviceReady ? "available" : "diagnostic-only"}`}>
            {isEmulator ? <Cpu /> : isWifi ? <Wifi /> : <Smartphone />}
          </div>
          <div>
            <p className="kicker">
              {deviceReady
                ? isEmulator
                  ? "NATIVE ARM64 EMULATOR CONNECTED"
                  : isWifi
                  ? "ANDROID WI-FI DEBUGGING CONNECTED"
                  : "ANDROID USB CONNECTED"
                : "ANDROID SETUP REQUIRED"}
            </p>
            <h2>
              {deviceReady
                ? isEmulator
                  ? "Native ARM64 Android Emulator (Pixel 5)"
                  : isWifi
                  ? `Wireless Android Phone (${android?.deviceModel || "Device"})`
                  : `Android Phone (${android?.deviceModel || "USB Device"})`
                : "Connect Android Device"}
            </h2>
            <p>
              {deviceReady
                ? isEmulator
                  ? `Virtual Device ${android?.deviceSerial} is running natively on your Apple Silicon Mac. Your phone is completely free! ${
                      android?.appForeground
                        ? "Bumble app is active in foreground."
                        : "Bumble is not in the foreground."
                    } ${android?.controllerAlive ? "Local runner is active." : "Starting runner..."}`
                : `Device ${android?.deviceSerial} is connected via ${isWifi ? "Wi-Fi (Wireless)" : "USB"}. ${
                    android?.appForeground
                      ? "Bumble app is active in foreground."
                      : "Bumble is not in the foreground."
                  } ${android?.controllerAlive ? "Local runner is active." : "Starting runner..."}`
                : "Launch the native emulator or connect your phone via USB / Wi-Fi debugging."}
            </p>
          </div>
        </div>

        <div className="bridge-steps">
          <div>
            <span>1</span>
            <strong>{isEmulator ? "Native Emulator" : isWifi ? "Wi-Fi Debugging" : "USB Debugging"}</strong>
            <small>{deviceReady ? `Target: ${android?.deviceSerial}` : "Not connected"}</small>
          </div>
          <div>
            <span>2</span>
            <strong>Open Bumble</strong>
            <small>{android?.appForeground ? "Bumble active" : "Launch Bumble on device"}</small>
          </div>
          <div>
            <span>3</span>
            <strong>Run Limit</strong>
            <small>{runLimit > 0 ? `Profiles: ${runLimit}` : "Unlimited (continuous)"}</small>
          </div>
          <div>
            <span>4</span>
            <strong>Agent Status</strong>
            <small>{isRunning ? "Actively swiping" : isRequested ? "Starting run..." : "Ready to start"}</small>
          </div>
        </div>

        {android?.lastError && (
          <div className="inline-error" style={{ margin: "12px 0" }}>
            <CircleAlert size={16} />
            <span>{android.lastError}</span>
          </div>
        )}

        <div className="button-row" style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {isRequested ? (
            <button className="danger-button" disabled={busy} onClick={() => void handleCmd("pause")}>
              <Pause size={15} /> Pause Android agent
            </button>
          ) : (
            <button className="primary-button" disabled={busy || !deviceReady} onClick={() => void handleCmd("start")}>
              <Play size={15} /> Start Android agent
            </button>
          )}

          {!android?.appForeground && deviceReady && (
            <button className="secondary-button" disabled={busy} onClick={() => void handleCmd("launch")}>
              Launch Bumble
            </button>
          )}

          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <label style={{ fontSize: 13, color: "var(--muted)" }}>Run limit:</label>
            <select
              value={runLimit}
              disabled={isRequested}
              onChange={(e) => setUserRunLimit(Number(e.target.value))}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                background: "var(--surface-2)",
                color: "var(--foreground)",
                border: "1px solid var(--line)",
              }}
            >
              <option value={0}>Unlimited (continuous)</option>
              <option value={50}>50 profiles</option>
              <option value={100}>100 profiles</option>
              <option value={200}>200 profiles</option>
              <option value={250}>250 profiles</option>
              <option value={500}>500 profiles</option>
            </select>
          </div>

          {deviceReady && (
            <div style={{ fontSize: 13, color: "var(--muted)", width: "100%", marginTop: 6 }}>
              Processed: <strong>{android?.processed ?? 0}</strong> {runLimit > 0 ? ` / ${runLimit}` : "(Continuous mode)"} &nbsp;·&nbsp;
              Likes: <strong style={{ color: "var(--green)" }}>{android?.likes ?? 0}</strong> &nbsp;·&nbsp;
              Passes: <strong>{android?.passes ?? 0}</strong>
              {android?.lastAction && ` · Last action: ${android.lastAction.toUpperCase()}`}
              {isEmulator && (
                <span style={{ marginLeft: 10, color: "var(--accent)", fontWeight: 500 }}>
                  🟣 Native Emulator Active ({android?.deviceSerial})
                </span>
              )}
              {isWifi && (
                <span style={{ marginLeft: 10, color: "var(--green)", fontWeight: 500 }}>
                  📡 Wireless Wi-Fi Active ({android?.deviceSerial})
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Bumble Web Browser Controller Hero */}
      <section className={`panel bridge-hero ${bumble?.connected ? "connected" : ""}`}>
        <div className="bridge-status">
          <div className={`integration-icon ${bumble?.status ?? "diagnostic-only"}`}>
            <Laptop />
          </div>
          <div>
            <p className="kicker">{bumble?.connected ? "LIVE WEB CONNECTION" : "WEB EXTENSION SETUP"}</p>
            <h2>{bumble?.connected ? "Bumble Web is connected" : "Install the browser controller"}</h2>
            <p>{bumble?.detail}</p>
          </div>
        </div>
        <div className="bridge-steps">
          <div><span>1</span><strong>Start Pairwise</strong><small>Keep localhost:3000 open.</small></div>
          <div><span>2</span><strong>Load extension</strong><small>Chrome → Extensions → Developer mode → Load unpacked.</small></div>
          <div><span>3</span><strong>Open Bumble</strong><small>Open the profile queue on Bumble Web.</small></div>
          <div><span>4</span><strong>Press Start</strong><small>The agent evaluates and swipes automatically.</small></div>
        </div>
        <div className="button-row">
          <a className="primary-button" href="/pairwise-browser-extension.zip" download>
            <Download size={15} />Download extension
          </a>
          <code>/Users/raghav/datingCopilot/browser-extension</code>
        </div>
      </section>

      <div className="integration-grid secondary-integrations">
        {integrations
          .filter((integration) => integration.id !== "bumble" && integration.id !== "android")
          .map((integration) => (
            <section className="panel integration-card" key={integration.id}>
              <div className={`integration-icon ${integration.status}`}>
                {integration.id === "manual" ? <Upload /> : <Sparkles />}
              </div>
              <div className="integration-title">
                <div>
                  <h2>{integration.name}</h2>
                  <Pill tone="green">{integration.status}</Pill>
                </div>
                <p>{integration.detail}</p>
              </div>
              <div className="capability-list">
                <span>{integration.canReceiveCandidates ? <CircleCheck /> : <X />} Receive candidate data</span>
                <span>{integration.canActOnPlatform ? <CircleCheck /> : <X />} Perform platform actions</span>
              </div>
            </section>
          ))}
      </div>

      <section className="panel adapter-contract">
        <div>
          <p className="kicker">LIVE FLOW</p>
          <h2>One continuous agent loop</h2>
        </div>
        <div className="contract-flow">
          <span>Visible Bumble profile</span>
          <ChevronRight />
          <span>Local preference score</span>
          <ChevronRight />
          <span>Automatic Like / Pass</span>
          <ChevronRight />
          <span>Decision journal</span>
        </div>
        <p>Pause at any time from the app. The loop stops on missing controls, connection errors, or the configured run limit instead of guessing.</p>
      </section>
    </div>
  );
}

function SettingsView({ theme, onTheme, onRestored, onReset }: { theme: "light" | "dark"; onTheme: (theme: "light" | "dark") => void; onRestored: () => Promise<void>; onReset: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function restore(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const data = JSON.parse(await file.text()) as unknown;
      await requestJson("/api/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      await onRestored();
    } finally { setBusy(false); }
  }
  return (
    <div><PageIntro kicker="CONTROL ROOM" title="Settings & privacy" copy="Inspect, back up, restore, or erase the local workspace without relying on a cloud account." />
      <div className="settings-grid">
        <section className="panel settings-section"><div className="settings-icon"><Sun size={19} /></div><div><h2>Appearance</h2><p>Choose a calm light canvas or a low-glare dark workspace.</p><div className="segmented"><button className={theme === "light" ? "active" : ""} onClick={() => onTheme("light")}><Sun size={15} />Light</button><button className={theme === "dark" ? "active" : ""} onClick={() => onTheme("dark")}><Moon size={15} />Dark</button></div></div></section>
        <section className="panel settings-section"><div className="settings-icon"><BrainCircuit size={19} /></div><div><h2>AI provider</h2><p>The deterministic local fallback is active. No personal data is sent to an external model.</p><div className="setting-status"><StatusDot tone="green" />Local engine active</div><button className="secondary-button" disabled>External providers require a consented server adapter</button></div></section>
        <section className="panel settings-section"><div className="settings-icon"><Database size={19} /></div><div><h2>Backup & restore</h2><p>Export preferences and candidate inputs as a portable JSON backup. Photo files are never included.</p><div className="button-row"><a className="secondary-button" href="/api/export" download><Download size={15} />Export backup</a><button className="secondary-button" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={15} />{busy ? "Restoring…" : "Restore backup"}</button><input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => void restore(e.target.files?.[0])} /></div></div></section>
        <section className="panel settings-section danger-zone"><div className="settings-icon"><Trash2 size={19} /></div><div><h2>Reset local data</h2><p>Delete preferences, candidates, decisions, jobs, and activity from this local database. This cannot be undone unless you exported a backup.</p><button className="danger-button" onClick={async () => { if (!window.confirm("Reset all Pairwise data on this Mac? Export a backup first if needed.")) return; await onReset(); }}>Reset Pairwise</button></div></section>
      </div>
      <section className="panel privacy-manifesto"><ShieldCheck size={28} /><div><p className="kicker">PRIVACY MANIFEST</p><h2>What Pairwise does not store</h2><div className="not-stored"><span>Bumble passwords</span><span>Session cookies</span><span>Authentication tokens</span><span>Uploaded photo files</span><span>Protected-trait scores</span><span>External AI transcripts</span></div></div></section>
    </div>
  );
}

function ProfileOptimizerView({ preferences }: { preferences: Preferences | null }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const bios = [
    {
      id: "bio-1",
      title: "1. The Spontaneous Banter Bio",
      tag: "Highest Message Reply Rate",
      text: "6'0 (in my dreams), enthusiast of spontaneous 2 AM drives, great food, and questionable life choices. Let's get drinks and argue about which movie has the best soundtrack. (You can pick the place if you have good taste) 🍸✨",
      notes: "Witty, low pressure, makes girls smile and gives them an effortless opening to banter back.",
    },
    {
      id: "bio-2",
      title: "2. The Playful Foodie & Adventure Bio",
      tag: "Best for Casual Dates & Drinks",
      text: "Probably searching for the best sushi in town, or out planning my next getaway. Easygoing, ambitious, and dangerously good at cocktail recipes. Swipe right if you're fun to talk to and don't take life too seriously ✈️🍝",
      notes: "Demonstrates lifestyle, taste, and sets up a natural drink/food date without being pushy.",
    },
    {
      id: "bio-3",
      title: "3. The Confident & Direct Vibe Bio",
      tag: "Sharp & Hookup / Casual Oriented",
      text: "Work hard, vibe harder. Down for good coffee, casual drinks, and discovering hidden spots in the city. Tell me your top 3 pet peeves and I'll judge you accordingly 👀🍷",
      notes: "Clear, confident masculine tone. Women love responding to the 'top 3 pet peeves' challenge.",
    },
  ];

  const prompts = [
    {
      id: "pr-1",
      question: "We'll get along if...",
      answer: "You can banter, don't ask 'so what do you do for fun', and agree that dessert is mandatory on a first date.",
    },
    {
      id: "pr-2",
      question: "The quickest way to my heart is...",
      answer: "Sending the first message with an absurd meme or a wildly controversial food opinion.",
    },
    {
      id: "pr-3",
      question: "My ideal date involves...",
      answer: "A rooftop drink where the conversation gets deeper than our cocktails, followed by late-night pizza.",
    },
    {
      id: "pr-4",
      question: "Two truths and a lie...",
      answer: "I make an elite pasta, I once won a dance battle by accident, and I'm totally normal about dogs.",
    },
  ];

  return (
    <div>
      <PageIntro
        kicker="CHARM & CONVERSION LAB"
        title="Profile Optimizer Studio"
        copy="Optimized bio formulas, conversational prompt pairings, and photo strategies tailored to maximize match velocity and casual dating conversion."
      />

      <div style={{ display: "grid", gap: 16 }}>
        {/* Strategy Overview Banner */}
        <section className="panel" style={{ borderLeft: "4px solid var(--accent)", background: "var(--surface-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <p className="kicker">OPTIMIZATION STRATEGY</p>
              <h2 style={{ margin: "4px 0" }}>Casual & Hookup Appeal (Maximum Match Velocity)</h2>
              <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", maxWidth: 700 }}>
                On Bumble, <strong>women must message first</strong>. If your profile is dry or overly serious, they swipe left or let matches expire. The winning strategy is: high-vibe playful bio + curiosity prompts + sharp visual lighting.
              </p>
            </div>
            <Pill tone="green">Active target: {preferences?.policy === "exploratory" ? "Exploratory / High Volume" : "Balanced"}</Pill>
          </div>
        </section>

        {/* 3 Winning Bios */}
        <section className="panel">
          <div className="panel-title">
            <div>
              <p className="kicker">READY-TO-USE FORMULAS</p>
              <h2>High-Converting Bumble Bios</h2>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>
            Click "Copy to clipboard" and paste directly into your Bumble profile edit screen.
          </p>

          <div style={{ display: "grid", gap: 16 }}>
            {bios.map((b) => (
              <div key={b.id} style={{ padding: "16px 20px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <strong style={{ fontSize: 15, color: "var(--foreground)" }}>{b.title}</strong>
                    <Pill tone="violet">{b.tag}</Pill>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ fontSize: 12, padding: "5px 12px", display: "inline-flex", alignItems: "center", gap: 6 }}
                    onClick={() => copy(b.text, b.id)}
                  >
                    {copiedKey === b.id ? <Check size={14} /> : <Copy size={14} />}
                    {copiedKey === b.id ? "Copied!" : "Copy bio"}
                  </button>
                </div>
                <div style={{ padding: "12px 16px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--line)", fontStyle: "italic", fontSize: 14, lineHeight: 1.6, color: "var(--foreground)" }}>
                  "{b.text}"
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0 0" }}>
                  💡 <em>{b.notes}</em>
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Bumble Prompt Combos */}
        <section className="panel">
          <div className="panel-title">
            <div>
              <p className="kicker">CONVERSATIONAL TRIGGERS</p>
              <h2>High-Response Bumble Prompts</h2>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>
            These prompts give women the easiest possible opening lines to start the conversation immediately.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
            {prompts.map((p) => (
              <div key={p.id} style={{ padding: "16px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--line)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", marginBottom: 6 }}>
                    {p.question}
                  </div>
                  <p style={{ fontSize: 14, color: "var(--foreground)", margin: 0, lineHeight: 1.5 }}>
                    {p.answer}
                  </p>
                </div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ fontSize: 11, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
                    onClick={() => copy(`${p.question}\n${p.answer}`, p.id)}
                  >
                    {copiedKey === p.id ? <Check size={12} /> : <Copy size={12} />}
                    {copiedKey === p.id ? "Copied" : "Copy prompt"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Photo Lineup Strategy Blueprint */}
        <section className="panel">
          <div className="panel-title">
            <div>
              <p className="kicker">VISUAL ATTRACTIVENESS AUDIT</p>
              <h2>Photo Lineup Blueprint (4-Photo Rule)</h2>
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>
            Calibrated against our AI Visual Rating engine (Clarity, Lighting, Vibrance, Composition).
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {[
              { slot: "Photo 1 (Lead)", title: "Clear Smile / Smirk Portrait", rule: "Waist-up or chest-up. Clear natural lighting. Direct eye contact. No sunglasses, hats, or group confusion.", target: "Target Clarity > 85%" },
              { slot: "Photo 2", title: "Full-Body & Fit Outfit", rule: "Fitted clothes, clean posture. Shows your height and build cleanly. Casual smart look (e.g. jacket/clean tee).", target: "Target Framing > 80%" },
              { slot: "Photo 3", title: "Social Proof / Dog / Travel", rule: "Shows you out in the world: cafe, concert, hike, or with a dog. Shows an active and interesting life.", target: "Target Vibrance > 80%" },
              { slot: "Photo 4", title: "Aesthetic Evening / Drink", rule: "Cocktail in hand or warm golden-hour lighting. Pre-frames the casual drink date in her mind.", target: "Target Lighting > 85%" },
            ].map((slot, idx) => (
              <div key={idx} style={{ padding: "16px", background: "var(--surface-2)", borderRadius: 12, border: "1px solid var(--line)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>{slot.slot}</span>
                <h3 style={{ fontSize: 15, margin: "6px 0 8px 0", color: "var(--foreground)" }}>{slot.title}</h3>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px 0", lineHeight: 1.5 }}>{slot.rule}</p>
                <Pill tone="green">{slot.target}</Pill>
              </div>
            ))}
          </div>
        </section>

        {/* Messaging & Casual Date Playbook */}
        <section className="panel">
          <div className="panel-title">
            <div>
              <p className="kicker">EXECUTION PLAYBOOK</p>
              <h2>The 10-Message Conversion Blueprint</h2>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 12 }}>
            <div style={{ padding: "14px 16px", background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
              <strong style={{ color: "var(--accent)", fontSize: 13 }}>Step 1: The Opener Reply</strong>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0 0", lineHeight: 1.5 }}>
                Never say "hey" or "how's your day". Playfully challenge or teass her about her opener or prompt.
              </p>
            </div>
            <div style={{ padding: "14px 16px", background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
              <strong style={{ color: "var(--accent)", fontSize: 13 }}>Step 2: Quick Banter (Messages 3–7)</strong>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0 0", lineHeight: 1.5 }}>
                Talk about drinks, food, or funny pet peeves. Keep replies fast and playful.
              </p>
            </div>
            <div style={{ padding: "14px 16px", background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
              <strong style={{ color: "var(--accent)", fontSize: 13 }}>Step 3: Move off Bumble (Messages 8–10)</strong>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0 0", lineHeight: 1.5 }}>
                <em>"I'm terrible at checking Bumble notifications. Let's move to IG or WhatsApp: [Your Handle / Number]"</em>
              </p>
            </div>
            <div style={{ padding: "14px 16px", background: "var(--surface-2)", borderRadius: 10, border: "1px solid var(--line)" }}>
              <strong style={{ color: "var(--accent)", fontSize: 13 }}>Step 4: Low-Pressure Date Offer</strong>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0 0", lineHeight: 1.5 }}>
                <em>"Are you free for a quick cocktail / coffee Thursday evening? Let's check if you're as fun in person."</em>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
