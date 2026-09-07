'use client';

import { useActionState, useId } from 'react';

import { login, type LoginState } from './actions';

const INITIAL: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, INITIAL);

  const emailId = useId();
  const passwordId = useId();
  const formErrorId = useId();
  const emailErrorId = `${emailId}-error`;
  const passwordErrorId = `${passwordId}-error`;

  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {/*
        Form-level errors are announced without stealing focus. role="alert"
        carries an implicit aria-live="assertive"; the region is always in the
        DOM so screen readers observe the mutation rather than an insertion.
      */}
      <div aria-live="assertive" role="alert">
        {state.formError ? (
          <p
            id={formErrorId}
            className="flex items-start gap-2 rounded-xs border border-failed-line bg-failed-bg px-3 py-2 text-small text-failed"
          >
            <span aria-hidden="true" className="mt-px leading-none">
              ✕
            </span>
            <span>{state.formError}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={emailId}
          className="text-micro uppercase text-ink-muted"
        >
          Email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? emailErrorId : undefined}
          className="h-9 rounded-sm border border-line-strong bg-transparent px-2.5 text-body text-ink placeholder:text-ink-muted"
        />
        {emailError ? (
          <p id={emailErrorId} className="text-small text-failed">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor={passwordId}
          className="text-micro uppercase text-ink-muted"
        >
          Password
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? passwordErrorId : undefined}
          className="h-9 rounded-sm border border-line-strong bg-transparent px-2.5 text-body text-ink"
        />
        {passwordError ? (
          <p id={passwordErrorId} className="text-small text-failed">
            {passwordError}
          </p>
        ) : null}
      </div>

      {/*
        Loading holds width: the label stays in flow at visibility:hidden with
        the spinner absolutely centred, so the button cannot resize mid-submit
        and move the layout under the cursor (design system §7, Button).
      */}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="ring-inverse relative mt-1 inline-flex h-9 items-center justify-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
      >
        <span className={pending ? 'invisible' : undefined}>Sign in</span>
        {pending ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </span>
        ) : null}
      </button>
    </form>
  );
}

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="animate-spin"
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M12.5 7A5.5 5.5 0 0 0 7 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
