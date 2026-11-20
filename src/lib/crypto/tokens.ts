import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encryption for connected-account secrets (OAuth access/refresh tokens,
 * WhatsApp Business system-user tokens, etc).
 *
 * - AES-256-GCM (authenticated encryption) with a fresh 96-bit IV per value.
 * - Each ciphertext records the id of the key that produced it, so keys can be
 *   rotated: add a new key, make it current, and old rows still decrypt.
 * - Callers pass "associated data" (e.g. user id + platform + account id).
 *   It is not stored in the ciphertext but must match on decrypt, so a token
 *   copied from one user's row into another's fails to decrypt.
 *
 * Serialized format: `enc:v1:<keyId>:<iv b64url>:<tag b64url>:<ciphertext b64url>`
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const PREFIX = "enc";
const FORMAT_VERSION = "v1";
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export type Keyring = {
  currentKeyId: string;
  keys: Map<string, Buffer>;
};

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

/**
 * Parse a keyring from `TOKEN_ENCRYPTION_KEYS` ("id1:base64key,id2:base64key")
 * and `TOKEN_ENCRYPTION_CURRENT_KEY_ID`. Each key must decode to 32 bytes.
 * Generate one with: `openssl rand -base64 32`
 */
export function parseKeyring(keysSpec: string | undefined, currentKeyId: string | undefined): Keyring {
  if (!keysSpec?.trim()) {
    throw new TokenCryptoError("TOKEN_ENCRYPTION_KEYS is not set");
  }
  const keys = new Map<string, Buffer>();
  for (const entry of keysSpec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const sep = entry.indexOf(":");
    if (sep <= 0) throw new TokenCryptoError("Each key must look like <id>:<base64 key>");
    const id = entry.slice(0, sep);
    if (!KEY_ID_PATTERN.test(id)) throw new TokenCryptoError(`Invalid key id "${id}"`);
    if (keys.has(id)) throw new TokenCryptoError(`Duplicate key id "${id}"`);
    const key = Buffer.from(entry.slice(sep + 1), "base64");
    if (key.length !== KEY_BYTES) {
      throw new TokenCryptoError(`Key "${id}" must be ${KEY_BYTES} bytes (got ${key.length})`);
    }
    keys.set(id, key);
  }
  const current = currentKeyId?.trim() || (keys.size === 1 ? [...keys.keys()][0] : undefined);
  if (!current) throw new TokenCryptoError("TOKEN_ENCRYPTION_CURRENT_KEY_ID is not set");
  if (!keys.has(current)) throw new TokenCryptoError(`Current key "${current}" is not in the keyring`);
  return { currentKeyId: current, keys };
}

let cachedKeyring: Keyring | undefined;

/** Keyring from the environment, parsed once per process. */
export function getKeyring(): Keyring {
  cachedKeyring ??= parseKeyring(process.env.TOKEN_ENCRYPTION_KEYS, process.env.TOKEN_ENCRYPTION_CURRENT_KEY_ID);
  return cachedKeyring;
}

const b64 = (buf: Buffer) => buf.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

export function encryptSecret(plaintext: string, associatedData: string, keyring: Keyring = getKeyring()): string {
  const key = keyring.keys.get(keyring.currentKeyId)!;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, FORMAT_VERSION, keyring.currentKeyId, b64(iv), b64(tag), b64(ciphertext)].join(":");
}

export function decryptSecret(serialized: string, associatedData: string, keyring: Keyring = getKeyring()): string {
  const parts = serialized.split(":");
  if (parts.length !== 6 || parts[0] !== PREFIX || parts[1] !== FORMAT_VERSION) {
    throw new TokenCryptoError("Unrecognized ciphertext format");
  }
  const [, , keyId, ivB64, tagB64, dataB64] = parts;
  const key = keyring.keys.get(keyId);
  if (!key) throw new TokenCryptoError(`No key "${keyId}" in keyring`);
  const iv = unb64(ivB64);
  const tag = unb64(tagB64);
  if (iv.length !== IV_BYTES || tag.length !== 16) throw new TokenCryptoError("Malformed ciphertext");
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(associatedData, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(unb64(dataB64)), decipher.final()]).toString("utf8");
  } catch {
    // Never surface the underlying error: it can hint at why authentication failed.
    throw new TokenCryptoError("Decryption failed");
  }
}

/** Key id a ciphertext was written with, used to find rows that need re-encrypting after rotation. */
export function keyIdOf(serialized: string): string | undefined {
  const parts = serialized.split(":");
  return parts.length === 6 && parts[0] === PREFIX ? parts[2] : undefined;
}

/** Re-encrypt with the current key if needed. Returns null when already current. */
export function reencryptIfStale(serialized: string, associatedData: string, keyring: Keyring = getKeyring()): string | null {
  if (keyIdOf(serialized) === keyring.currentKeyId) return null;
  return encryptSecret(decryptSecret(serialized, associatedData, keyring), associatedData, keyring);
}
