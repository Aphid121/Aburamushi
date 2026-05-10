import React, { useRef, useEffect, useState, useMemo } from 'react';
import VirtualPage from './VirtualPage';
import PageOverlay from './PageOverlay';
import DictionaryPopup from './DictionaryPopup';
import StickyNoteOverlay, { type StickyNoteData } from './StickyNoteOverlay';

interface InfiniteVerticalCanvasProps {
  pages: any[];
  scale: number;
  isInverted: boolean;
  isDebugMode: boolean;
  isCtrlDown: boolean;
  isShiftDown: boolean;
  isRightMouseDown: boolean;
  wordStatuses: Record<string, string>;
  activePopups: any[];
  handleWordClick: any;
  handleClosePopup: any;
  bringPopupToFront: any;
  getWordColorClass: any;
  onZoom: (newScale: number) => void;
  currentPage: number;
  onPageChange: (pageIdx: number) => void;
  onWordStatusChange: (status: string, term: string) => void;
  isDual?: boolean;
  spacing?: number;
  mangaId: string;
  stickyNotes: StickyNoteData[];
  onUpdateNote: (note: StickyNoteData) => void;
  onDeleteNote: (id: string) => void;
  isDrawMode?: boolean;
  strokes: any[];
  activeStroke: { pageIdx: number, points: number[][] } | null;
  activeNoteColor: string;
}

const InfiniteVerticalCanvas: React.FC<InfiniteVerticalCanvasProps> = ({
  pages, scale, isInverted, isDebugMode, isCtrlDown, isShiftDown, isRightMouseDown,
  wordStatuses, activePopups, handleWordClick, handleClosePopup, bringPopupToFront,
  getWordColorClass, onZoom, currentPage, onPageChange, onWordStatusChange, isDual = false, spacing = 0,
  mangaId, stickyNotes, onUpdateNote, onDeleteNote, isDrawMode = false, strokes, activeStroke, activeNoteColor
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ w: 800, h: 1000 });
  const [hasMeasured, setHasMeasured] = useState(false);

  useEffect(() => {
    if (parentRef.current) {
      setViewport({ w: parentRef.current.clientWidth, h: parentRef.current.clientHeight });
      setHasMeasured(true);
    }
    const handleResize = () => {
      if (parentRef.current) {
        setViewport({ w: parentRef.current.clientWidth, h: parentRef.current.clientHeight });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const rowLayouts = useMemo(() => {
    const rows = [];
    let currentY = 0;
    let i = 0;
    while (i < pages.length) {
      const page1 = pages[i];
      const isSpread1 = (page1.width || 800) > (page1.height || 1200);
      
      if (!isDual || isSpread1) {
        rows.push({
          top: currentY,
          height: viewport.h,
          pages: [{ index: i, page: page1, isRightSide: false, isSpread: true }] // Treat as spread so it centers
        });
        i += 1;
      } else {
        const page2 = i + 1 < pages.length ? pages[i + 1] : null;
        const isSpread2 = page2 ? (page2.width || 800) > (page2.height || 1200) : false;
        
        if (page2 && !isSpread2) {
          rows.push({
            top: currentY,
            height: viewport.h,
            pages: [
              { index: i, page: page1, isRightSide: true, isSpread: false },
              { index: i + 1, page: page2, isRightSide: false, isSpread: false }
            ]
          });
          i += 2;
        } else {
          rows.push({
            top: currentY,
            height: viewport.h,
            pages: [{ index: i, page: page1, isRightSide: true, isSpread: false }]
          });
          i += 1;
        }
      }
      currentY += viewport.h + spacing;
    }
    return rows;
  }, [pages, viewport.h, isDual, spacing]);

  const isInternalChange = useRef(false);
  const prevPageRef = useRef(-1); // Initialize to -1 so it always pans on first mount
  const targetPanY = useRef<number | null>(null);

  useEffect(() => {
    if (!hasMeasured) return; // Wait until we have real dimensions
    if (prevPageRef.current === currentPage) return;
    prevPageRef.current = currentPage;

    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    
    const centerY = viewport.h / 2;
    const row = rowLayouts.find(r => r.pages.some(p => p.index === currentPage));
    if (!row) return;
    
    const targetLocalCenterY = row.top + viewport.h / 2;
    const newPanY = -(targetLocalCenterY - centerY) * scale;
    
    targetPanY.current = newPanY;
    setPan(prev => ({
      x: prev.x, // Keep X pan when changing pages vertically!
      y: newPanY
    }));
  }, [currentPage, viewport.h, scale, rowLayouts, hasMeasured]);

  const visibleItems = useMemo(() => {
    const centerY = viewport.h / 2;
    const localTop = (-centerY - pan.y) / scale + centerY;
    const localBottom = (viewport.h - centerY - pan.y) / scale + centerY;

    const items = [];
    for (const row of rowLayouts) {
      if (row.top + row.height > localTop - viewport.h * 2 && row.top < localBottom + viewport.h * 2) {
        for (const p of row.pages) {
          const aspectRatio = (p.page.width || 800) / (p.page.height || 1200);
          const renderedWidth = viewport.h * aspectRatio * scale;
          items.push({
            ...p,
            top: row.top,
            height: row.height,
            width: viewport.h * aspectRatio,
            renderedWidth
          });
        }
      }
    }
    return items;
  }, [rowLayouts, pan.y, scale, viewport.h]);

  useEffect(() => {
    if (!hasMeasured) return;
    
    // Block scroll updates until the camera has finished panning to the target
    if (targetPanY.current !== null) {
      if (pan.y !== targetPanY.current) return;
      targetPanY.current = null;
    }

    const centerY = viewport.h / 2;
    const localCenterY = (-pan.y) / scale + centerY;
    
    let currentRow = rowLayouts.find(r => localCenterY >= r.top && localCenterY < r.top + r.height);
    if (!currentRow && rowLayouts.length > 0) {
       if (localCenterY < 0) currentRow = rowLayouts[0];
       else currentRow = rowLayouts[rowLayouts.length - 1];
    }
    
    if (currentRow) {
      const currentIndex = currentRow.pages[0].index;
      if (currentIndex !== currentPage) {
        isInternalChange.current = true;
        onPageChange(currentIndex);
      }
    }
  }, [pan.y, scale, viewport.h, rowLayouts, currentPage, onPageChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type !== 'sticky_note') return;

      // Find which page we dropped on
      const rect = parentRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Find the row and page by checking the DOM elements directly
      let targetItem = null;
      let imgElement = null;
      
      for (const item of visibleItems) {
        const el = document.getElementById(`manga-img-${item.index}`);
        if (el) {
          const imgRect = el.getBoundingClientRect();
          if (e.clientX >= imgRect.left && e.clientX <= imgRect.right &&
              e.clientY >= imgRect.top && e.clientY <= imgRect.bottom) {
            targetItem = item;
            imgElement = el;
            break;
          }
        }
      }

      // Fallback: If we didn't drop directly on an image, use the "active" page
      if (!targetItem) {
        const activePageIdx = currentPage;
        targetItem = { index: activePageIdx };
        imgElement = document.getElementById(`manga-img-${activePageIdx}`);
      }

      if (targetItem && imgElement) {
        const imgRect = imgElement.getBoundingClientRect();
        
        const mouseXRel = e.clientX - imgRect.left;
        const mouseYRel = e.clientY - imgRect.top;
        
        const localPctX = (mouseXRel / imgRect.width) * 100;
        const localPctY = (mouseYRel / imgRect.height) * 100;
        
        const actualHeightPct = data.preset.w * (imgRect.width / imgRect.height) * (data.preset.h / data.preset.w);
        
        const finalPctX = localPctX - (data.preset.w / 2);
        const finalPctY = localPctY - (actualHeightPct / 2);

        const newNote: StickyNoteData = {
          id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          manga_id: mangaId,
          page_idx: targetItem.index,
          local_x: finalPctX, // No longer clamping
          local_y: finalPctY, // No longer clamping
          width: data.preset.w,
          height: actualHeightPct,
          color: data.color,
          content: ''
        };

        onUpdateNote(newNote);
      }
    } catch (err) {
      console.error("Drop failed", err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  useEffect(() => {
    const handleWheelEvent = (e: WheelEvent) => {
      if (parentRef.current && parentRef.current.contains(e.target as Node)) {
        e.preventDefault();
        
        const isZoomingIn = e.deltaY < 0;
        const zoomLevels = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000];
        
        const currentPercent = Math.round(scale * 100);
        let newPercent = currentPercent;
        
        if (isZoomingIn) {
          const nextLevel = zoomLevels.find(level => level > currentPercent);
          newPercent = nextLevel || zoomLevels[zoomLevels.length - 1];
        } else {
          const prevLevel = [...zoomLevels].reverse().find(level => level < currentPercent);
          newPercent = prevLevel || zoomLevels[0];
        }
        
        const newScale = newPercent / 100;
        if (newScale === scale) return;

        const rect = parentRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        const canvasX = (mouseX - pan.x - centerX) / scale;
        const canvasY = (mouseY - pan.y - centerY) / scale;
        
        const newPanX = mouseX - (canvasX * newScale) - centerX;
        const newPanY = mouseY - (canvasY * newScale) - centerY;
        
        setPan({ x: newPanX, y: newPanY });
        onZoom(newScale);
      }
    };
    
    window.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => window.removeEventListener('wheel', handleWheelEvent);
  }, [scale, pan, onZoom]);

  return (
    <div 
      ref={parentRef}
      className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Base Layer (Images) */}
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: 'center',
          zIndex: 10
        }}
      >
        {/* 1. Manga Pages & Overlays */}
        {visibleItems.map((item) => {
          let transform = 'translateX(-50%)';
          if (isDual && !item.isSpread) {
            transform = item.isRightSide ? 'translateX(0%)' : 'translateX(-100%)';
          }

          return (
            <div
              key={item.index}
              style={{
                position: 'absolute',
                top: item.top,
                left: '50%',
                transform,
                width: `${item.width}px`,
                height: `${item.height}px`,
                marginTop: spacing === 0 ? '-1px' : '0',
                zIndex: 0,
              }}
              className="flex justify-center relative"
            >
              <VirtualPage 
                pageIdx={item.index}
                imageName={
                  (item.renderedWidth < 400) ? (item.page.image_small || item.page.image) : 
                  (item.renderedWidth < 1000) ? (item.page.image_medium || item.page.image) : 
                  item.page.image
                }
                width={item.page.width || 800}
                height={item.page.height || 1200}
                isInverted={isInverted}
              />
              <PageOverlay
                pageData={item.page}
                pageIdx={item.index}
                imgW={item.page.width || 800}
                imgH={item.page.height || 1200}
                scale={scale}
                isDebugMode={isDebugMode}
                isCtrlDown={isCtrlDown}
                isShiftDown={isShiftDown}
                isRightMouseDown={isRightMouseDown}
                wordStatuses={wordStatuses}
                activePopups={activePopups}
                handleWordClick={handleWordClick}
                handleClosePopup={handleClosePopup}
                bringPopupToFront={bringPopupToFront}
                getWordColorClass={getWordColorClass}
                mangaId={mangaId}
                isDrawMode={isDrawMode}
                strokes={strokes}
                activeStroke={activeStroke}
                activeNoteColor={activeNoteColor}
              />
            </div>
          );
        })}
      </div>

      {/* Overlay Layer (Sticky Notes & Popups) */}
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: 'center',
          zIndex: 30,
          pointerEvents: 'none'
        }}
      >
        {/* 2. Sticky Notes Layer (Hoisted to Canvas Root) */}
        {visibleItems.map((item) => {
          let transform = 'translateX(-50%)';
          if (isDual && !item.isSpread) {
            transform = item.isRightSide ? 'translateX(0%)' : 'translateX(-100%)';
          }

          return (
            <div
              key={`notes-${item.index}`}
              style={{
                position: 'absolute',
                top: item.top,
                left: '50%',
                transform,
                width: `${item.width}px`,
                height: `${item.height}px`,
                zIndex: 50, // Higher than GlobalDrawingCanvas (z-40)
                pointerEvents: 'none'
              }}
            >
              <div style={{ pointerEvents: 'auto', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
                <StickyNoteOverlay
                  notes={stickyNotes}
                  pageIdx={item.index}
                  scale={scale}
                  onUpdateNote={onUpdateNote}
                  onDeleteNote={onDeleteNote}
                  isDraggingCanvas={isDragging}
                  isDrawMode={isDrawMode}
                />
              </div>
            </div>
          );
        })}
        
        {/* 3. Dictionary Popups Hoisted to Canvas Root */}
        {activePopups.map((popup) => {
          const item = visibleItems.find(i => i.index === popup.anchor.imgIdx);
          if (!item) return null; // Don't render if page is not visible

          let transform = 'translateX(-50%)';
          if (isDual && !item.isSpread) {
            transform = item.isRightSide ? 'translateX(0%)' : 'translateX(-100%)';
          }

          return (
            <div
              key={`popup-container-${popup.id}`}
              style={{
                position: 'absolute',
                top: item.top,
                left: '50%',
                transform,
                width: `${item.width}px`,
                height: `${item.height}px`,
                zIndex: 100,
                pointerEvents: 'none'
              }}
            >
              <DictionaryPopup
                key={popup.id}
                word={popup.word}
                contextSentence={popup.contextSentence}
                anchor={popup.anchor}
                scale={scale}
                zIndex={popup.zIndex}
                isNonJapanese={popup.isNonJapanese}
                onClose={() => handleClosePopup(popup.word, popup.anchor.imgIdx)}
                onStatusChange={onWordStatusChange}
                onMouseEnter={() => bringPopupToFront(popup.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InfiniteVerticalCanvas;
