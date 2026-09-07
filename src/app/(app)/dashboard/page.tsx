import type { Metadata } from 'next';

import { requireUser } from '@/lib/auth/guard';

import { logout } from '../actions';

export const metadata: Metadata = {
  title: 'Dashboard · Settled',
};

/**
 * TEMPORARY placeholder. Exists so the login flow has somewhere to land and so
 * logout can be exercised end to end. The real dashboard comes later.
 *
 * Note what is deliberately absent: no entrance animation, no gradient, no
 * flourish. This is an application surface — "restrained by intent" per design
 * system §2 — and it is opened dozens of times a week.
 */
export default async function DashboardPage() {
  const { user } = await requireUser();

  return (
    <main className="mx-auto w-full max-w-[720px] px-6 py-12">
      <header className="flex items-end justify-between gap-6 border-b border-line-subtle pb-5">
        <div>
          <p className="text-micro uppercase text-ink-muted">Settled</p>
          <h1 className="mt-1 text-h2 text-ink">Dashboard</h1>
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-sm border border-line-strong bg-surface-raised px-3.5 text-small font-medium text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-surface-overlay"
          >
            Sign out
          </button>
        </form>
      </header>

      <dl className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-micro uppercase text-ink-muted">Signed in as</dt>
          <dd className="money text-body text-ink">{user.email}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-micro uppercase text-ink-muted">Role</dt>
          <dd className="text-body text-ink-body">{user.role}</dd>
        </div>
      </dl>

      <p className="mt-10 text-small text-ink-muted">
        Placeholder. Invoice ledger, payments and the unmatched queue land here.
      </p>
    </main>
  );
}
