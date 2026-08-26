import { describe, it, expect } from "bun:test";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { detectBand, appendDnsOverwrites } = await import("../src/config-gen.ts");

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "ap-test-"));
}

describe("detectBand", () => {
  it("detects 5 GHz from hw_mode=a", () => {
    const dir = makeTempDir();
    const conf = join(dir, "hostapd.conf");
    writeFileSync(conf, "hw_mode=a\nchannel=36\n");
    expect(detectBand(conf)).toBe("5 GHz");
    rmSync(dir, { recursive: true });
  });

  it("detects 2.4 GHz from hw_mode=g", () => {
    const dir = makeTempDir();
    const conf = join(dir, "hostapd.conf");
    writeFileSync(conf, "hw_mode=g\nchannel=6\n");
    expect(detectBand(conf)).toBe("2.4 GHz");
    rmSync(dir, { recursive: true });
  });

  it("detects 2.4 GHz from hw_mode=b", () => {
    const dir = makeTempDir();
    const conf = join(dir, "hostapd.conf");
    writeFileSync(conf, "hw_mode=b\nchannel=1\n");
    expect(detectBand(conf)).toBe("2.4 GHz");
    rmSync(dir, { recursive: true });
  });

  it("detects 60 GHz from hw_mode=ad", () => {
    const dir = makeTempDir();
    const conf = join(dir, "hostapd.conf");
    writeFileSync(conf, "hw_mode=ad\nchannel=1\n");
    expect(detectBand(conf)).toBe("60 GHz");
    rmSync(dir, { recursive: true });
  });

  it("returns unknown for unrecognized hw_mode", () => {
    const dir = makeTempDir();
    const conf = join(dir, "hostapd.conf");
    writeFileSync(conf, "hw_mode=xx\n");
    expect(detectBand(conf)).toBe("xx");
    rmSync(dir, { recursive: true });
  });

  it("returns unknown when config has no hw_mode", () => {
    const dir = makeTempDir();
    const conf = join(dir, "hostapd.conf");
    writeFileSync(conf, "ssid=TestNet\nchannel=6\n");
    expect(detectBand(conf)).toBe("unknown");
    rmSync(dir, { recursive: true });
  });

  it("returns unknown when file does not exist", () => {
    expect(detectBand("/nonexistent/hostapd.conf")).toBe("unknown");
  });
});

describe("appendDnsOverwrites", () => {
  it("parses YAML and appends DNS records to dnsmasq config", () => {
    const dir = makeTempDir();
    const dnsmasqConf = join(dir, "dnsmasq.conf");
    writeFileSync(dnsmasqConf, "interface=eth0\nport=53\n");
    const yamlFile = join(dir, "dns.yml");
    writeFileSync(yamlFile, "# comment\nexample.com:192.168.12.100\nfoo.bar:10.0.0.5\n");

    const records = appendDnsOverwrites(dnsmasqConf, yamlFile);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ domain: "example.com", ip: "192.168.12.100" });
    expect(records[1]).toEqual({ domain: "foo.bar", ip: "10.0.0.5" });

    const updated = readFileSync(dnsmasqConf, "utf8");
    expect(updated).toContain("address=/example.com/192.168.12.100");
    expect(updated).toContain("address=/foo.bar/10.0.0.5");

    rmSync(dir, { recursive: true });
  });

  it("does not duplicate existing DNS records", () => {
    const dir = makeTempDir();
    const dnsmasqConf = join(dir, "dnsmasq.conf");
    writeFileSync(
      dnsmasqConf,
      "interface=eth0\naddress=/example.com/192.168.12.100\n",
    );
    const yamlFile = join(dir, "dns.yml");
    writeFileSync(yamlFile, "example.com:192.168.12.100\n");

    const records = appendDnsOverwrites(dnsmasqConf, yamlFile);
    expect(records).toHaveLength(1);

    const updated = readFileSync(dnsmasqConf, "utf8");
    const matches = updated.match(/address=\/example\.com\/192\.168\.12\.100/g);
    expect(matches).toHaveLength(1);

    rmSync(dir, { recursive: true });
  });

  it("returns empty array for empty YAML file", () => {
    const dir = makeTempDir();
    const dnsmasqConf = join(dir, "dnsmasq.conf");
    writeFileSync(dnsmasqConf, "interface=eth0\n");
    const yamlFile = join(dir, "dns.yml");
    writeFileSync(yamlFile, "# only comments\n\n");

    const records = appendDnsOverwrites(dnsmasqConf, yamlFile);
    expect(records).toHaveLength(0);

    rmSync(dir, { recursive: true });
  });
});
