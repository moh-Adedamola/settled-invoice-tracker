// @node-rs/argon2 declares a `browser` field pointing at a wasm32-wasi build,
// so importing this module from a client component would NOT fail the build --
// it would quietly ship Argon2 to the browser and make verifyPassword callable
// there, which only works if the stored hash is sent to the client too. The
// other two auth modules fail loudly on their own (node:crypto, next/headers);
// this one fails silently, so the guard matters most here.
import 'server-only';

import { hash, verify } from '@node-rs/argon2';
import type { Algorithm, Options } from '@node-rs/argon2';

/**
 * Argon2id parameters — the OWASP Password Storage Cheat Sheet baseline as of
 * 2026 (m=19456, t=2, p=1).
 *
 * Why these numbers:
 *
 * - **Argon2id**, not Argon2i or Argon2d. Argon2d resists GPU cracking but
 *   leaks through cache-timing side channels; Argon2i is the reverse. id runs
 *   the first half-pass as i and the rest as d, which is the variant every
 *   normative recommendation (RFC 9106, OWASP) actually names.
 * - **memoryCost 19456 KiB (19 MiB)** is the lever that matters. Argon2's
 *   defence is memory-hardness: an attacker's GPU has thousands of cores but
 *   limited memory bandwidth, so 19 MiB per guess is what makes parallel
 *   cracking expensive. Raising time cost instead buys far less per unit of
 *   server latency.
 * - **timeCost 2 / parallelism 1** is the pairing OWASP specifies alongside
 *   19 MiB. The three are a set — RFC 9106 trades memory against passes, so
 *   lowering memory while keeping t=2 silently weakens the hash. Change them
 *   together or not at all.
 *
 * These land around 40-60ms per hash on typical serverless hardware, which is
 * the intended cost: slow enough to price out offline cracking, fast enough
 * that a login does not feel broken.
 *
 * Raising these later is safe and does not invalidate existing hashes — the
 * parameters are encoded in each PHC string, so old hashes keep verifying with
 * the parameters they were created under.
 */
const ARGON2_OPTIONS: Options = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
  algorithm: 2 as Algorithm, // Algorithm.Argon2id — a literal because the enum
  // is an ambient `const enum`, which isolatedModules forbids importing.
};

/**
 * Argon2 has no bcrypt-style 72-byte truncation, so long inputs are hashed in
 * full — which makes an unbounded password a cheap way to burn server memory
 * and CPU. Reject absurd input before it reaches the KDF.
 */
const MAX_PASSWORD_BYTES = 1024;

/**
 * A real Argon2id digest of a random throwaway string, used only to burn an
 * equivalent amount of time when there is nothing legitimate to verify against.
 * Safe to commit: it is a hash of a value nobody knows or needs.
 */
const DECOY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Xpa7zysDxrIF+9FXALvS2Q$8oO19fdoBeYz0JVJ71Mj/kkiqLs3DTz2gcSq34jbS3Y';

export async function hashPassword(plain: string): Promise<string> {
  if (Buffer.byteLength(plain, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new Error(`Password exceeds ${MAX_PASSWORD_BYTES} bytes`);
  }
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Never throws. A malformed, empty, or non-Argon2 stored hash returns false.
 *
 * This matters concretely: `scripts/seed.ts` writes the sentinel
 * `!seed-placeholder-no-login-until-auth-phase` into the admin user's
 * passwordHash. That is not a PHC string, so the underlying `verify` throws a
 * parse error rather than returning false. Letting that propagate would turn a
 * seeded-but-unprovisioned account into a 500 on the login route instead of a
 * clean "invalid credentials".
 *
 * On the malformed path we still verify against a decoy hash before returning.
 * Without it, an account with an unusable hash would answer in ~0ms while a
 * real account answers in ~50ms, and that gap is a reliable oracle for which
 * accounts exist but have never had a password set.
 *
 * Note that no options are passed to `verify`: Argon2 reads memory, time,
 * parallelism and salt from the stored PHC string itself. Passing today's
 * parameters here would be wrong the moment they are ever raised.
 */
export async function verifyPassword(
  hashString: string,
  plain: string,
): Promise<boolean> {
  if (
    typeof hashString !== 'string' ||
    !hashString.startsWith('$argon2') ||
    Buffer.byteLength(plain, 'utf8') > MAX_PASSWORD_BYTES
  ) {
    await burnDecoyTime();
    return false;
  }

  try {
    return await verify(hashString, plain);
  } catch {
    // Corrupt salt, truncated digest, unknown variant — all are "no".
    return false;
  }
}

async function burnDecoyTime(): Promise<void> {
  try {
    await verify(DECOY_HASH, 'not-the-password');
  } catch {
    // The decoy is a constant and cannot legitimately fail, but a throw here
    // must never surface as a login error.
  }
}
