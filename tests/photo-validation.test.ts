import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, validateImageInput } from "@/lib/photo-analyzer";

describe("photo input validation", () => {
  it("accepts supported local image metadata", () => {
    expect(() => validateImageInput({ name: "portrait.jpg", type: "image/jpeg", size: 250_000 })).not.toThrow();
  });

  it("rejects unsupported formats and oversized inputs", () => {
    expect(() => validateImageInput({ name: "portrait.svg", type: "image/svg+xml", size: 500 })).toThrow(/JPEG/);
    expect(() => validateImageInput({ name: "huge.png", type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toThrow(/10 MB/);
  });
});
