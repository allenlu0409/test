// 兩步驟驗證（TOTP，RFC 6238）：與 Google Authenticator、1Password 等驗證器相容。不依賴外部套件。
import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return out;
}

export function base32Decode(s: string): Buffer {
  let bits = "";
  for (const c of s.toUpperCase().replace(/[^A-Z2-7]/g, "")) bits += ALPHABET.indexOf(c).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function newSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** 指定時間的 6 位數驗證碼 */
export function totpAt(secret: string, atMs: number, step = 30): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1000 / step)));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0x0f;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** 容許前後各一個時間格（手機時鐘稍微不準也能過） */
export function verifyTotp(secret: string, code: string, atMs = Date.now()): boolean {
  const given = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return false;
  return [-1, 0, 1].some((w) => {
    const want = totpAt(secret, atMs + w * 30_000);
    return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(given));
  });
}

export function otpauthUri(secret: string, account: string, issuer = "約好 Yuehao"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

const hash = (code: string) => crypto.createHash("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");

/** 產生 8 組一次性備用碼；回傳明碼（只顯示這一次）與要存進資料庫的雜湊 */
export function newBackupCodes(): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString("hex").replace(/(.{5})/, "$1-"));
  return { codes, hashes: codes.map(hash) };
}

/** 比對備用碼；符合時回傳用掉該碼之後剩下的雜湊，否則回傳 null */
export function useBackupCode(hashes: string[], code: string): string[] | null {
  const h = hash(code);
  return hashes.includes(h) ? hashes.filter((x) => x !== h) : null;
}
