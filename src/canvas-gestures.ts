// Pan and zoom for a diagram stage: a scroll box holding a scaled SVG.
// The orderings are designed in verification/CHECKLIST.md ("Canvas gestures and
// build check: states × events"); the row numbers below are that table's, and
// each row is exercised by verification/navigation.mjs.
// Panning only scrolls the stage; zooming only changes the SVG's width and
// height. The SVG is never re-inserted, and React renders once per zoom frame.

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;
/** Movement before a press becomes a pan; below it a click is still a click (rows 2–3). */
export const DRAG_THRESHOLD = 4;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Where `focal` sits on the drawn diagram, as a fraction of its width and height. */
export function anchorFraction(drawn: { left: number; top: number; width: number; height: number }, focal: { x: number; y: number }) {
  return { fx: (focal.x - drawn.left) / (drawn.width || 1), fy: (focal.y - drawn.top) / (drawn.height || 1) };
}

/** How far to scroll so the anchored spot of the resized diagram is back under `focal`. */
export function anchorScrollDelta(
  drawn: { left: number; top: number; width: number; height: number },
  anchor: { fx: number; fy: number },
  focal: { x: number; y: number },
): { dx: number; dy: number } {
  return { dx: drawn.left + anchor.fx * drawn.width - focal.x, dy: drawn.top + anchor.fy * drawn.height - focal.y };
}

/** Per-event zoom factor from a wheel delta, bounded so one notch of a mouse wheel is a gentle step. */
export function wheelFactor(deltaY: number, deltaMode: number): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.min(1.25, Math.max(0.8, Math.exp(-pixels * 0.004)));
}

export interface CanvasHost {
  readonly stage: HTMLElement;
  readonly svg: () => SVGSVGElement | null;
  readonly scale: () => number;
  /** Size the SVG for `next` (synchronously) and record it as the chosen zoom. */
  readonly setScale: (next: number) => void;
  /**
   * For a diagram that grows with the page (Read view): the scroller that
   * takes the part of the correction the stage cannot, so the focal point
   * holds vertically too. Canvas diagrams have none: they never scroll the page.
   */
  readonly pageScroller?: () => HTMLElement | null;
}

// One gesture keeps one anchor: the pointed-at spot as a fraction of the
// diagram's drawn size, taken at its first step. Re-deriving it each step from
// whole-pixel scroll positions (WebKit) would add each step's rounding to the next.
const anchors = new WeakMap<HTMLElement, { x: number; y: number; fx: number; fy: number; at: number; left: number; top: number }>();
const ANCHOR_REUSE_MS = 400;

/** Zooms to `next` keeping the point under `focal` (client coordinates) where it is. */
export function zoomAround(host: CanvasHost, next: number, focal: { x: number; y: number }) {
  const svg = host.svg();
  const to = clampScale(next);
  if (!svg || to === host.scale()) return;
  const { stage } = host;
  const before = svg.getBoundingClientRect();
  const now = performance.now();
  const kept = anchors.get(stage);
  // Reused only while nothing else moved the diagram since the last step (no scroll, pan or page scroll in between).
  const unmoved = kept !== undefined && Math.abs(kept.left - before.left) < 0.5 && Math.abs(kept.top - before.top) < 0.5;
  const anchor =
    kept && unmoved && Math.abs(kept.x - focal.x) < 1 && Math.abs(kept.y - focal.y) < 1 && now - kept.at < ANCHOR_REUSE_MS
      ? kept
      : { x: focal.x, y: focal.y, ...anchorFraction(before, focal), at: now, left: 0, top: 0 };
  host.setScale(to);
  const { dx, dy } = anchorScrollDelta(svg.getBoundingClientRect(), anchor, focal);
  const startLeft = stage.scrollLeft;
  const startTop = stage.scrollTop;
  stage.scrollLeft = startLeft + dx;
  stage.scrollTop = startTop + dy;
  const page = host.pageScroller?.();
  if (page) {
    page.scrollLeft += dx - (stage.scrollLeft - startLeft);
    page.scrollTop += dy - (stage.scrollTop - startTop);
  }
  const placed = svg.getBoundingClientRect();
  anchors.set(stage, { ...anchor, at: now, left: placed.left, top: placed.top });
}

type WebKitGestureEvent = UIEvent & { scale: number };

export function attachCanvasGestures(host: CanvasHost): () => void {
  const { stage } = host;
  let press: { id: number; x: number; y: number; left: number; top: number; panning: boolean } | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; scale: number } | null = null;
  let last = { x: 0, y: 0 };
  let frame = 0;
  let pending: { scale: number; focal: { x: number; y: number } } | null = null;
  let gestureStart = 1;

  const schedule = (scale: number, focal: { x: number; y: number }) => {
    pending = { scale, focal };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const job = pending;
      pending = null;
      if (job) zoomAround(host, job.scale, job.focal);
    });
  };
  const target = () => pending?.scale ?? host.scale();

  // The press is cleared before capture is released, so a lostpointercapture
  // dispatched during release finds nothing to act on (row 7).
  const endPress = () => {
    const id = press?.id;
    press = null;
    delete stage.dataset.panning;
    if (id !== undefined && stage.hasPointerCapture?.(id)) stage.releasePointerCapture(id);
  };

  const onPointerDown = (event: PointerEvent) => {
    last = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, last);
      if (touches.size === 2) {
        const [a, b] = [...touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: host.scale() }; // row 12
      }
      return; // one finger: native scroll (row 11)
    }
    if (event.button !== 0) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, panning: false }; // row 1
  };

  const onPointerMove = (event: PointerEvent) => {
    last = { x: event.clientX, y: event.clientY };
    if (event.pointerType === 'touch') {
      if (!touches.has(event.pointerId)) return;
      touches.set(event.pointerId, last);
      if (pinch && touches.size === 2) {
        const [a, b] = [...touches.values()] as [{ x: number; y: number }, { x: number; y: number }];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        schedule(pinch.scale * (distance / pinch.distance), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); // row 13
      }
      return;
    }
    if (!press || event.pointerId !== press.id) return;
    if ((event.buttons & 1) === 0) {
      // Row 18: released outside the stage before capture began; this is a hover, not a drag.
      endPress();
      return;
    }
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.panning) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return; // row 2
      press.panning = true; // row 3
      stage.setPointerCapture?.(press.id);
      stage.dataset.panning = '';
    }
    stage.scrollLeft = press.left - dx; // row 4
    stage.scrollTop = press.top - dy;
    event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.delete(event.pointerId);
      if (touches.size < 2) pinch = null; // row 14
      return;
    }
    if (!press || event.pointerId !== press.id) return;
    // Row 6: after a pan the pointer was captured by the stage, so the click that
    // follows targets the stage, not a node, and opens nothing. A press that
    // never panned lets its click through to the node (row 5).
    endPress();
  };

  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      touches.delete(event.pointerId);
      if (touches.size < 2) pinch = null;
      return;
    }
    if (press && event.pointerId === press.id) endPress(); // row 7: no click follows a cancel
  };

  const onLostCapture = (event: PointerEvent) => {
    if (press && event.pointerId === press.id) {
      press = null;
      delete stage.dataset.panning;
    }
  };

  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return; // row 9: plain wheel scrolls natively
    event.preventDefault(); // row 8 (macOS trackpad pinch arrives as ctrl + wheel)
    schedule(target() * wheelFactor(event.deltaY, event.deltaMode), { x: event.clientX, y: event.clientY });
  };

  const onGestureStart = (event: Event) => {
    event.preventDefault(); // row 10 (Safari trackpad pinch)
    gestureStart = host.scale();
  };
  const onGestureChange = (event: Event) => {
    event.preventDefault();
    schedule(gestureStart * (event as WebKitGestureEvent).scale, last);
  };

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerCancel);
  stage.addEventListener('lostpointercapture', onLostCapture);
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('gesturestart', onGestureStart);
  stage.addEventListener('gesturechange', onGestureChange);

  return () => {
    // row 17
    if (frame) cancelAnimationFrame(frame);
    endPress();
    touches.clear();
    stage.removeEventListener('pointerdown', onPointerDown);
    stage.removeEventListener('pointermove', onPointerMove);
    stage.removeEventListener('pointerup', onPointerUp);
    stage.removeEventListener('pointercancel', onPointerCancel);
    stage.removeEventListener('lostpointercapture', onLostCapture);
    stage.removeEventListener('wheel', onWheel);
    stage.removeEventListener('gesturestart', onGestureStart);
    stage.removeEventListener('gesturechange', onGestureChange);
  };
}
