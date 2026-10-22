import { createHash } from "node:crypto";
import type { ProfilePrompt } from "./types";

export interface AndroidBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AndroidUiNode {
  text: string;
  description: string;
  resourceId: string;
  className: string;
  clickable: boolean;
  visible: boolean;
  bounds: AndroidBounds | null;
}

export interface AndroidVisibleProfile {
  ready: boolean;
  displayName: string;
  age: number | null;
  location: string;
  distanceKm: number | null;
  rawText: string;
  prompts: string[];
  cleanBio?: string;
  structuredPrompts?: ProfilePrompt[];
  signature: string;
  nodes: AndroidUiNode[];
}

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function parseAttributes(source: string) {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:-]+)="([^"]*)"/g)) attributes[match[1]] = decodeXml(match[2]);
  return attributes;
}

function parseBounds(value: string | undefined): AndroidBounds | null {
  const match = value?.match(/^\[(\d+),(\d+)]\[(\d+),(\d+)]$/);
  return match
    ? { left: Number(match[1]), top: Number(match[2]), right: Number(match[3]), bottom: Number(match[4]) }
    : null;
}

export function parseAndroidUiXml(xml: string): AndroidUiNode[] {
  const nodes: AndroidUiNode[] = [];
  for (const match of xml.matchAll(/<node\s+([^>]*?)(?:\/>|>)/g)) {
    const attributes = parseAttributes(match[1]);
    nodes.push({
      text: attributes.text?.trim() ?? "",
      description: attributes["content-desc"]?.trim() ?? "",
      resourceId: attributes["resource-id"] ?? "",
      className: attributes.class ?? "",
      clickable: attributes.clickable === "true",
      visible: attributes["visible-to-user"] !== "false",
      bounds: parseBounds(attributes.bounds),
    });
  }
  return nodes;
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const CHROME_LABELS = new Set([
  "people", "chats", "profile", "back", "filters", "filter", "settings", "menu", "like", "pass", "nope",
  "swipe left", "swipe right", "not interested", "super swipe", "superswipe", "compliment", "send a compliment",
  "photo", "more options", "report", "share profile", "bumble", "notifications",
]);

function contentLabels(nodes: AndroidUiNode[]) {
  const values: string[] = [];
  for (const node of nodes.filter((item) => item.visible)) {
    for (const value of [node.text, node.description]) {
      const line = clean(value);
      const normalized = normalize(line);
      if (!line || CHROME_LABELS.has(normalized) || /^\d{1,2}:\d{2}$/.test(line) || /^\d+%$/.test(line)) continue;
      if (!values.includes(line)) values.push(line);
    }
  }
  return values;
}

function findIdentity(labels: string[]) {
  for (const label of labels.slice(0, 40)) {
    const match = label.match(/^(.{2,70}?)(?:,|·|\s)\s*(1[89]|[2-9]\d)$/u);
    if (match && /\p{L}/u.test(match[1])) return { displayName: clean(match[1]), age: Number(match[2]) };
  }
  for (let index = 0; index < Math.min(labels.length - 1, 30); index += 1) {
    if (/^(1[89]|[2-9]\d)$/.test(labels[index + 1]) && /^[\p{L}][\p{L}\p{M}'’ -]{1,60}$/u.test(labels[index])) {
      return { displayName: labels[index], age: Number(labels[index + 1]) };
    }
  }
  const name = labels.find((label) => /^[\p{L}][\p{L}\p{M}'’ -]{1,40}$/u.test(label) && !CHROME_LABELS.has(normalize(label)));
  const age = labels.find((label) => /^(1[89]|[2-9]\d)$/.test(label));
  return { displayName: name ?? "Bumble profile", age: age ? Number(age) : null };
}

function hasActionControl(nodes: AndroidUiNode[]) {
  return nodes.some(
    (node) =>
      /^(like|pass|nope|not interested|swipe left|swipe right)$/i.test(clean(node.description || node.text))
      || /encounters/i.test(node.resourceId)
      || /profile_root/i.test(node.resourceId)
      || /discovery_root|discovery_screen/i.test(node.resourceId)
      || /send a compliment|main photo/i.test(clean(node.description || node.text))
      || /superswipe/i.test(clean(node.description || node.text)),
  );
}

const SECTION_HEADERS = new Set([
  "note", "send superswipe", "discover", "liked you", "profile card", "about me", "my interests",
  "my causes and communities", "languages", "my location", "not for me", "block", "report",
  "recommend to a friend", "photo verified", "new here", "we have things in common",
  "things we can talk about", "i’m looking for", "im looking for", "i'm looking for",
  "compliment", "send a compliment", "share profile", "people", "chats",
]);

function isSectionHeader(line: string): boolean {
  const norm = line.trim().toLowerCase();
  if (SECTION_HEADERS.has(norm)) return true;
  if (/^(?:height|exercise|education|drinking|smoking|gender|kids|have kids|zodiac|politics|religion|work|job)\s*[-:]/i.test(line)) return true;
  if (line.includes(" - ")) return true;
  if (/^\d+\s*km away$/i.test(line)) return true;
  if (/^interest,\s+/i.test(line)) return true;
  return false;
}

const PROMPT_STARTERS = /^(?:my ultimate green flag is|i probably shouldn’t admit this, but|i probably shouldnt admit this, but|what makes a relationship great is|love, to me, means building|one thing you need to know about me is|my ideal date involves|i'll know we're a good match if|ill know we're a good match if|the quickest way to my heart is|when my phone dies i|you'll probably run into me at|convince me that|i'm ready for someone who|im ready for someone who|if you could have dinner with anyone|we'll get along if|two truths and a lie|my simple pleasures|after work you can find me|a quick rant about|i'm hoping you|my healthy obsession is|favorite quality in a person|swipe right if|i get way too excited about|the key to my heart is|a non-negotiable|my motto is|together, we could|a great first date|i’m known for|i'm known for|never have i ever|if i could only eat one food|if you were a vegetable|something i've always wanted to try|the best way to ask me out is|i'm a 10 but|my real life superpower is|i promise i won't|i'm looking for someone who|i feel most empowered when|my personal brand is|best travel story)/i;

function isPromptQuestion(line: string): boolean {
  const cleanLine = line.trim();
  if (cleanLine.length < 8 || cleanLine.length > 80) return false;
  if (isSectionHeader(cleanLine)) return false;
  if (PROMPT_STARTERS.test(cleanLine)) return true;
  if (/\?$/.test(cleanLine)) return true;
  if (/(?:\b(?:is|if|that|involves|about|means|but|when|who|for|with|from|on|to|at))$/i.test(cleanLine) && !/\bat [A-Z]/i.test(cleanLine)) return true;
  return false;
}

export function extractBioAndPrompts(rawText: string, labels: string[] = []): {
  bio: string;
  prompts: ProfilePrompt[];
  promptStrings: string[];
} {
  const lines = (labels.length > 0 ? labels : rawText.split("\n")).map((l) => l.trim()).filter(Boolean);
  let bio = "";
  const prompts: ProfilePrompt[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect explicit bio
    if (/^my bio$/i.test(line)) {
      const bioLines: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (isSectionHeader(lines[j]) || isPromptQuestion(lines[j])) break;
        bioLines.push(lines[j]);
      }
      if (bioLines.length > 0) {
        bio = bioLines.join("\n").trim();
      }
    }

    // Detect prompts
    if (isPromptQuestion(line)) {
      const answerLines: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (isSectionHeader(lines[j]) || isPromptQuestion(lines[j])) break;
        answerLines.push(lines[j]);
      }
      if (answerLines.length > 0) {
        const answer = answerLines.join("\n").trim();
        if (answer.length > 0 && !prompts.some((p) => p.question.toLowerCase() === line.toLowerCase())) {
          prompts.push({ question: line, answer });
        }
      }
    }
  }

  // Fallback bio detection if no "my bio" header was present
  if (!bio) {
    const candidateBio = lines.find((l) =>
      l.length >= 35 &&
      l.length <= 800 &&
      !isSectionHeader(l) &&
      !isPromptQuestion(l) &&
      !prompts.some((p) => p.answer.includes(l)) &&
      !/^\d/.test(l) &&
      !/^(?:People|Chats|Profile|Send SuperSwipe|Recommend|Discover|Liked You)/i.test(l)
    );
    if (candidateBio) {
      bio = candidateBio;
    }
  }

  const promptStrings = prompts.map((p) => `${p.question}: ${p.answer}`);
  return { bio, prompts, promptStrings };
}

export function extractAndroidProfile(xml: string): AndroidVisibleProfile {
  const nodes = parseAndroidUiXml(xml);
  const labels = contentLabels(nodes);
  const identity = findIdentity(labels);
  const locationLine = labels.find((label) => /^(?:lives in|located in|from)\s+/i.test(label));
  const distanceLine = labels.find((label) => /\d+(?:\.\d+)?\s*(?:km|kilomet)/i.test(label));
  const distanceMatch = distanceLine?.match(/(\d+(?:\.\d+)?)\s*(?:km|kilomet)/i);
  const rawText = labels.join("\n").slice(0, 12000);
  const { bio: cleanBio, prompts: structuredPrompts, promptStrings } = extractBioAndPrompts(rawText, labels);
  const fallbackPrompts = labels.filter((label) => label.length >= 18 && label.length <= 500 && /\?|\b(?:i|my|we|you)\b/i.test(label)).slice(0, 12);
  const prompts = promptStrings.length > 0 ? promptStrings : fallbackPrompts;
  const stableText = labels.filter((label) => !/\b(?:online|new here|active now)\b/i.test(label)).join("|");
  const signature = createHash("sha256")
    .update(`${identity.displayName}|${identity.age ?? ""}|${stableText}`)
    .digest("hex");
  return {
    ready: hasActionControl(nodes) && labels.length >= 2,
    ...identity,
    location: locationLine?.replace(/^(?:lives in|located in|from)\s+/i, "") ?? "",
    distanceKm: distanceMatch ? Number(distanceMatch[1]) : null,
    rawText,
    prompts,
    cleanBio,
    structuredPrompts,
    signature,
    nodes,
  };
}

function targetForLabels(nodes: AndroidUiNode[], labels: RegExp[]) {
  const target = nodes.find((node) => {
    if (!node.visible || !node.bounds) return false;
    const value = clean(node.description || node.text);
    return labels.some((label) => label.test(value));
  });
  if (!target?.bounds) return null;
  return {
    x: Math.round((target.bounds.left + target.bounds.right) / 2),
    y: Math.round((target.bounds.top + target.bounds.bottom) / 2),
  };
}

export function findAndroidActionTarget(xml: string, action: "like" | "pass") {
  const nodes = parseAndroidUiXml(xml);
  return targetForLabels(
    nodes,
    action === "like" ? [/^like$/i, /^yes$/i, /^swipe right$/i] : [/^pass$/i, /^nope$/i, /^not interested$/i, /^swipe left$/i],
  );
}

export function findAndroidContinueTarget(xml: string) {
  return targetForLabels(parseAndroidUiXml(xml), [
    /^keep swiping$/i,
    /^continue swiping$/i,
    /^not now$/i,
    /^maybe later$/i,
    /^continue$/i,
    /^get started$/i,
    /^close$/i,
    /^got it$/i,
    /^dismiss$/i,
    /^skip$/i,
  ]);
}

export function findAndroidExpandTarget(xml: string) {
  return targetForLabels(parseAndroidUiXml(xml), [/^see more$/i, /^read more$/i, /^more about .+$/i]);
}

export function detectAndroidBlockingState(xml: string) {
  const text = contentLabels(parseAndroidUiXml(xml)).join(" ");
  if (/out of likes|no more likes|try again tomorrow|come back tomorrow/i.test(text)) return "Bumble reports that no more likes are available right now.";
  if (/verify (?:yourself|your profile|it.?s you)|photo verification required/i.test(text)) return "Bumble is waiting for profile verification on the phone.";
  if (/sign in|log in|enter your phone number/i.test(text)) return "Bumble is waiting for you to sign in on the phone.";
  return null;
}

export function createAndroidSwipe(
  action: "like" | "pass",
  screen: { width: number; height: number },
) {
  const y = Math.round(screen.height * 0.58);
  const startX = Math.round(screen.width * (action === "like" ? 0.28 : 0.72));
  const endX = Math.round(screen.width * (action === "like" ? 0.82 : 0.18));
  return { startX, startY: y, endX, endY: y, durationMs: 340 };
}

export function createAndroidScroll(
  screen: { width: number; height: number },
  direction: "down" | "up" = "down",
) {
  const x = Math.round(screen.width * 0.5);
  const startY = Math.round(screen.height * (direction === "down" ? 0.72 : 0.32));
  const endY = Math.round(screen.height * (direction === "down" ? 0.32 : 0.72));
  return { startX: x, startY, endX: x, endY, durationMs: 420 };
}

export function isEndOfProfileCard(nodes: AndroidUiNode[], rawText: string): boolean {
  // Check if true bottom elements exist among nodes
  const hasBottomFooterNode = nodes.some((n) => {
    const val = (n.text || n.description || "").trim().toLowerCase();
    // Exclude header buttons located near top of screen (y < 600)
    if (n.bounds && n.bounds.top < 600) return false;
    return (
      val === "block" ||
      val === "report" ||
      val === "not for me" ||
      val === "block & report" ||
      val === "block and report" ||
      val === "hide and report" ||
      /report\s+(?:profile|[a-z0-9'’]+)/i.test(val) ||
      /safety\s*(?:&|and)\s*support/i.test(val) ||
      /community guidelines/i.test(val) ||
      /share (?:[a-z0-9'’]+'s )?profile/i.test(val)
    );
  });

  if (hasBottomFooterNode) return true;

  // If nodes have bounds and "Recommend to a friend" is only near the top header, ignore it
  const isTopRecommendOnly = nodes.some(
    (n) => /recommend to a friend/i.test(n.text || n.description) && n.bounds && n.bounds.top < 600
  );

  const combined = [
    rawText,
    ...nodes.map((n) => `${n.text || ""} ${n.description || ""}`),
  ].join(" ").toLowerCase();

  if (
    /block\s*(?:&|and)\s*report/i.test(combined) ||
    /hide and report/i.test(combined) ||
    /report\s+(?:profile|[a-z0-9'’]+)/i.test(combined) ||
    /safety\s*(?:&|and)\s*support/i.test(combined) ||
    /community guidelines/i.test(combined) ||
    /share (?:[a-z0-9'’]+'s )?profile/i.test(combined)
  ) {
    return true;
  }

  if (!isTopRecommendOnly && /recommend to a friend/i.test(combined)) {
    return true;
  }

  return false;
}

export function mergeAndroidProfiles(
  first: AndroidVisibleProfile,
  second: AndroidVisibleProfile,
): AndroidVisibleProfile {
  const lines = [...new Set([...first.rawText.split("\n"), ...second.rawText.split("\n")])].map((l) => l.trim()).filter(Boolean);
  const rawText = lines.join("\n").slice(0, 12000);
  const extracted = extractBioAndPrompts(rawText);
  const cleanBio = first.cleanBio || second.cleanBio || extracted.bio;
  const structuredPrompts = [
    ...(first.structuredPrompts || []),
    ...(second.structuredPrompts || []),
    ...extracted.prompts,
  ].filter((p, i, arr) => arr.findIndex((x) => x.question === p.question) === i);
  const prompts = [...new Set([...first.prompts, ...second.prompts, ...extracted.promptStrings])].slice(0, 15);
  return {
    ready: first.ready || second.ready,
    displayName: first.displayName !== "Bumble profile" ? first.displayName : second.displayName,
    age: first.age ?? second.age,
    location: first.location || second.location,
    distanceKm: first.distanceKm ?? second.distanceKm,
    rawText,
    prompts,
    cleanBio,
    structuredPrompts,
    signature: first.signature,
    nodes: [...first.nodes, ...second.nodes],
  };
}

export function extractPhysicalDetails(rawText: string, nodes: AndroidUiNode[] = []): Record<string, string> {
  const details: Record<string, string> = {};
  const nodeTexts = nodes.map((n) => n.text || n.description).filter(Boolean);
  const text = [rawText, ...nodeTexts].join("\n");

  // 1. Height (cm or feet/inches)
  const heightMatch = text.match(/(?:\b\d{3}\s*cm|\b\d+\s*(?:['’]|ft\.?)\s*\d{1,2}(?:\s*(?:["”]|in\.?))?|\b\d+\s*(?:['’]|ft\.?))/i);
  if (heightMatch) {
    details["Height"] = heightMatch[0].trim();
  }

  // 2. Exercise / Workout
  const workoutMatch = text.match(/\b(active|almost never|often|frequently|sometimes|regularly|daily workout|gym rat|never)\b/i);
  if (workoutMatch) {
    details["Exercise"] = workoutMatch[0].trim();
  }

  // 3. Drinking
  const drinkMatch = text.match(/\b(socially|never|frequently|sober|planning to quit|special occasions)\s*(?:drinker|drinking)?\b/i);
  if (drinkMatch) {
    details["Drinking"] = drinkMatch[0].trim();
  }

  // 4. Smoking
  const smokeMatch = text.match(/\b(non[- ]?smoker|social smoker|smoker|trying to quit)\b/i);
  if (smokeMatch) {
    details["Smoking"] = smokeMatch[0].trim();
  }

  // 5. Star sign / Zodiac
  const zodiacMatch = text.match(/\b(aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i);
  if (zodiacMatch) {
    details["Zodiac"] = zodiacMatch[0].trim();
  }

  // 6. Education
  const eduMatch = text.match(/\b(graduate degree|undergraduate degree|postgraduate|in college|high school|bachelor['’]?s?|master['’]?s?|ph\.?d\.?|trade\s*(?:school)?)\b/i);
  if (eduMatch) {
    details["Education"] = eduMatch[0].trim();
  }

  // 7. Religion / Faith
  const religionMatch = text.match(/\b(agnostic|atheist|hindu|christian|muslim|spiritual|sikh|buddhist|jewish|jain|parsi|zoroastrian|catholic)\b/i);
  if (religionMatch) {
    details["Religion"] = religionMatch[0].trim();
  }

  // 8. Politics
  const politicsMatch = text.match(/\b(liberal|moderate|conservative|apolitical)\b/i);
  if (politicsMatch) {
    details["Politics"] = politicsMatch[0].trim();
  }

  // 9. Relationship intention / Looking for
  const lookingForMatch = text.match(/\b(a relationship|something casual|marriage|don['’]t know yet|open to casual|intimacy without commitment|open to seeing where things go|life partner|fun, casual dates|ethical non[- ]monogamy)\b/i);
  if (lookingForMatch) {
    details["Looking for"] = lookingForMatch[0].trim();
  }

  // 10. Family / Kids
  const kidsMatch = text.match(/\b(want someday|don['’]t want|have kids|open to kids|don['’]t want kids|not sure yet)\b/i);
  if (kidsMatch) {
    details["Children"] = kidsMatch[0].trim();
  }

  // 11. Interests & Hobbies (extracted from Interest badges)
  const interests: string[] = [];
  for (const n of nodes) {
    const desc = n.description?.trim();
    if (desc && /^interest,\s*(.+)$/i.test(desc)) {
      const match = desc.match(/^interest,\s*(.+)$/i);
      if (match && match[1] && !interests.includes(match[1].trim())) {
        interests.push(match[1].trim());
      }
    }
  }
  if (interests.length > 0) {
    details["Interests"] = interests.join(", ");
  }

  // 12. Work / Occupation
  const lines = text.split("\n").map((l) => l.trim());
  const jobLine = lines.find((l) =>
    l.length >= 4 &&
    l.length <= 60 &&
    !Object.values(details).includes(l) &&
    /\b(?:at|in|as)\s+[A-Z]|\b(?:Manager|Engineer|Designer|Analyst|Consultant|Founder|Director|Lead|Developer|Architect|Doctor|Specialist|Associate|Accountant|Executive|Scientist)\b/i.test(l),
  );
  if (jobLine && !details["Work"]) {
    details["Work"] = jobLine;
  }

  return details;
}
