import { Camera, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => {
    try {
      track.stop();
    } catch {
      // Ignore
    }
  });
}

function isLikelyMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isSecureCameraContext() {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext || window.location.hostname === 'localhost';
}

export function CameraCapture({
  disabled,
  onCapture,
  onError,
  cameraInputRef,
  variant = 'icon',
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    return () => stopStream(streamRef.current);
  }, []);

  useEffect(() => {
    if (!liveOpen) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }
  }, [liveOpen]);

  const closeLive = () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setLiveOpen(false);
    setStarting(false);
    setLiveError('');
  };

  const startLiveCamera = async () => {
    if (!isSecureCameraContext()) {
      onError?.(
        'Camera access needs a secure connection. Use HTTPS or localhost, or choose a photo from your gallery.',
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef?.current?.click();
      return;
    }

    setLiveOpen(true);
    setStarting(true);
    setLiveError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStarting(false);
    } catch (err) {
      setStarting(false);
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setLiveError('Camera access is blocked. Enable camera permission in your browser settings, or choose a gallery photo.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setLiveError('No camera was found on this device. Choose a photo from your gallery instead.');
      } else {
        setLiveError('Could not open the camera. You can still choose a photo from your gallery.');
      }
    }
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      setLiveError('Could not capture that photo. Please try again.');
      return;
    }

    const file = new File([blob], `civicchat-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
    closeLive();
    onCapture?.(file);
  };

  const handleClick = () => {
    if (disabled) return;
    if (isLikelyMobile()) {
      cameraInputRef?.current?.click();
      return;
    }
    startLiveCamera();
  };

  return (
    <>
      {variant === 'hero' ? (
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className="btn pulse-ring w-full !min-h-[60px] !rounded-2xl !text-[17px] !font-bold bg-gradient-to-r from-blue-700 via-blue-600 to-blue-700 text-white shadow-lg shadow-blue-700/30 hover:brightness-110 hover:-translate-y-0.5"
        >
          <Camera size={22} strokeWidth={2.4} />
          Snap a photo
        </button>
      ) : (
        <button
          type="button"
          title="Take photo"
          aria-label="Take photo"
          onClick={handleClick}
          disabled={disabled}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200/60 hover:text-blue-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Camera size={19} />
        </button>
      )}

      {liveOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-label="Take photo">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-slate-900 text-white shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-semibold">Take photo</p>
              <button type="button" onClick={closeLive} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Close camera">
                <X size={18} />
              </button>
            </div>
            <div className="relative aspect-[3/4] bg-black">
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
              {starting && (
                <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-200">Starting camera…</p>
              )}
            </div>
            <div className="space-y-2 p-4">
              {liveError ? (
                <p className="text-xs text-rose-200">{liveError}</p>
              ) : (
                <p className="text-[11px] text-slate-300">Position the issue in frame, then capture the photo.</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeLive}
                  className="flex-1 rounded-full border border-white/20 px-3 py-2.5 text-xs font-semibold"
                >
                  Cancel
                </button>
                {liveError ? (
                  <button
                    type="button"
                    onClick={startLiveCamera}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    <RefreshCw size={13} />
                    Try again
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={takePhoto}
                    disabled={starting}
                    className="flex-1 rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 disabled:opacity-50"
                  >
                    Capture photo
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default CameraCapture;
