import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, keyIdOf, parseKeyring, reencryptIfStale, TokenCryptoError } from "./tokens";

const k = () => randomBytes(32).toString("base64");

describe("parseKeyring", () => {
  it("parses keys and picks the only key as current", () => {
    const ring = parseKeyring(`v1:${k()}`, undefined);
    expect(ring.currentKeyId).toBe("v1");
  });
  it("rejects missing, short, duplicate and unknown-current keys", () => {
    expect(() => parseKeyring("", "v1")).toThrow(TokenCryptoError);
    expect(() => parseKeyring(`v1:${randomBytes(16).toString("base64")}`, "v1")).toThrow(/32 bytes/);
    expect(() => parseKeyring(`v1:${k()},v1:${k()}`, "v1")).toThrow(/Duplicate/);
    expect(() => parseKeyring(`v1:${k()}`, "v2")).toThrow(/not in the keyring/);
    expect(() => parseKeyring(`v1:${k()},v2:${k()}`, undefined)).toThrow(/CURRENT_KEY_ID/);
  });
});

describe("encryptSecret / decryptSecret", () => {
  const ring = parseKeyring(`v1:${k()}`, "v1");

  it("round-trips, including unicode", () => {
    const secret = "EAAG…token-✓-🔐";
    const enc = encryptSecret(secret, "aad", ring);
    expect(enc.startsWith("enc:v1:v1:")).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc, "aad", ring)).toBe(secret);
  });

  it("uses a fresh IV for every encryption", () => {
    expect(encryptSecret("same", "aad", ring)).not.toBe(encryptSecret("same", "aad", ring));
  });

  it("fails when associated data differs", () => {
    const enc = encryptSecret("secret", "user_a|x|1|access", ring);
    expect(() => decryptSecret(enc, "user_b|x|1|access", ring)).toThrow("Decryption failed");
  });

  it("fails when ciphertext or tag is tampered with", () => {
    const parts = encryptSecret("secret", "aad", ring).split(":");
    const flip = (s: string) => {
      const b = Buffer.from(s, "base64url");
      b[0] ^= 1;
      return b.toString("base64url");
    };
    const badData = [...parts.slice(0, 5), flip(parts[5])].join(":");
    const badTag = [...parts.slice(0, 4), flip(parts[4]), parts[5]].join(":");
    expect(() => decryptSecret(badData, "aad", ring)).toThrow("Decryption failed");
    expect(() => decryptSecret(badTag, "aad", ring)).toThrow("Decryption failed");
  });

  it("fails with the wrong key and on garbage input", () => {
    const enc = encryptSecret("secret", "aad", ring);
    const other = parseKeyring(`v1:${k()}`, "v1");
    expect(() => decryptSecret(enc, "aad", other)).toThrow("Decryption failed");
    expect(() => decryptSecret("plaintext-token", "aad", ring)).toThrow(/format/);
  });
});

describe("key rotation", () => {
  it("decrypts old ciphertext and re-encrypts it under the new key", () => {
    const v1 = k();
    const oldRing = parseKeyring(`v1:${v1}`, "v1");
    const enc = encryptSecret("secret", "aad", oldRing);

    const newRing = parseKeyring(`v1:${v1},v2:${k()}`, "v2");
    expect(decryptSecret(enc, "aad", newRing)).toBe("secret");

    const rotated = reencryptIfStale(enc, "aad", newRing)!;
    expect(keyIdOf(rotated)).toBe("v2");
    expect(decryptSecret(rotated, "aad", newRing)).toBe("secret");
    expect(reencryptIfStale(rotated, "aad", newRing)).toBeNull();
  });
});
