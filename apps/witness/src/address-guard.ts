// biome-ignore-all lint/suspicious/noBitwiseOperators: IP prefixes are bit masks
import { isIPv4, isIPv6 } from "node:net";

const BLOCKED_V4: [number, number][] = [
  [0x00_00_00_00, 8],
  [0x0a_00_00_00, 8],
  [0x64_40_00_00, 10],
  [0x7f_00_00_00, 8],
  [0xa9_fe_00_00, 16],
  [0xac_10_00_00, 12],
  [0xc0_00_00_00, 24],
  [0xc0_00_02_00, 24],
  [0xc0_a8_00_00, 16],
  [0xc6_12_00_00, 15],
  [0xc6_33_64_00, 24],
  [0xcb_00_71_00, 24],
  [0xe0_00_00_00, 3],
];

const V4_TAIL = /(\d+\.\d+\.\d+\.\d+)$/;

const v4ToNumber = (ip: string) =>
  ip
    .split(".")
    .reduce((value, octet) => value * 256 + Number.parseInt(octet, 10), 0);

const isPrivateV4 = (ip: string) => {
  const value = v4ToNumber(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    return Math.floor(value / size) === Math.floor(base / size);
  });
};

const expandV6 = (ip: string): number[] => {
  let text = ip.toLowerCase().split("%")[0] ?? "";
  const tail = text.match(V4_TAIL)?.[1];
  if (tail) {
    const value = v4ToNumber(tail);
    text = `${text.slice(0, -tail.length)}${Math.floor(value / 65_536).toString(16)}:${(value % 65_536).toString(16)}`;
  }
  const [head = "", rest] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = rest ? rest.split(":") : [];
  const missing = rest === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...new Array<string>(missing).fill("0"), ...right].map(
    (group) => Number.parseInt(group, 16)
  );
};

const embeddedV4 = (high: number, low: number) =>
  [high >> 8, high & 255, low >> 8, low & 255].join(".");

const isPrivateV6 = (ip: string) => {
  const groups = expandV6(ip);
  const [g0 = 0, g1 = 0, g2 = 0, , , g5 = 0, g6 = 0, g7 = 0] = groups;
  const zeroPrefix = groups.slice(0, 5).every((group) => group === 0);
  if (zeroPrefix && g5 === 0xff_ff) {
    return isPrivateV4(embeddedV4(g6, g7));
  }
  if (zeroPrefix && g5 === 0 && g6 === 0 && g7 <= 1) {
    return true;
  }
  if (g0 === 0x00_64 && g1 === 0xff_9b) {
    return isPrivateV4(embeddedV4(g6, g7));
  }
  if (g0 === 0x20_02) {
    return isPrivateV4(embeddedV4(g1, g2));
  }
  return (
    (g0 & 0xfe_00) === 0xfc_00 ||
    (g0 & 0xff_c0) === 0xfe_80 ||
    (g0 & 0xff_00) === 0xff_00 ||
    (g0 === 0x20_01 && g1 === 0x0d_b8)
  );
};

export const isPrivateAddress = (ip: string) => {
  if (isIPv4(ip)) {
    return isPrivateV4(ip);
  }
  if (isIPv6(ip)) {
    return isPrivateV6(ip);
  }
  return true;
};
