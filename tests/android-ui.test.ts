import { describe, expect, it } from "vitest";
import {
  createAndroidSwipe,
  detectAndroidBlockingState,
  extractAndroidProfile,
  extractPhysicalDetails,
  findAndroidActionTarget,
  findAndroidContinueTarget,
  findAndroidExpandTarget,
  isEndOfProfileCard,
  parseAndroidUiXml,
} from "@/lib/android-ui";

function hierarchy(nodes: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hierarchy rotation="0">${nodes}</hierarchy>`;
}

function node(attributes: Record<string, string | boolean>) {
  const defaults = {
    text: "",
    "content-desc": "",
    "resource-id": "",
    class: "android.view.View",
    clickable: "false",
    "visible-to-user": "true",
    bounds: "[0,0][100,100]",
  };
  const serialized = Object.entries({ ...defaults, ...attributes })
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(" ");
  return `<node ${serialized}/>`;
}

const PROFILE_XML = hierarchy([
  node({ text: "People", bounds: "[0,0][120,80]" }),
  node({ text: "Maya, 31", bounds: "[40,180][400,260]" }),
  node({ text: "Lives in Bengaluru", bounds: "[40,270][600,330]" }),
  node({ text: "12 km away", bounds: "[40,340][400,400]" }),
  node({ text: "I love travel &amp; cooking, kindness, and clear communication.", bounds: "[40,420][1000,620]" }),
  node({ "content-desc": "Pass", clickable: true, bounds: "[80,1680][260,1860]" }),
  node({ "content-desc": "Like", clickable: true, bounds: "[820,1680][1000,1860]" }),
].join(""));

describe("Android UI hierarchy parsing", () => {
  it("extracts a ready Bumble profile without treating navigation or actions as profile evidence", () => {
    const profile = extractAndroidProfile(PROFILE_XML);

    expect(profile).toMatchObject({
      ready: true,
      displayName: "Maya",
      age: 31,
      location: "Bengaluru",
      distanceKm: 12,
    });
    expect(profile.rawText).toContain("travel & cooking");
    expect(profile.rawText).not.toMatch(/People|Pass|Like/);
    expect(profile.prompts).toContain("I love travel & cooking, kindness, and clear communication.");
    expect(profile.signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("decodes XML entities, parses bounds, and retains hidden nodes only in the raw node list", () => {
    const xml = hierarchy([
      node({ text: "Tea &amp; books &#x1F4DA;", clickable: true, bounds: "[10,20][110,220]" }),
      node({ text: "Hidden biography", "visible-to-user": false, bounds: "[0,0][0,0]" }),
    ].join(""));

    expect(parseAndroidUiXml(xml)).toEqual([
      expect.objectContaining({
        text: "Tea & books 📚",
        clickable: true,
        visible: true,
        bounds: { left: 10, top: 20, right: 110, bottom: 220 },
      }),
      expect.objectContaining({ text: "Hidden biography", visible: false }),
    ]);
    expect(extractAndroidProfile(xml).rawText).not.toContain("Hidden biography");
  });

  it("requires an explicit Like or Pass control before a hierarchy is action-ready", () => {
    const xml = hierarchy([
      node({ text: "Maya, 31" }),
      node({ text: "Lives in Bengaluru" }),
      node({ text: "Travel and cooking" }),
    ].join(""));

    expect(extractAndroidProfile(xml).ready).toBe(false);
  });

  it("keeps the profile signature stable when transient activity labels change", () => {
    const activeNow = PROFILE_XML.replace("</hierarchy>", `${node({ text: "Active now" })}</hierarchy>`);
    const newHere = PROFILE_XML.replace("</hierarchy>", `${node({ text: "New here" })}</hierarchy>`);

    expect(extractAndroidProfile(activeNow).signature).toBe(extractAndroidProfile(newHere).signature);
  });
});

describe("Android action targeting", () => {
  it("returns the center of the accessible Like and Pass controls", () => {
    expect(findAndroidActionTarget(PROFILE_XML, "like")).toEqual({ x: 910, y: 1770 });
    expect(findAndroidActionTarget(PROFILE_XML, "pass")).toEqual({ x: 170, y: 1770 });
  });

  it("finds allowlisted continuation and profile expansion controls", () => {
    const xml = hierarchy([
      node({ "content-desc": "Keep swiping", clickable: true, bounds: "[200,900][880,1020]" }),
      node({ text: "See more", clickable: true, bounds: "[40,1100][300,1180]" }),
    ].join(""));

    expect(findAndroidContinueTarget(xml)).toEqual({ x: 540, y: 960 });
    expect(findAndroidExpandTarget(xml)).toEqual({ x: 170, y: 1140 });
  });

  it("does not infer a target from unrelated buttons", () => {
    const xml = hierarchy(node({ text: "Send a compliment", clickable: true }));
    expect(findAndroidActionTarget(xml, "like")).toBeNull();
    expect(findAndroidActionTarget(xml, "pass")).toBeNull();
    expect(findAndroidContinueTarget(xml)).toBeNull();
  });

  it("falls back to opposite horizontal swipes scaled to the screen", () => {
    expect(createAndroidSwipe("like", { width: 1080, height: 2400 })).toEqual({
      startX: 302,
      startY: 1392,
      endX: 886,
      endY: 1392,
      durationMs: 340,
    });
    expect(createAndroidSwipe("pass", { width: 1080, height: 2400 })).toEqual({
      startX: 778,
      startY: 1392,
      endX: 194,
      endY: 1392,
      durationMs: 340,
    });
  });
});

describe("Android blocking-state detection", () => {
  it.each([
    ["You're out of likes. Come back tomorrow.", "no more likes"],
    ["Photo verification required", "profile verification"],
    ["Log in with your phone number", "sign in"],
  ])("recognizes %s", (message, expected) => {
    const xml = hierarchy(node({ text: message }));
    expect(detectAndroidBlockingState(xml)).toContain(expected);
  });

  it("returns null for an ordinary profile", () => {
    expect(detectAndroidBlockingState(PROFILE_XML)).toBeNull();
  });
});

describe("Android extractPhysicalDetails", () => {
  it("extracts comprehensive physical and lifestyle attributes from raw text", () => {
    const raw = `
      Ananya, 27
      Software Engineer at Google
      Graduate degree
      168 cm
      Active
      Socially drinking
      Non-smoker
      Leo
      Agnostic
      Liberal
      Something casual
      Want someday
    `;
    const details = extractPhysicalDetails(raw);
    expect(details["Height"]).toBe("168 cm");
    expect(details["Exercise"]).toBe("Active");
    expect(details["Drinking"]).toBe("Socially drinking");
    expect(details["Smoking"]).toBe("Non-smoker");
    expect(details["Zodiac"]).toBe("Leo");
    expect(details["Education"]).toBe("Graduate degree");
    expect(details["Religion"]).toBe("Agnostic");
    expect(details["Politics"]).toBe("Liberal");
    expect(details["Looking for"]).toBe("Something casual");
    expect(details["Children"]).toBe("Want someday");
    expect(details["Work"]).toContain("Software Engineer");
  });

  it("handles imperial height formats like 5'7\" or 5 ft 8 in", () => {
    expect(extractPhysicalDetails("Height is 5'7\" and fit")["Height"]).toBe("5'7\"");
    expect(extractPhysicalDetails("I am 5 ft 8 in tall")["Height"]).toBe("5 ft 8 in");
  });

  it("extracts interests from node content descriptions and new Bumble attributes", () => {
    const raw = "Rhea, 25\nOpen to seeing where things go\nJain";
    const sampleNodes = [
      { text: "", description: "Interest, Travel", resourceId: "", className: "", clickable: false, visible: true, bounds: null },
      { text: "", description: "Interest, Coffee", resourceId: "", className: "", clickable: false, visible: true, bounds: null },
      { text: "", description: "Interest, Art Galleries", resourceId: "", className: "", clickable: false, visible: true, bounds: null },
    ];
    const details = extractPhysicalDetails(raw, sampleNodes);
    expect(details["Looking for"]).toBe("Open to seeing where things go");
    expect(details["Religion"]).toBe("Jain");
    expect(details["Interests"]).toBe("Travel, Coffee, Art Galleries");
  });
});

describe("Android isEndOfProfileCard", () => {
  it("detects Bumble footer bottom markers", () => {
    expect(isEndOfProfileCard([], "Share profile\nBlock & Report")).toBe(true);
    expect(isEndOfProfileCard([], "Recommend to a friend")).toBe(true);
    expect(isEndOfProfileCard([], "Hide and report")).toBe(true);
    expect(isEndOfProfileCard([
      { text: "Share Rhea's profile", description: "", resourceId: "", className: "", clickable: true, visible: true, bounds: null },
    ], "")).toBe(true);
  });

  it("returns false when card is mid-profile", () => {
    expect(isEndOfProfileCard([], "Ananya, 24\nSoftware Engineer\nAbout me\nI love mountains")).toBe(false);
  });
});
