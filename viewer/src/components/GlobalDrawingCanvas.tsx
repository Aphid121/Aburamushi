import React, { useEffect, useRef } from 'react';

interface GlobalDrawingCanvasProps {
  isDrawMode: boolean;
  scale: number;
  pan: { x: number, y: number };
  strokes: any[];
  activeStroke: { pageIdx: number, points: number[][] } | null;
  activeNoteColor: string;
  displayImages: any[];
  brushSize: number;
  brushOpacity: number;
}

const GlobalDrawingCanvas: React.FC<GlobalDrawingCanvasProps> = ({
  isDrawMode,
  scale,
  pan,
  strokes,
  activeStroke,
  activeNoteColor,
  displayImages,
  brushSize,
  brushOpacity
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement>(null);

  // Redraw saved strokes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // We need to draw strokes for all visible pages
    // Instead of relying on displayImages (which is empty in infinite modes),
    // we find all rendered manga images in the DOM.
    const images = document.querySelectorAll('img[id^="manga-img-"]');
    
    images.forEach(imgElement => {
      const pageIdx = parseInt(imgElement.id.replace('manga-img-', ''), 10);
      const pageStrokes = strokes.filter(s => s.page_idx === pageIdx && s.note_id === null);
      
      const imgRect = imgElement.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      
      // Calculate the offset of the image relative to the canvas
      const offsetX = imgRect.left - canvasRect.left;
      const offsetY = imgRect.top - canvasRect.top;

      pageStrokes.forEach(stroke => {
        const points = JSON.parse(stroke.points);
        if (points.length === 0) return;

        ctx.beginPath();
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size * scale;
        ctx.globalAlpha = stroke.opacity;
        
        ctx.moveTo(offsetX + points[0][0] * imgRect.width, offsetY + points[0][1] * imgRect.height);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(offsetX + points[i][0] * imgRect.width, offsetY + points[i][1] * imgRect.height);
        }
        ctx.stroke();
      });
    });
  }, [strokes, scale, pan]);

  // Draw active stroke to buffer
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

    ctx.clearRect(0, 0, buffer.width, buffer.height);

    if (activeStroke && activeStroke.points.length > 0) {
      const imgElement = document.getElementById(`manga-img-${activeStroke.pageIdx}`);
      if (!imgElement) return;
      
      const imgRect = imgElement.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      
      const offsetX = imgRect.left - canvasRect.left;
      const offsetY = imgRect.top - canvasRect.top;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = activeNoteColor;
      ctx.lineWidth = brushSize * scale;
      ctx.globalAlpha = brushOpacity;

      ctx.beginPath();
      ctx.moveTo(offsetX + activeStroke.points[0][0] * imgRect.width, offsetY + activeStroke.points[0][1] * imgRect.height);
      for (let i = 1; i < activeStroke.points.length; i++) {
        ctx.lineTo(offsetX + activeStroke.points[i][0] * imgRect.width, offsetY + activeStroke.points[i][1] * imgRect.height);
      }
      ctx.stroke();
    }
  }, [activeStroke, scale, activeNoteColor, pan]);

  return (
    <div className={`absolute inset-0 w-full h-full z-20 ${isDrawMode ? 'pointer-events-none' : 'pointer-events-none'}`}>
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