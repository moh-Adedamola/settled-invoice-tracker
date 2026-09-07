/**
 * Set a user's password.
 *
 *   npm run set-password -- admin@refacint.com
 *   SETTLED_PASSWORD='...' npm run set-password -- admin@refacint.com
 *
 * The seed script writes an unmatchable placeholder into passwordHash, so this
 * is how a seeded account becomes able to sign in.
 *
 * Requires --conditions=react-server (wired into the npm script): the auth
 * modules import `server-only`, whose exports map resolves to a no-op module
 * only under that condition and throws by design everywhere else.
 *
 * Passing the password as argv[3] works but is discouraged — it lands in shell
 * history and is visible to anyone who can list processes. Prefer the
 * SETTLED_PASSWORD environment variable, which the script prompts for by name
 * when it is missing.
 */
import { eq } from 'drizzle-orm';

import { hashPassword } from '../src/lib/auth/password';
import { invalidateAllUserSessions } from '../src/lib/auth/session';
import { db, users } from '../src/lib/db';

const MIN_PASSWORD_LENGTH = 12;

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  const email = (process.argv[2] ?? process.env.SETTLED_EMAIL ?? '')
    .trim()
    .toLowerCase();

  // argv first so an explicit argument wins, but env is the documented path.
  const password = process.argv[3] ?? process.env.SETTLED_PASSWORD ?? '';

  if (!email) {
    fail(
      'Usage: npm run set-password -- <email> [password]\n' +
        '  Or set SETTLED_EMAIL and SETTLED_PASSWORD.',
    );
  }

  if (!password) {
    fail(
      'No password supplied.\n' +
        "  Set SETTLED_PASSWORD in the environment (preferred — keeps it out of\n" +
        '  shell history and the process list), or pass it as the second argument.',
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    const existing = await db.select({ email: users.email }).from(users);
    fail(
      `No user with email ${email}.\n` +
        (existing.length
          ? `  Known users: ${existing.map((u) => u.email).join(', ')}`
          : '  There are no users at all — run `npm run seed` first.'),
    );
  }

  const passwordHash = await hashPassword(password);

  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // A password change must not leave old sessions alive — that is the whole
  // point of being able to change it after a suspected compromise.
  await invalidateAllUserSessions(user.id);

  console.log(`\n  Password set for ${user.email} (${user.role}).`);
  console.log('  All existing sessions for this user were invalidated.\n');
}

main().catch((error) => {
  console.error('\n  Failed:', error);
  process.exit(1);
});
