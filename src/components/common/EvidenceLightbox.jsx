import { ChevronLeft, ChevronRight, Loader2, RefreshCw, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const SCALE_STEP = 0.4;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function EvidenceLightbox({ images = [], startIndex = 0, isOpen, onClose, title = 'View photo evidence' }) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('loading');
  const dragRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const pinchRef = useRef(null);
  const closeRef = useRef(null);
  const items = useMemo(() => (Array.isArray(images) ? images.filter((item) => item?.src) : []), [images]);
  const current = items[index] || items[0];

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    setIndex(clamp(startIndex, 0, Math.max(0, items.length - 1)));
    resetView();
    setStatus('loading');
    const previous = document.activeElement;
    const timer = setTimeout(() => closeRef.current?.focus(), 20);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [isOpen, items.length, resetView, startIndex]);

  const zoomBy = useCallback((delta) => {
    setScale((prev) => {
      const next = clamp(Number((prev + delta).toFixed(2)), MIN_SCALE, MAX_SCALE);
      if (next <= MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const showPrev = useCallback(() => {
    setIndex((prev) => (prev - 1 + items.length) % items.length);
    resetView();
    setStatus('loading');
  }, [items.length, resetView]);

  const showNext = useCallback(() => {
    setIndex((prev) => (prev + 1) % items.length);
    resetView();
    setStatus('loading');
  }, [items.length, resetView]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') zoomBy(SCALE_STEP);
      if (event.key === '-' || event.key === '_') zoomBy(-SCALE_STEP);
      if (event.key === '0') resetView();
      if (event.key === 'ArrowLeft' && items.length > 1) showPrev();
      if (event.key === 'ArrowRight' && items.length > 1) showNext();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, items.length, onClose, resetView, showNext, showPrev, zoomBy]);

  const onPointerDown = (event) => {
    if (scale <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    setOffset({
      x: dragRef.current.ox + (event.clientX - dragRef.current.x),
      y: dragRef.current.oy + (event.clientY - dragRef.current.y),
    });
  };

  const onPointerUp = () => setDragging(false);

  const onWheel = (event) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? SCALE_STEP / 2 : -SCALE_STEP / 2);
  };

  const onTouchStart = (event) => {
    if (event.touches.length === 2) {
      const [a, b] = event.touches;
      pinchRef.current = {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        scale,
      };
    }
  };

  const onTouchMove = (event) => {
    if (event.touches.length === 2 && pinchRef.current) {
      event.preventDefault();
      const [a, b] = event.touches;
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const next = clamp((pinchRef.current.scale * distance) / pinchRef.current.distance, MIN_SCALE, MAX_SCALE);
      setScale(next);
      if (next <= MIN_SCALE) setOffset({ x: 0, y: 0 });
    }
  };

  if (!isOpen || !current) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950/90" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {current.caption ? <p className="truncate text-[11px] text-slate-300">{current.caption}</p> : null}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => zoomBy(-SCALE_STEP)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Zoom out">
            <ZoomOut size={18} />
          </button>
          <button type="button" onClick={() => zoomBy(SCALE_STEP)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Zoom in">
            <ZoomIn size={18} />
          </button>
          <button type="button" onClick={resetView} className="rounded-lg p-2 hover:bg-white/10" aria-label="Fit to screen">
            <RotateCcw size={18} />
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-white/10"
            aria-label="Close photo viewer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={showPrev}
              className="absolute left-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Previous photo"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={showNext}
              className="absolute right-3 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Next photo"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-white">
            <Loader2 className="animate-spin" size={28} />
            <span className="sr-only">Loading photo evidence</span>
          </div>
        )}

        {status === 'error' ? (
          <div className="z-10 flex flex-col items-center gap-3 text-center text-white">
            <p className="text-sm">This photo could not be loaded.</p>
            <button
              type="button"
              onClick={() => setStatus('loading')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-900"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          </div>
        ) : (
          <img
            src={current.src}
            alt={current.alt || 'Photo evidence'}
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            draggable={false}
            className={`max-h-full max-w-full select-none object-contain ${scale > 1 ? 'cursor-grab' : 'cursor-zoom-in'} ${
              dragging ? 'cursor-grabbing' : ''
            }`}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              visibility: status === 'ready' ? 'visible' : 'hidden',
            }}
            onDoubleClick={() => (scale > 1 ? resetView() : zoomBy(SCALE_STEP * 2))}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
