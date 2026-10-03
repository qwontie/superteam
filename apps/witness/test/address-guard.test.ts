import { describe, expect, test } from "bun:test";
import { isPrivateAddress } from "../src/address-guard";

describe("isPrivateAddress", () => {
  test.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "2002:c0a8:101::1",
    "2001:db8::1",
    "not an ip",
  ])("blocks %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  test.each([
    "93.184.215.14",
    "104.20.23.154",
    "172.32.0.1",
    "8.8.8.8",
    "2606:4700:10::ac42:93f3",
    "::ffff:8.8.8.8",
    "2a00:1450:4001::200e",
  ])("allows %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});
