import { closeDatabase, getDatabase, processDueJobs } from "../src/lib/db";

const db = getDatabase();
let active = false;

function tick() {
  if (active) return;
  active = true;
  try {
    processDueJobs(db, 3);
  } catch (error) {
    console.error("Pairwise worker encountered a local processing error.", error instanceof Error ? error.message : "unknown");
  } finally {
    active = false;
  }
}

tick();
const timer = setInterval(tick, 2_000);

function shutdown() {
  clearInterval(timer);
  closeDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
