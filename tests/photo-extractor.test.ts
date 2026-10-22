import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { analyzePhotoMetrics, findPhotoBands } from "../src/lib/photo-extractor";

describe("Photo Extractor Engine", () => {
  it("computes accurate metrics from a synthesized image buffer", async () => {
    // Create a 400x500 image with sharp
    const testImage = await sharp({
      create: {
        width: 400,
        height: 500,
        channels: 3,
        background: { r: 180, g: 120, b: 90 },
      },
    })
      .png()
      .toBuffer();

    const metrics = await analyzePhotoMetrics(testImage, "test.png");
    expect(metrics.width).toBe(400);
    expect(metrics.height).toBe(500);
    expect(metrics.brightness).toBeGreaterThan(0.3);
    expect(metrics.brightness).toBeLessThan(0.8);
    expect(metrics.sharpness).toBeGreaterThan(0.3);
    expect(metrics.observations.length).toBeGreaterThan(0);
  });

  it("finds photo bands by detecting contrast against near-white app background", async () => {
    // Top 200px white background, middle 400px colorful photo, bottom 200px white background
    const topBar = await sharp({
      create: { width: 600, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } },
    }).png().toBuffer();

    const photoBand = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 80, g: 140, b: 200 } },
    }).png().toBuffer();

    const bottomBar = await sharp({
      create: { width: 600, height: 200, channels: 3, background: { r: 250, g: 250, b: 250 } },
    }).png().toBuffer();

    const compositeImage = await sharp({
      create: { width: 600, height: 800, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        { input: topBar, top: 0, left: 0 },
        { input: photoBand, top: 200, left: 0 },
        { input: bottomBar, top: 600, left: 0 },
      ])
      .png()
      .toBuffer();

    const meta = await sharp(compositeImage).metadata();
    const bands = await findPhotoBands(compositeImage, meta);

    expect(bands.length).toBeGreaterThanOrEqual(1);
    expect(bands[0].top).toBeGreaterThanOrEqual(180);
    expect(bands[0].bottom).toBeLessThanOrEqual(620);
    expect(bands[0].height).toBeGreaterThanOrEqual(340);
  });
});
