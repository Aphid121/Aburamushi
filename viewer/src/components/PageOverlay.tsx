import React, { useEffect, useRef } from 'react';
import DictionaryPopup from './DictionaryPopup';
import StickyNoteOverlay, { type StickyNoteData } from './StickyNoteOverlay';

interface PageOverlayProps {
  pageData: any;
  pageIdx: number;
  imgW: number;
  imgH: number;
  scale: number;
  isDebugMode: boolean;
  isCtrlDown: boolean;
  isShiftDown: boolean;
  isRightMouseDown: boolean;
  wordStatuses: Record<string, string>;
  activePopups: any[];
  handleWordClick: (word: any, contextSentence: string, relX: number, relY: number, relW: number, relH: number, imgIdx: number, bubbleBox: any, direction: string, e: React.MouseEvent) => void;
  handleClosePopup: (word: any, imgIdx: number) => void;
  bringPopupToFront: (id: string) => void;
  getWordColorClass: (word: any) => string;
  mangaId: string;
  isDrawMode: boolean;
  strokes: any[];
  activeStroke: { pageIdx: number, points: number[][] } | null;
  activeNoteColor: string;
  isSpreadHalf?: 'left' | 'right';
}

const PageOverlay: React.FC<PageOverlayProps> = ({
  pageData,
  pageIdx,
  imgW,
  imgH,
  scale,
  isDebugMode,
  isCtrlDown,
  isShiftDown,
  isRightMouseDown,
  wordStatuses,
  activePopups,
  handleWordClick,
  handleClosePopup,
  bringPopupToFront,
  getWordColorClass,
  mangaId,
  isDrawMode,
  strokes,
  activeStroke,
  activeNoteColor,
  isSpreadHalf
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

    const pageStrokes = strokes.filter(s => s.page_idx === pageIdx && s.note_id === null);

    pageStrokes.forEach(stroke => {
      const points = JSON.parse(stroke.points);
      if (points.length === 0) return;

      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size * scale; // Scale the brush size
      ctx.globalAlpha = stroke.opacity;
      
      ctx.moveTo(points[0][0] * canvas.width, points[0][1] * canvas.height);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0] * canvas.width, points[i][1] * canvas.height);
      }
      ctx.stroke();
    });
  }, [strokes, pageIdx, scale]);

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

    if (activeStroke && activeStroke.pageIdx === pageIdx && activeStroke.points.length > 0) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = activeNoteColor;
      ctx.lineWidth = 2 * scale;
      ctx.globalAlpha = 1.0;

      ctx.beginPath();
      ctx.moveTo(activeStroke.points[0][0] * buffer.width, activeStroke.points[0][1] * buffer.height);
      for (let i = 1; i < activeStroke.points.length; i++) {
        ctx.lineTo(activeStroke.points[i][0] * buffer.width, activeStroke.points[i][1] * buffer.height);
      }
      ctx.stroke();
    }
  }, [activeStroke, pageIdx, scale, activeNoteColor]);

  if (!pageData) return null;

  return (
    <>
      {/* Word Bounding Boxes Overlay */}
      <div 
        className={`absolute inset-0 w-full h-full ${(isShiftDown || isCtrlDown || isRightMouseDown || isDebugMode) ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150 z-20 pointer-events-none`}
        style={{
          width: isSpreadHalf ? '200%' : '100%',
          transform: isSpreadHalf === 'left' ? 'translateX(-50%)' : 'none'
        }}
      >
        {pageData.bubbles?.map((bubble: any, bIdx: number) => {
          
          // Bubble Debug Box
          const bRelX = (bubble.box[0] / imgW) * 100;
          const bRelY = (bubble.box[1] / imgH) * 100;
          const bRelW = (bubble.box[2] / imgW) * 100;
          const bRelH = (bubble.box[3] / imgH) * 100;

          return (
            <React.Fragment key={`b-${bIdx}`}>
              {isDebugMode && (
                <div 
                  className="absolute border-2 border-red-500 pointer-events-none z-50"
                  style={{ left: `${bRelX}%`, top: `${bRelY}%`, width: `${bRelW}%`, height: `${bRelH}%` }}
                >
                  <span className="bg-red-500 text-white text-[8px] px-1 absolute -top-3 left-0">Bubble</span>
                </div>
              )}

              {bubble.lines?.map((line: any, lIdx: number) => {
                
                // Calculate Line (Column) Debug Box
                let lMinX = Infinity, lMinY = Infinity, lMaxX = 0, lMaxY = 0;
                if (isDebugMode && line.words) {
                  line.words.forEach((w: any) => {
                    if (w.characters) {
                      w.characters.forEach((c: any) => {
                        if(c.box && c.box[2] > 0) {
                          lMinX = Math.min(lMinX, c.box[0]);
                          lMinY = Math.min(lMinY, c.box[1]);
                          lMaxX = Math.max(lMaxX, c.box[0] + c.box[2]);
                          lMaxY = Math.max(lMaxY, c.box[1] + c.box[3]);
                        }
                      });
                    }
                  });
                }
                
                const lRelX = lMinX !== Infinity ? (lMinX / imgW) * 100 : 0;
                const lRelY = lMinY !== Infinity ? (lMinY / imgH) * 100 : 0;
                const lRelW = lMinX !== Infinity ? ((lMaxX - lMinX) / imgW) * 100 : 0;
                const lRelH = lMinY !== Infinity ? ((lMaxY - lMinY) / imgH) * 100 : 0;

                return (
                  <React.Fragment key={`l-${bIdx}-${lIdx}`}>
                    {isDebugMode && lMinX !== Infinity && (
                      <div 
                        className="absolute border-2 border-green-500 pointer-events-none z-40"
                        style={{ left: `${lRelX}%`, top: `${lRelY}%`, width: `${lRelW}%`, height: `${lRelH}%` }}
                      >
                        <span className="bg-green-500 text-white text-[8px] px-1 absolute -top-3 left-0">Line</span>
                      </div>
                    )}

                    {line.words?.map((word: any, wIdx: number) => {
                      if (!word.characters || word.characters.length === 0) return null;
                      
                      // Calculate word bounding box from its characters
                      let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
                      word.characters.forEach((c: any) => {
                        if(c.box && c.box[2] > 0) {
                          minX = Math.min(minX, c.box[0]);
                          minY = Math.min(minY, c.box[1]);
                          maxX = Math.max(maxX, c.box[0] + c.box[2]);
                          maxY = Math.max(maxY, c.box[1] + c.box[3]);
                        }
                      });

                      if (minX === Infinity) return null;

                      // Convert absolute pixel coordinates to percentages relative to the image
                      const relX = (minX / imgW) * 100;
                      const relY = (minY / imgH) * 100;
                      const relW = ((maxX - minX) / imgW) * 100;
                      const relH = ((maxY - minY) / imgH) * 100;

                      return (
                        <React.Fragment key={`w-${bIdx}-${lIdx}-${wIdx}`}>
                          {/* Word Box */}
                          {(!isCtrlDown || isDebugMode) && (
                            <div 
                              className={`absolute ${isDrawMode ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'} transition-colors
                                ${isDebugMode ? 'border-2 border-yellow-400 bg-yellow-400/20 z-30' : getWordColorClass(word)}
                              `}
                              style={{
                                left: `${relX}%`, 
                                top: `${relY}%`, 
                                width: `${relW}%`, 
                                height: `${relH}%`,
                              }}
                              title={word.text}
                                onPointerDown={(e) => {
                                  // Only trigger on left click
                                  if (e.button === 0) {
                                    handleWordClick(word, bubble.raw_text, relX, relY, relW, relH, pageIdx, { relX: bRelX, relY: bRelY, relW: bRelW, relH: bRelH }, bubble.direction, e);
                                  }
                                }}
                            ></div>
                          )}
                          
                          {/* Character Boxes (Only visible when Ctrl is held) */}
                          {isCtrlDown && !isDebugMode && word.characters?.map((char: any, cIdx: number) => {
                            if (!char.box || char.box[2] <= 0) return null;
                            
                            const cRelX = (char.box[0] / imgW) * 100;
                            const cRelY = (char.box[1] / imgH) * 100;
                            const cRelW = (char.box[2] / imgW) * 100;
                            const cRelH = (char.box[3] / imgH) * 100;
                            
                            return (
                              <div
                                key={`c-${bIdx}-${lIdx}-${wIdx}-${cIdx}`}
                                className={`absolute ${isDrawMode ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'} transition-colors ${getWordColorClass({ base_form: char.char })}`}
                                style={{
                                  left: `${cRelX}%`,
                                  top: `${cRelY}%`,
                                  width: `${cRelW}%`,
                                  height: `${cRelH}%`,
                                }}
                                title={char.char}
                                onPointerDown={(e) => {
                                  if (e.button === 0) {
                                    const charWord = {
                                      text: char.char,
                                      base_form: char.char,
                                      reading: '',
                                      part_of_speech: 'character'
                                    };
                                    handleWordClick(charWord, bubble.raw_text, cRelX, cRelY, cRelW, cRelH, pageIdx, { relX: bRelX, relY: bRelY, relW: bRelW, relH: bRelH }, bubble.direction, e);
                                  }
                                }}
                              />
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
};

export default PageOverlay;
