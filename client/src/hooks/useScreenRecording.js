import { useCallback, useRef, useState } from 'react';
import { ipc } from '../lib/ipc';

export function useScreenRecording() {
  const [recording, setRecording] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const start = useCallback((stream) => {
    if (!stream || recorderRef.current) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      const result = await ipc.saveRecording(buffer, `VDX-recording-${Date.now()}.webm`);
      if (result?.saved) setLastSavedPath(result.path);
      chunksRef.current = [];
    };
    rec.start(1000); // 1s timeslice so ondataavailable fires incrementally, not just at stop
    recorderRef.current = rec;
    setRecording(true);
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  return { recording, lastSavedPath, start, stop };
}
