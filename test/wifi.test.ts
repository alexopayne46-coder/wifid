import { describe, it, expect, mock } from "bun:test";
import * as realFs from "node:fs";

const fsState: { entries: string[]; throwOnRead: boolean } = {
  entries: ["lo"],
  throwOnRead: false,
};

mock.module("node:fs", () => ({
  ...realFs,
  readdirSync: (path: string) => {
    if (fsState.throwOnRead && path === "/sys/class/net") {
      throw new Error("ENOENT");
    }
    if (path === "/sys/class/net") return fsState.entries;
    return realFs.readdirSync(path);
  },
}));

const { detectApIface } = await import("../src/wifi.ts");

describe("detectApIface", () => {
  it("detects wlp0s20f0u interface by primary prefix", () => {
    fsState.entries = ["lo", "enp0s31f6", "wlp0s20f0u1"];
    fsState.throwOnRead = false;
    expect(detectApIface()).toBe("wlp0s20f0u1");
  });

  it("detects wlp0s20u2u interface via fallback prefix", () => {
    fsState.entries = ["lo", "enp0s31f6", "wlp0s20u2u1"];
    fsState.throwOnRead = false;
    expect(detectApIface()).toBe("wlp0s20u2u1");
  });

  it("prioritizes wlp0s20f0u over wlp0s20u2u when both present", () => {
    fsState.entries = ["wlp0s20f0u2", "wlp0s20u2u1", "wlp0s20f0u1"];
    fsState.throwOnRead = false;
    expect(detectApIface()).toBe("wlp0s20f0u1");
  });

  it("returns lowest-numbered interface for a prefix", () => {
    fsState.entries = ["wlp0s20f0u3", "wlp0s20f0u1", "wlp0s20f0u2"];
    fsState.throwOnRead = false;
    expect(detectApIface()).toBe("wlp0s20f0u1");
  });

  it("returns null when no matching interface found", () => {
    fsState.entries = ["lo", "enp0s31f6", "tailscale0"];
    fsState.throwOnRead = false;
    expect(detectApIface()).toBeNull();
  });

  it("returns null when /sys/class/net is unreadable", () => {
    fsState.throwOnRead = true;
    expect(detectApIface()).toBeNull();
    fsState.throwOnRead = false;
  });

  it("ignores interfaces that don't match either prefix", () => {
    fsState.entries = [
      "lo",
      "wlp4s0",
      "wlxdeadbeef",
      "wlp0s20f0uxyz",
      "wlp0s20u2uabc",
    ];
    fsState.throwOnRead = false;
    expect(detectApIface()).toBeNull();
  });
});
