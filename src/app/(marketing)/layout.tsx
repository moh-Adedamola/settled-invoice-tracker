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
    /*
      Two segment-wide numbers, set here because both the masthead and
      everything that has to clear it need to agree on them.

      --masthead-h is the pinned bar's height. 76px is the comfortable figure at
      a normal viewport; 56px is what a phone in landscape gets, because at
      390px of viewport height a 76px bar is a fifth of the page spent on two
      links. `height <= 480px` rather than a width query on purpose — the cost
      of a sticky bar is measured in vertical space, so the condition that
      relieves it should be too, and this catches a short desktop window as well
      as a rotated phone.

      --sticky-top overrides the app shell's value (globals.css) for this
      subtree only. The token inherits, which is the whole reason it exists as a
      variable: nothing in here has to know what the app shell's strip is doing,
      and the scroll-margin rule in globals.css picks up the right number for
      whichever segment the focused element is in.
    */
    <div
      className={`${newsreader.variable} flex flex-1 flex-col [--masthead-h:76px] [--sticky-top:var(--masthead-h)] [@media(max-height:480px)]:[--masthead-h:56px]`}
    >
      {children}
    </div>
  );
}
