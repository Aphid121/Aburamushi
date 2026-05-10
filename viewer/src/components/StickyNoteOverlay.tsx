import React, { useState, useRef, useEffect } from 'react';
import { X, Settings as SettingsIcon } from 'lucide-react';
import { NOTE_COLORS, NOTE_PRESETS } from './StickyNoteSidebar';

export interface StrokeData {
  id: string;
  manga_id: string;
  page_idx: number;
  note_id: string | null; // null if drawn directly on the page
  brush_type: string;
  color: string;
  size: number;
  opacity: number;
  hardness: number;
  points: string; // JSON string of [x, y] arrays
}

export interface StickyNoteData {
  id: string;
  manga_id: string;
  page_idx: number;
  local_x: number;
  local_y: number;
  width: number;
  height: number;
  color: string;
  content: string;
  font_size?: number;
  font_family?: string;
}

interface StickyNoteOverlayProps {
  notes: StickyNoteData[];
  pageIdx: number;
  scale: number;
  onUpdateNote: (note: StickyNoteData) => void;
  onDeleteNote: (id: string) => void;
  isDraggingCanvas: boolean;
  isDrawMode?: boolean;
  isMaskMode?: boolean;
  isPageCanvas?: boolean;
}

const StickyNoteOverlay: React.FC<StickyNoteOverlayProps> = ({
  notes,
  pageIdx,
  scale,
  onUpdateNote,
  onDeleteNote,
  isDraggingCanvas,
  isDrawMode = false,
  isMaskMode = false,
  isPageCanvas = false
}) => {
  const pageNotes = notes.filter(n => n.page_idx === pageIdx);
  
  if (pageNotes.length === 0) return null;

  return (
    <div className={`absolute inset-0 w-full h-full pointer-events-none ${isPageCanvas ? 'z-10' : 'z-[60]'}`} style={{ containerType: 'inline-size' }}>
      {pageNotes.map(note => (
        <StickyNote
          key={note.id}
          note={note}
          scale={scale}
          onUpdate={onUpdateNote}
          onDelete={() => onDeleteNote(note.id)}
          isDraggingCanvas={isDraggingCanvas}
          isDrawMode={isDrawMode}
          isMaskMode={isMaskMode}
          isPageCanvas={isPageCanvas}
        />
      ))}
    </div>
  );
};

interface StickyNoteProps {
  note: StickyNoteData;
  scale: number;
  onUpdate: (note: StickyNoteData) => void;
  onDelete: () => void;
  isDraggingCanvas: boolean;
  isDrawMode: boolean;
  isMaskMode: boolean;
  isPageCanvas: boolean;
}

const StickyNote: React.FC<StickyNoteProps> = ({ note, scale, onUpdate, onDelete, isDraggingCanvas, isDrawMode, isMaskMode, isPageCanvas }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [localPos, setLocalPos] = useState({ x: note.local_x, y: note.local_y });
  const [content, setContent] = useState(note.content);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const noteRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Default settings
  const [fontSize, setFontSize] = useState(note.font_size || 1.5);
  const [fontFamily, setFontFamily] = useState(note.font_family || 'sans-serif');

  useEffect(() => {
    const loadSettings = async () => {
      if (!note.font_size || !note.font_family) {
        if ((window as any).electronAPI) {
          const settings = await (window as any).electronAPI.getSettings();
          if (!note.font_size && settings['sticky_note_font_size']) {
            setFontSize(parseFloat(settings['sticky_note_font_size']));
          }
          if (!note.font_family && settings['sticky_note_font_family']) {
            setFontFamily(settings['sticky_note_font_family']);
          }
        }
      }
    };
    loadSettings();
  }, [note.font_size, note.font_family]);

  // Sync local state if props change from outside
  useEffect(() => {
    setLocalPos({ x: note.local_x, y: note.local_y });
    setContent(note.content);
  }, [note.local_x, note.local_y, note.content]);

  // Drawing State
  const [strokes, setStrokes] = useState<StrokeData[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<number[][]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load strokes on mount
  useEffect(() => {
    const loadStrokes = async () => {
      if ((window as any).electronAPI) {
        // We now fetch all strokes for the manga at the Reader level,
        // but for now we'll just fetch them here and filter by note_id
        const loadedStrokes = await (window as any).electronAPI.getStrokes(note.manga_id);
        setStrokes(loadedStrokes.filter((s: StrokeData) => {
          if (isPageCanvas) {
            return s.note_id === null && s.page_idx === note.page_idx;
          } else {
            return s.note_id === note.id;
          }
        }));
      }
    };
    loadStrokes();
  }, [note.id, note.manga_id, note.page_idx, isPageCanvas]);

  // Redraw canvas when strokes change or resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution to match its display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    strokes.forEach(stroke => {
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
      
      ctx.lineWidth = stroke.size;
      
      // Basic drawing (we'll add hardness/smoothing later)
      ctx.moveTo(points[0][0] * canvas.width, points[0][1] * canvas.height);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0] * canvas.width, points[i][1] * canvas.height);
      }
      ctx.stroke();
    });
    
    ctx.globalCompositeOperation = 'source-over';
  }, [strokes, note.width, note.height, scale]); // Re-run if size or scale changes

  const handleDrawStart = (e: React.PointerEvent) => {
    if (!(isDrawMode || isMaskMode) || e.button !== 0) return;
    
    // Always stop propagation when drawing on a sticky note
    // so we don't accidentally drag the note or pan the canvas
    e.stopPropagation();
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Check if we are in eraser mode (we need to pass this prop down!)
    // For now, we'll just use the global isEraserMode if we can, but since we can't easily,
    // we'll just let the Reader handle the eraser for now, or we can add it here later!

    setIsDrawing(true);
    setCurrentPath([[x, y]]);
    canvas.setPointerCapture(e.pointerId);
  };

  const handleDrawMove = (e: React.PointerEvent) => {
    if (!isDrawing || !(isDrawMode || isMaskMode)) return;
    
    e.stopPropagation();
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    setCurrentPath(prev => [...prev, [x, y]]);

    if (isMaskMode) {
      // For mask mode, we draw directly onto the main canvas
      const mainCtx = canvas.getContext('2d');
      if (!mainCtx) return;

      mainCtx.imageSmoothingEnabled = false;
      mainCtx.lineCap = 'round';
      mainCtx.lineJoin = 'round';
      mainCtx.globalCompositeOperation = 'destination-out';
      mainCtx.strokeStyle = 'rgba(0,0,0,1)';
      mainCtx.lineWidth = 2;
      mainCtx.globalAlpha = 1.0;

      mainCtx.beginPath();
      mainCtx.moveTo(currentPath[0][0] * canvas.width, currentPath[0][1] * canvas.height);
      for (let i = 1; i < currentPath.length; i++) {
        mainCtx.lineTo(currentPath[i][0] * canvas.width, currentPath[i][1] * canvas.height);
      }
      mainCtx.lineTo(x * canvas.width, y * canvas.height);
      mainCtx.stroke();
      
      mainCtx.globalCompositeOperation = 'source-over';
    } else {
      // Draw the current stroke to the buffer canvas
      const buffer = bufferCanvasRef.current;
      if (!buffer) return;
      const ctx = buffer.getContext('2d');
      if (!ctx) return;

      if (currentPath.length === 0) return;

    // Ensure buffer resolution matches
    if (buffer.width !== canvas.width || buffer.height !== canvas.height) {
      buffer.width = canvas.width;
      buffer.height = canvas.height;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, buffer.width, buffer.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000000'; // Hardcoded for now
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1.0;

      ctx.beginPath();
      ctx.moveTo(currentPath[0][0] * buffer.width, currentPath[0][1] * buffer.height);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i][0] * buffer.width, currentPath[i][1] * buffer.height);
      }
      ctx.lineTo(x * buffer.width, y * buffer.height);
      ctx.stroke();
    }
  };

  const handleDrawEnd = async (e: React.PointerEvent) => {
    if (!isDrawing || !(isDrawMode || isMaskMode)) return;
    
    e.stopPropagation();
    e.preventDefault();
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId);
    }

    // Clear buffer
    const buffer = bufferCanvasRef.current;
    if (buffer) {
      const ctx = buffer.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, buffer.width, buffer.height);
    }

    if (currentPath.length < 2) return;

    const newStroke: StrokeData = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      manga_id: note.manga_id,
      page_idx: note.page_idx,
      note_id: isPageCanvas ? null : note.id,
      brush_type: isMaskMode ? 'mask' : 'pen',
      color: isMaskMode ? '#000000' : '#000000', // Hardcoded for now
      size: 2,
      opacity: 1.0,
      hardness: 1.0,
      points: JSON.stringify(currentPath)
    };

    setStrokes(prev => [...prev, newStroke]);
    setCurrentPath([]);

    if ((window as any).electronAPI) {
      await (window as any).electronAPI.saveStroke(newStroke);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag on left click
    if (e.button !== 0) return;
    
    // If we are clicking inside the textarea, don't initiate a drag
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
    
    e.stopPropagation(); // Prevent canvas panning
    e.preventDefault(); // Prevent default drag behavior that might interfere
    
    if (noteRef.current) {
      const noteRect = noteRef.current.getBoundingClientRect();
      
      // Calculate drag start relative to the note itself in screen pixels
      setDragStart({
        x: e.clientX - noteRect.left,
        y: e.clientY - noteRect.top
      });
      setIsDragging(true);
      noteRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !noteRef.current) return;
    e.stopPropagation();
    e.preventDefault();

    const parentRect = noteRef.current.parentElement!.getBoundingClientRect();

    // Calculate new screen position of the note's top-left corner
    const newScreenX = e.clientX - dragStart.x;
    const newScreenY = e.clientY - dragStart.y;

    // Convert to percentages relative to the parent container
    let newPctX = ((newScreenX - parentRect.left) / parentRect.width) * 100;
    let newPctY = ((newScreenY - parentRect.top) / parentRect.height) * 100;

    // Allow notes to bleed out of bounds
    // newPctX = Math.max(0, Math.min(100 - note.width, newPctX));
    // newPctY = Math.max(0, Math.min(100 - note.height, newPctY));

    setLocalPos({ x: newPctX, y: newPctY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(false);
    if (noteRef.current) {
      noteRef.current.releasePointerCapture(e.pointerId);
    }
    
    // Save to DB
    onUpdate({
      ...note,
      local_x: localPos.x,
      local_y: localPos.y,
      content: content // Ensure we save the current content when dropping
    });
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleContentBlur = () => {
    if (content !== note.content) {
      onUpdate({
        ...note,
        content
      });
    }
  };

  // Prevent canvas panning when interacting with the textarea
  const stopPropagation = (e: React.MouseEvent | React.TouchEvent | React.WheelEvent | React.KeyboardEvent | React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={noteRef}
      className={`absolute pointer-events-auto transition-shadow group
        ${isDragging ? 'shadow-xl z-[9999] opacity-90' : isSettingsOpen ? 'z-[9998]' : isPageCanvas ? 'z-10' : 'z-[60]'}
        ${isDraggingCanvas ? 'pointer-events-none' : ''}
      `}
      style={{
        left: `${localPos.x}%`,
        top: `${localPos.y}%`,
        width: `${note.width}%`,
        height: `${note.height}%`,
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Background with shading (separate from container so it doesn't rotate text if we ever add rotation) */}
      {!isPageCanvas && (
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: note.color,
            backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(0,0,0,0.1) 100%)'
          }}
        />
      )}
      {/* Drag Handle / Header */}
      {!isPageCanvas && (
        <div 
          className="absolute top-0 left-0 right-0 flex justify-end items-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 z-20"
          onPointerDown={handlePointerDown}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', height: '12px', padding: '0 2px' }}
        >
          <button 
            onClick={(e) => { e.stopPropagation(); setIsSettingsOpen(!isSettingsOpen); }}
            className="text-black/50 hover:text-black/80 rounded flex items-center justify-center h-full w-3"
            title="Settings"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SettingsIcon size={8} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-black/50 hover:text-black/80 rounded flex items-center justify-center h-full w-3"
            title="Delete"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <X size={8} />
          </button>
        </div>
      )}
      
      {/* Settings Panel */}
      {isSettingsOpen && (
        <div 
          className="absolute top-0 left-full ml-2 bg-white border border-gray-200 shadow-xl rounded-md p-2 z-[9999] w-48 text-xs text-gray-800"
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onWheel={stopPropagation}
        >
          <div className="mb-2">
            <label className="block font-semibold mb-1">Color</label>
            <div className="flex gap-1 flex-wrap">
              {NOTE_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => onUpdate({ ...note, color: c })}
                  className={`w-4 h-4 rounded-full border ${note.color === c ? 'border-black' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          
          <div className="mb-2">
            <label className="block font-semibold mb-1">Size</label>
            <div className="flex items-center gap-2">
              <select 
                className="flex-1 border rounded p-1"
                value={`${Math.round(Math.min(note.width, note.height / (noteRef.current?.parentElement?.getBoundingClientRect().height ? noteRef.current.parentElement.getBoundingClientRect().width / noteRef.current.parentElement.getBoundingClientRect().height : 1)))}x${Math.round(Math.max(note.width, note.height / (noteRef.current?.parentElement?.getBoundingClientRect().height ? noteRef.current.parentElement.getBoundingClientRect().width / noteRef.current.parentElement.getBoundingClientRect().height : 1)))}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  
                  // Check if currently swapped
                  const isSwapped = note.width > (note.height / (noteRef.current!.parentElement!.getBoundingClientRect().width / noteRef.current!.parentElement!.getBoundingClientRect().height));
                  
                  const finalW = isSwapped ? h : w;
                  const finalH = isSwapped ? w : h;

                  const parentRect = noteRef.current!.parentElement!.getBoundingClientRect();
                  const actualHeightPct = finalW * (parentRect.width / parentRect.height) * (finalH / finalW);
                  onUpdate({ ...note, width: finalW, height: actualHeightPct });
                }}
              >
                {NOTE_PRESETS.map(p => (
                  <option key={`${p.w}x${p.h}`} value={`${p.w * 5}x${p.h * 5}`}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="mb-2">
            <label className="flex items-center gap-2 font-semibold cursor-pointer">
              <input 
                type="checkbox" 
                checked={note.width > (note.height / (noteRef.current?.parentElement?.getBoundingClientRect().height ? noteRef.current.parentElement.getBoundingClientRect().width / noteRef.current.parentElement.getBoundingClientRect().height : 1))}
                onChange={(e) => {
                  const isSwapped = e.target.checked;
                  
                  // Get the base dimensions (un-swapped)
                  const currentBaseW = Math.min(note.width, note.height / (noteRef.current!.parentElement!.getBoundingClientRect().width / noteRef.current!.parentElement!.getBoundingClientRect().height));
                  const currentBaseH = Math.max(note.width, note.height / (noteRef.current!.parentElement!.getBoundingClientRect().width / noteRef.current!.parentElement!.getBoundingClientRect().height));
                  
                  const finalW = isSwapped ? currentBaseH : currentBaseW;
                  const finalH = isSwapped ? currentBaseW : currentBaseH;
                  
                  const parentRect = noteRef.current!.parentElement!.getBoundingClientRect();
                  const actualHeightPct = finalW * (parentRect.width / parentRect.height) * (finalH / finalW);
                  onUpdate({ ...note, width: finalW, height: actualHeightPct });
                }}
                disabled={Math.abs(note.width - (note.height / (noteRef.current?.parentElement?.getBoundingClientRect().height ? noteRef.current.parentElement.getBoundingClientRect().width / noteRef.current.parentElement.getBoundingClientRect().height : 1))) < 0.1}
              />
              Swap Dimensions
            </label>
          </div>

          <div className="mb-2">
            <label className="block font-semibold mb-1">Font Size</label>
            <input 
              type="number" 
              className="w-full border rounded p-1"
              value={fontSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                setFontSize(newSize);
                onUpdate({ ...note, font_size: newSize });
              }}
              min="0.1" max="10" step="0.1"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">Font Family</label>
            <select 
              className="w-full border rounded p-1"
              value={fontFamily}
              onChange={(e) => {
                const newFamily = e.target.value;
                setFontFamily(newFamily);
                onUpdate({ ...note, font_family: newFamily });
              }}
            >
              <option value="sans-serif">Sans-serif</option>
              <option value="serif">Serif</option>
              <option value="monospace">Monospace</option>
              <option value="cursive">Cursive</option>
            </select>
          </div>
        </div>
      )}
      
      {/* Content Area */}
      {!isDrawMode && !isPageCanvas ? (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onBlur={handleContentBlur}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseMove={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="absolute inset-0 w-full h-full bg-transparent resize-none outline-none p-1 text-black custom-scrollbar-note z-10"
          style={{ 
            cursor: 'text',
            fontSize: `${fontSize}cqw`,
            fontFamily: fontFamily
          }}
        />
      ) : (
        <div className={`absolute inset-0 w-full h-full ${isPageCanvas ? 'z-0' : 'z-10'}`}>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
          <canvas
            ref={bufferCanvasRef}
            className={`absolute inset-0 w-full h-full touch-none ${isDrawMode ? 'cursor-crosshair pointer-events-auto' : 'pointer-events-none'}`}
            onPointerDown={handleDrawStart}
            onPointerMove={handleDrawMove}
            onPointerUp={handleDrawEnd}
            onPointerCancel={handleDrawEnd}
            onPointerOut={handleDrawEnd}
          />
        </div>
      )}
    </div>
  );
};

export default StickyNoteOverlay;