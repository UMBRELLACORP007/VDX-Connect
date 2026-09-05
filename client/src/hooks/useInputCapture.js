import { useEffect, useRef, useState, useCallback } from 'react';
import { toRemotePixels } from '../lib/coordinateMapping';

const MOUSE_MOVE_THROTTLE_MS = 33; // ~30/sec, plenty for cursor tracking

// videoRef: ref to attach to the <video> element showing the remote screen.
// sendControl/remoteScreenSize/active come from useConnection().
export function useInputCapture({ sendControl, remoteScreenSize, active }) {
  const videoRef = useRef(null);
  const [engaged, setEngaged] = useState(false);
  const lastMoveRef = useRef(0);
  const heldKeysRef = useRef(new Set());

  const disengage = useCallback(() => {
    setEngaged(false);
    for (const code of heldKeysRef.current) sendControl('key-up', { code });
    heldKeysRef.current.clear();
  }, [sendControl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !active) return undefined;

    function isControlActive() { return engaged; }

    function pos(e) {
      return toRemotePixels(e.clientX, e.clientY, el, remoteScreenSize) || {};
    }

    function onMouseMove(e) {
      if (!isControlActive()) return;
      const now = performance.now();
      if (now - lastMoveRef.current < MOUSE_MOVE_THROTTLE_MS) return;
      lastMoveRef.current = now;
      const p = toRemotePixels(e.clientX, e.clientY, el, remoteScreenSize);
      if (p) sendControl('mouse-move', p);
    }
    function onMouseDown(e) {
      if (!isControlActive()) return;
      e.preventDefault();
      sendControl('mouse-down', { button: e.button, ...pos(e) });
    }
    function onMouseUp(e) {
      if (!isControlActive()) return;
      e.preventDefault();
      sendControl('mouse-up', { button: e.button, ...pos(e) });
    }
    function onDblClick(e) {
      if (!isControlActive()) return;
      e.preventDefault();
      sendControl('mouse-doubleclick', { button: e.button });
    }
    function onWheel(e) {
      if (!isControlActive()) return;
      e.preventDefault();
      sendControl('mouse-scroll', { deltaX: e.deltaX, deltaY: e.deltaY });
    }
    function onContextMenu(e) {
      if (isControlActive()) e.preventDefault();
    }
    function onClick() {
      el.focus();
      setEngaged(true);
    }
    function onBlur() {
      disengage();
    }

    function onKeyDown(e) {
      if (e.key === 'Escape' && engaged) {
        e.preventDefault();
        disengage();
        return;
      }
      if (!isControlActive()) return;
      e.preventDefault();
      if (e.repeat) return; // let the remote OS handle key-repeat once held
      heldKeysRef.current.add(e.code);
      sendControl('key-down', { code: e.code });
    }
    function onKeyUp(e) {
      if (!isControlActive()) return;
      e.preventDefault();
      heldKeysRef.current.delete(e.code);
      sendControl('key-up', { code: e.code });
    }

    el.tabIndex = 0; // needed for the element to be focusable/blurrable at all
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('dblclick', onDblClick);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('click', onClick);
    el.addEventListener('blur', onBlur);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    return () => {
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('dblclick', onDblClick);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('click', onClick);
      el.removeEventListener('blur', onBlur);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [active, engaged, remoteScreenSize, sendControl, disengage]);

  return { videoRef, engaged, disengage };
}
