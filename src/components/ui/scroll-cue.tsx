'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

/**
 * §8 horizontal-scroll cue: a fade at the right edge while there is more table
 * to the right of it, nothing once the last column is on screen.
 *
 * ## Why this is JavaScript
 *
 * The pure-CSS version is the obvious first answer, and it was tried: two
 * `background-attachment: local` covers over two `scroll` shadows, so the
 * covers travel with the content and mask the shadow at whichever end is fully
 * scrolled. No listener, always exactly as true as the scroll position.
 *
 * It does not survive measurement. Painting the four layers in flat colours and
 * reading the pixels back, Chrome 141 places a `scroll`-attachment layer
 * positioned at `right center` **19px past the visible right edge** of a
 * horizontally scrolling element — the positioning area is wider than the box
 * it is painted into. The right-hand shadow rendered 1px wide instead of 20px,
 * at every scroll position. The left-hand layers, anchored at `left center`,
 * were correct. A cue that only works on the edge that already has a pinned
 * column is not a cue.
 *
 * So: measure the element. `scrollWidth`, `clientWidth` and `scrollLeft` are
 * unambiguous, and a ResizeObserver covers the cases a one-shot check misses —
 * a viewport resize, a font swap, a filter that changes the column widths.
 *
 * ## Why `useSyncExternalStore`
 *
 * Scroll position is an external store. Mirroring it into state from an effect
 * causes a cascading render on mount and React 19's lint rejects it — the same
 * ground the sidebar's collapse preference covers. The snapshot is a string so
 * that returning it repeatedly cannot loop.
 *
 * The server snapshot carries no cue, so the first paint has none and the
 * client corrects it after hydration. That is the right way round: a cue
 * rendered before anything has been measured would be a guess.
 */

/**
 * `"<edge>:<inset>"`. A string rather than an object because
 * `useSyncExternalStore` compares snapshots by identity, and a fresh object on
 * every call is an infinite render loop.
 */
type Snapshot = `${'none' | 'end'}:${number}`;

export function ScrollCue({
  className = '',
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  // A callback ref rather than useRef: the subscription has to be rebuilt when
  // the node arrives, and a ref mutation does not re-render.
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!node) return () => {};
      node.addEventListener('scroll', onChange, { passive: true });
      const observer = new ResizeObserver(onChange);
      observer.observe(node);
      // The table itself, not just the viewport: a filter that returns wider
      // rows changes the overflow without changing the container.
      for (const child of Array.from(node.children)) observer.observe(child);
      return () => {
        node.removeEventListener('scroll', onChange);
        observer.disconnect();
      };
    },
    [node],
  );

  const getSnapshot = useCallback((): Snapshot => {
    if (!node) return 'none:0';

    // A column pinned to the right edge sits above this overlay, so the fade
    // has to stop where that column starts — laid over it, the fade would dim
    // the one figure the pin exists to keep readable. Measured rather than
    // passed in, so it survives the column being re-laid-out.
    // ceil, not round: a fractional column width rounded down leaves the fade
    // overlapping the pinned column by a sub-pixel sliver.
    const pinned = node.querySelector('[data-pinned-end]');
    const inset = pinned ? Math.ceil(pinned.getBoundingClientRect().width) : 0;

    const overflow = node.scrollWidth - node.clientWidth;
    // 1px of slack: sub-pixel layout leaves a fractional remainder on a table
    // that actually fits, and a cue that never switches off is a decoration.
    if (overflow <= 1) return `none:${inset}`;
    return node.scrollLeft < overflow - 1 ? `end:${inset}` : `none:${inset}`;
  }, [node]);

  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => 'none:0' as Snapshot,
  );
  const [edge, inset] = snapshot.split(':');

  return (
    <div className={`relative ${className}`}>
      <div ref={setNode} className="overflow-x-auto rounded-[inherit]">
        {children}
      </div>
      {/* Only the right edge. The pinned invoice column is itself the signal
          that the left is anchored rather than lost, and a fade over it would
          erase the one value that identifies the row. */}
      <span
        aria-hidden="true"
        data-visible={edge === 'end'}
        className="scroll-cue-edge"
        style={{ right: `${inset}px` }}
      />
    </div>
  );
}
