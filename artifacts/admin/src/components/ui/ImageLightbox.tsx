import { Maximize2, Minimize2, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";

interface ImageLightboxProps {
  src: string;
  label?: string;
  onClose: () => void;
}

/**
 * ImageLightbox — full-screen image viewer with zoom, rotate, and fullscreen.
 * Keyboard shortcuts: Esc (close), +/= (zoom in), - (zoom out), R (rotate), F (fullscreen), 0 (reset).
 */
export function ImageLightbox({ src, label, onClose }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const rotate = () => setRotation((r) => (r + 90) % 360);
  const reset = () => {
    setZoom(1);
    setRotation(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "r" || e.key === "R") rotate();
      else if (e.key === "f" || e.key === "F") setFullscreen((f) => !f);
      else if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const containerSize = fullscreen ? "max-w-full w-full h-full" : "max-w-3xl w-full max-h-[90vh]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div
        className={`relative ${containerSize} flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-black/60 p-1.5 backdrop-blur">
            <button
              onClick={zoomOut}
              title="Zoom out (-)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10 disabled:opacity-30"
              disabled={zoom <= 0.5}
            >
              <ZoomOut size={16} />
            </button>
            <span className="w-12 text-center font-mono text-xs text-white select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              title="Zoom in (+)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10 disabled:opacity-30"
              disabled={zoom >= 4}
            >
              <ZoomIn size={16} />
            </button>
            <div className="mx-1 h-5 w-px bg-white/20" />
            <button
              onClick={rotate}
              title="Rotate 90° (R)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10"
            >
              <RotateCw size={16} />
            </button>
            <button
              onClick={() => setFullscreen((f) => !f)}
              title="Toggle fullscreen (F)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10"
            >
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={reset}
              title="Reset (0)"
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
            >
              Reset
            </button>
          </div>
          {label && (
            <span className="max-w-[40%] truncate rounded-xl bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              {label}
            </span>
          )}
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/60 text-white backdrop-blur hover:bg-white/20"
          >
            <X size={18} />
          </button>
        </div>

        {/* Image */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-black/40">
          <img
            src={src}
            alt={label ?? "Preview"}
            draggable={false}
            className="max-h-full max-w-full object-contain transition-transform duration-200 select-none"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center center",
            }}
          />
        </div>

        {/* Hint bar */}
        <p className="mt-2 text-center text-[11px] text-white/40 select-none">
          Scroll or use +/− to zoom · R to rotate · F for fullscreen · Esc to close
        </p>
      </div>
    </div>
  );
}
