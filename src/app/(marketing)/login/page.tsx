import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentSession } from '@/lib/auth/guard';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in · Settled',
  description: 'Sign in to Settled.',
};

export default async function LoginPage() {
  // Someone already signed in has no business seeing a login form.
  const session = await getCurrentSession();
  if (session) redirect('/dashboard');

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <EngravedPlate />

      <div className="enter relative w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <p className="font-display text-h1 text-ink">Settled</p>
          <p className="mt-1 font-display text-body text-ink-secondary">
            Invoices and payments, reconciled.
          </p>
        </div>

        <div className="rounded-md border border-line bg-surface-raised p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-small text-ink-muted">
          Just looking around?{' '}
          <Link
            href="/"
            className="rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            View the public demo
          </Link>
        </p>
      </div>
    </main>
  );
}

/**
 * The one flourish this surface gets (design system §2: moderate ambition).
 * Guilloché — the interference pattern engraved into banknotes and share
 * certificates, which is where this whole identity comes from. Held at 4%
 * opacity behind the card, drawn once, never animated.
 */
function EngravedPlate() {
  const rings = Array.from({ length: 26 }, (_, i) => i);

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 text-accent opacity-[0.04]"
      viewBox="-200 -200 400 400"
      fill="none"
    >
      {rings.map((i) => {
        const t = i / rings.length;
        const r = 40 + i * 5.5;
        return (
          <ellipse
            key={i}
            cx="0"
            cy="0"
            rx={r}
            ry={r * (0.42 + t * 0.5)}
            stroke="currentColor"
            strokeWidth="0.4"
            transform={`rotate(${i * 13.8})`}
          />
        );
      })}
    </svg>
  );
}
