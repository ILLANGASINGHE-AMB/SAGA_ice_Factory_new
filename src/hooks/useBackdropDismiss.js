import { useCallback, useRef } from 'react';

// On a touch screen a plain `onClick` on the backdrop is far too eager. A
// finger that starts a scroll inside the panel and lifts over the dim area, a
// resting palm, or a tap that lands a few pixels off the panel edge all
// synthesise a click on the backdrop — and the popup vanishes, taking any
// half-filled form with it.
//
// A dismissal only counts when the gesture is unambiguously a deliberate tap
// on the dim area itself:
//   1. it STARTS on the backdrop (not on the panel, so drags out of a
//      scrolling list are ignored);
//   2. it ENDS on the backdrop as well;
//   3. the finger travelled less than a fingertip's width in between, so a
//      swipe or flick is not mistaken for a tap.
const DRAG_TOLERANCE_PX = 14;

export function useBackdropDismiss(onDismiss, enabled = true) {
  const originRef = useRef(null);

  const onPointerDown = useCallback((e) => {
    originRef.current = e.target === e.currentTarget
      ? { x: e.clientX, y: e.clientY }
      : null;
  }, []);

  const onPointerUp = useCallback((e) => {
    const origin = originRef.current;
    originRef.current = null;
    if (!enabled || !origin) return;
    if (e.target !== e.currentTarget) return;
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > DRAG_TOLERANCE_PX) return;
    onDismiss();
  }, [enabled, onDismiss]);

  // A cancelled pointer (the browser taking over for a scroll or a system
  // gesture) must not leave a stale origin behind that arms the next lift.
  const onPointerCancel = useCallback(() => {
    originRef.current = null;
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel };
}
