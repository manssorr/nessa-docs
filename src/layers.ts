// The layers Escape closes: the drawer, an expanded chart, the details
// inspector, the On this page popover. One Escape closes one layer, the one
// opened (or raised) last; one listener decides, so no layer has to out-race
// another's. It listens in the bubble phase, so a control's own Escape (the
// search field clearing its text, a resize being cancelled) goes first and
// stops it. verification/details.mjs D18 covers the orders.

import { useEffect, useRef } from 'react';

type Layer = { readonly close: () => void };
const open: Layer[] = [];
let listening = false;

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const top = open[open.length - 1];
  if (!top) return;
  event.preventDefault();
  event.stopPropagation();
  top.close();
}

/**
 * While `active`, Escape calls `onEscape` when this layer is on top. A change of
 * `raise` while active moves the layer to the top again (a sheet that becomes a
 * dialog over an expanded chart is in front of it).
 */
export function useEscapeLayer(active: boolean, onEscape: () => void, raise: unknown = null) {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const layer: Layer = { close: () => handler.current() };
    open.push(layer);
    if (!listening) {
      window.addEventListener('keydown', onKey);
      listening = true;
    }
    return () => {
      const at = open.indexOf(layer);
      if (at >= 0) open.splice(at, 1);
      if (open.length === 0 && listening) {
        window.removeEventListener('keydown', onKey);
        listening = false;
      }
    };
  }, [active, raise]);
}
