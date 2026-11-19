import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseKeyring } from "@/lib/crypto/tokens";
import { openTokens, sealTokens } from "./sealing";

const ring = parseKeyring(`v1:${randomBytes(32).toString("base64")}`, "v1");
const alice = { userId: "user_alice", platform: "instagram" as const, externalAccountId: "1784" };
const bob = { ...alice, userId: "user_bob" };

describe("sealTokens / openTokens", () => {
  it("round-trips access and refresh tokens", () => {
    const sealed = sealTokens(alice, { accessToken: "acc", refreshToken: "ref" }, ring);
    expect(openTokens(alice, sealed, ring)).toEqual({ accessToken: "acc", refreshToken: "ref" });
  });

  it("stores a null refresh token when there is none", () => {
    const sealed = sealTokens(alice, { accessToken: "acc" }, ring);
    expect(sealed.refreshTokenEnc).toBeNull();
    expect(openTokens(alice, sealed, ring).refreshToken).toBeNull();
  });

  it("cannot be opened as another user's account", () => {
    const sealed = sealTokens(alice, { accessToken: "acc" }, ring);
    expect(() => openTokens(bob, sealed, ring)).toThrow("Decryption failed");
  });

  it("cannot swap the access and refresh columns", () => {
    const sealed = sealTokens(alice, { accessToken: "acc", refreshToken: "ref" }, ring);
    const swapped = { accessTokenEnc: sealed.refreshTokenEnc!, refreshTokenEnc: sealed.accessTokenEnc };
    expect(() => openTokens(alice, swapped, ring)).toThrow("Decryption failed");
  });
});
