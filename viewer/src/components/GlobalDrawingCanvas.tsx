import React, { useEffect, useRef } from 'react';

interface GlobalDrawingCanvasProps {
  isDrawMode: boolean;
  isMaskMode: boolean;
  scale: number;
  pan: { x: number, y: number };
  strokes: any[];
  activeStroke: { pageIdx: number, points: number[][] } | null;
  activeNoteColor: string;
  displayImages: any[];
  brushSize: number;
  brushOpacity: number;
  brushHardness: number;
}

const GlobalDrawingCanvas: React.FC<GlobalDrawingCanvasProps> = ({
  isDrawMode,
  isMaskMode,
  scale,
  pan,
  strokes,
  activeStroke,
  activeNoteColor,
  displayImages,
  brushSize,
  brushOpacity,
  brushHardness
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement>(null);

  // Redraw saved strokes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasRect = canvas.getBoundingClientRect();
    canvas.width = canvasRect.width;
    canvas.height = canvasRect.height;

    // Disable image smoothing for pixelated strokes
    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const rectCache = new Map();

    strokes.forEach(stroke => {
      if (stroke.note_id !== null) return;
      
      let imgRect = rectCache.get(stroke.page_idx);
      if (imgRect === undefined) {
        const imgElement = document.getElementById(`manga-img-${stroke.page_idx}`);
        if (imgElement) {
          imgRect = imgElement.getBoundingClientRect();
          rectCache.set(stroke.page_idx, imgRect);
        } else {
          rectCache.set(stroke.page_idx, null);
        }
      }
      
      if (!imgRect) return;

      const offsetX = imgRect.left - canvasRect.left;
      const offsetY = imgRect.top - canvasRect.top;

      const points = JSON.parse(stroke.points);
      if (points.length === 0) return;

      ctx.beginPath();
      
      if (stroke.brush_type === 'mask') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.globalAlpha = 1.0;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = stroke.opacity;
      }
      
      ctx.lineWidth = stroke.size * scale;
      
      ctx.moveTo(offsetX + points[0][0] * imgRect.width, offsetY + points[0][1] * imgRect.height);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(offsetX + points[i][0] * imgRect.width, offsetY + points[i][1] * imgRect.height);
      }
      ctx.stroke();
    });
    
    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  }, [strokes, scale, pan]);

  // Draw active stroke to buffer (or main canvas if masking)
  useEffect(() => {
    const buffer = bufferCanvasRef.current;
    if (!buffer) return;
    const ctx = buffer.getContext('2d');
    if (!ctx) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (buffer.width !== canvas.width || buffer.height !== canvas.height) {
      buffer.width = canvas.width;
      buffer.height = canvas.height;
    }

    // Disable image smoothing for pixelated strokes
    ctx.imageSmoothingEnabled = false;

    ctx.clearRect(0, 0, buffer.width, buffer.height);

    if (activeStroke && activeStroke.points.length > 0) {
      const imgElement = document.getElementById(`manga-img-${activeStroke.pageIdx}`);
      if (!imgElement) return;
      
      const imgRect = imgElement.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      
      const offsetX = imgRect.left - canvasRect.left;
      const offsetY = imgRect.top - canvasRect.top;

      if (isMaskMode) {
        // For mask mode, we draw directly onto the main canvas so it erases in real-time!
        const mainCtx = canvas.getContext('2d');
        if (!mainCtx) return;

        mainCtx.imageSmoothingEnabled = false;
        mainCtx.lineCap = 'round';
        mainCtx.lineJoin = 'round';
        mainCtx.globalCompositeOperation = 'destination-out';
        mainCtx.strokeStyle = 'rgba(0,0,0,1)';
        mainCtx.globalAlpha = 1.0;
        mainCtx.lineWidth = brushSize * scale;

        mainCtx.beginPath();
        mainCtx.moveTo(offsetX + activeStroke.points[0][0] * imgRect.width, offsetY + activeStroke.points[0][1] * imgRect.height);
        for (let i = 1; i < activeStroke.points.length; i++) {
          mainCtx.lineTo(offsetX + activeStroke.points[i][0] * imgRect.width, offsetY + activeStroke.points[i][1] * imgRect.height);
        }
        mainCtx.stroke();
        
        mainCtx.globalCompositeOperation = 'source-over';
      } else {
        // For normal drawing, we draw to the buffer canvas
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = activeNoteColor;
        ctx.globalAlpha = brushOpacity;
        ctx.lineWidth = brushSize * scale;

        ctx.beginPath();
        ctx.moveTo(offsetX + activeStroke.points[0][0] * imgRect.width, offsetY + activeStroke.points[0][1] * imgRect.height);
        for (let i = 1; i < activeStroke.points.length; i++) {
          ctx.lineTo(offsetX + activeStroke.points[i][0] * imgRect.width, offsetY + activeStroke.points[i][1] * imgRect.height);
        }
        ctx.stroke();
      }
    }
  }, [activeStroke, scale, activeNoteColor, pan, isMaskMode]);

  return (
    <div className={`absolute inset-0 w-full h-full z-20 ${(isDrawMode || isMaskMode) ? 'pointer-events-none' : 'pointer-events-none'}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ imageRendering: 'pixelated' }}
      />
      <canvas
        ref={bufferCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
};

export default GlobalDrawingCanvas;