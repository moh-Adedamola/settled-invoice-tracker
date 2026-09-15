import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * App shell loads two families only. Newsreader is scoped to the marketing
 * segment (src/app/(marketing)/layout.tsx) so authenticated screens never pay
 * for a display face they do not use. See docs/design-system.md §5.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/**
 * `metadataBase` resolves the Open Graph image to an absolute URL, which every
 * scraper requires and none will guess. Taken from the deploy's own origin when
 * it publishes one, so a preview deployment advertises itself rather than
 * production.
 *
 * `title.template` lets each page set only its own name. The landing page is the
 * exception and sets an absolute title, because "Settled — Settled" is not a
 * thing anyone should read.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Settled",
    template: "%s",
  },
  description:
    "Invoice and payment tracking across Stripe, Paystack and Flutterwave.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /*
      No `data-theme` here on purpose.

      The attribute is now the reader's, not ours. Its absence resolves to the
      base palette — light, ledger paper — and lets the `prefers-color-scheme`
      block in globals.css apply, which is the "system" state of the toggle.
      Hardcoding `dark` here is what made that media query dead code.
    */
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Before first paint, not after hydration.

          A stored preference applied by React lands after the page has already
          painted, so every navigation flashes the default theme and then
          corrects itself. This stamps the attribute synchronously in the head,
          which is the one case where a render-blocking script is the right
          answer. See `lib/theme.ts` for why it is this small and why it cannot
          throw.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
