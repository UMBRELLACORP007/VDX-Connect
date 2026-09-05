// Ported 1:1 from renderer.js. Maps a click/move position within the
// displayed (letterboxed) video element to 0..1 fractions of the actual
// video content, accounting for object-fit: contain letterboxing, then to
// real remote-screen pixels.
export function mapToRemoteFraction(clientX, clientY, videoEl) {
  const rect = videoEl.getBoundingClientRect();
  const vw = videoEl.videoWidth || rect.width;
  const vh = videoEl.videoHeight || rect.height;
  const videoAspect = vw / vh;
  const boxAspect = rect.width / rect.height;

  let displayW, displayH, offsetX, offsetY;
  if (videoAspect > boxAspect) {
    displayW = rect.width;
    displayH = rect.width / videoAspect;
    offsetX = 0;
    offsetY = (rect.height - displayH) / 2;
  } else {
    displayH = rect.height;
    displayW = rect.height * videoAspect;
    offsetY = 0;
    offsetX = (rect.width - displayW) / 2;
  }

  const x = (clientX - rect.left - offsetX) / displayW;
  const y = (clientY - rect.top - offsetY) / displayH;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

export function toRemotePixels(clientX, clientY, videoEl, remoteScreenSize) {
  if (!remoteScreenSize) return null;
  const frac = mapToRemoteFraction(clientX, clientY, videoEl);
  return { x: frac.x * remoteScreenSize.width, y: frac.y * remoteScreenSize.height };
}
