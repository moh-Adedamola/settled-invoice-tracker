import type { ReactNode } from "react";
import { Newsreader } from "next/font/google";

/**
 * Marketing and auth segment. Newsreader is the display face and loads only
 * here — the app shell ships Plex Sans + Plex Mono and nothing else.
 * See docs/design-system.md §5.
 *
 * The variable is applied to a wrapper element rather than <html>, so
 * --font-display resolves to the real family inside this segment and falls
 * back to the declared serif stack everywhere else.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={`${newsreader.variable} flex flex-1 flex-col`}>
      {children}
    </div>
  );
}
