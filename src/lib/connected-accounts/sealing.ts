import { decryptSecret, encryptSecret, type Keyring, getKeyring } from "@/lib/crypto/tokens";
import type { PlatformId } from "@/lib/platforms";

export type AccountIdentity = {
  userId: string;
  platform: PlatformId;
  externalAccountId: string;
};

export type PlainTokens = {
  accessToken: string;
  refreshToken?: string | null;
};

export type SealedTokens = {
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
};

/**
 * Associated data binds each ciphertext to its owner, account and field,
 * so it cannot be moved to another row or swapped between columns.
 */
export function tokenAad(identity: AccountIdentity, field: "access" | "refresh"): string {
  return ["connected_account", identity.userId, identity.platform, identity.externalAccountId, field].join("|");
}

export function sealTokens(identity: AccountIdentity, tokens: PlainTokens, keyring: Keyring = getKeyring()): SealedTokens {
  if (!tokens.accessToken) throw new Error("accessToken is required");
  return {
    accessTokenEnc: encryptSecret(tokens.accessToken, tokenAad(identity, "access"), keyring),
    refreshTokenEnc: tokens.refreshToken
      ? encryptSecret(tokens.refreshToken, tokenAad(identity, "refresh"), keyring)
      : null,
  };
}

export function openTokens(identity: AccountIdentity, sealed: SealedTokens, keyring: Keyring = getKeyring()): Required<PlainTokens> {
  return {
    accessToken: decryptSecret(sealed.accessTokenEnc, tokenAad(identity, "access"), keyring),
    refreshToken: sealed.refreshTokenEnc
      ? decryptSecret(sealed.refreshTokenEnc, tokenAad(identity, "refresh"), keyring)
      : null,
  };
}
