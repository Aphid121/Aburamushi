import React, { useRef, useEffect, useState, useMemo } from 'react';
import VirtualPage from './VirtualPage';
import PageOverlay from './PageOverlay';
import DictionaryPopup from './DictionaryPopup';
import StickyNoteOverlay, { type StickyNoteData } from './StickyNoteOverlay';

interface InfiniteHorizontalCanvasProps {
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
  isRTL?: boolean;
  spacing?: number;
  mangaId: string;
  stickyNotes: StickyNoteData[];
  onUpdateNote: (note: StickyNoteData) => void;
  onDeleteNote: (id: string) => void;
  isDrawMode?: boolean;
  isEraserMode?: boolean;
  isMaskMode?: boolean;
  strokes: any[];
  activeStroke: { pageIdx: number, points: number[][] } | null;
  activeNoteColor: string;
}

const InfiniteHorizontalCanvas: React.FC<InfiniteHorizontalCanvasProps> = ({
  pages, scale, isInverted, isDebugMode, isCtrlDown, isShiftDown, isRightMouseDown,
  wordStatuses, activePopups, handleWordClick, handleClosePopup, bringPopupToFront,
  getWordColorClass, onZoom, currentPage, onPageChange, onWordStatusChange, isRTL = false, spacing = 0,
  mangaId, stickyNotes, onUpdateNote, onDeleteNote, isDrawMode = false, isEraserMode = false, isMaskMode = false, strokes, activeStroke, activeNoteColor
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

  const pageLayouts = useMemo(() => {
    let currentX = 0;
    
    // If RTL, we process pages in reverse order for layout
    // Wait, if we reverse the pages, the first page (index 0) gets laid out last (furthest right).
    // But in RTL, we want the first page (index 0) to be on the RIGHT, and subsequent pages to go LEFT.
    // So we should NOT reverse the pages array. We should just lay them out normally, but make currentX go negative!
    // Or, we can just lay them out normally, but when we calculate the pan, we invert it?
    // Actually, if we just lay them out normally, but reverse the order we append them...
    // Let's just lay them out normally, but if RTL, we subtract width instead of adding.
    
    const layouts = pages.map((page, i) => {
      const width = viewport.h * ((page.width || 800) / (page.height || 1200));
      
      let left;
      if (isRTL) {
        // In RTL, currentX starts at 0 and goes negative.
        // The left edge of the image is currentX - width.
        left = currentX - width;
        currentX -= (width + spacing);
      } else {
        left = currentX;
        currentX += (width + spacing);
      }
      
      return { index: i, page, left, width, height: viewport.h };
    });
    
    return layouts;
  }, [pages, viewport.h, isRTL, spacing]);

  const isInternalChange = useRef(false);
  const prevPageRef = useRef(-1); // Initialize to -1 so it always pans on first mount
  const targetPanX = useRef<number | null>(null);

  useEffect(() => {
    if (!hasMeasured) return; // Wait until we have real dimensions
    if (prevPageRef.current === currentPage) return;
    prevPageRef.current = currentPage;

    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (!pageLayouts[currentPage]) return;
    
    const centerX = viewport.w / 2;
    const targetLocalCenterX = pageLayouts[currentPage].left + pageLayouts[currentPage].width / 2;
    const newPanX = -(targetLocalCenterX - centerX) * scale;
    
    targetPanX.current = newPanX;
    setPan(prev => ({
      x: newPanX,
      y: prev.y // Keep Y pan when changing pages horizontally!
    }));
  }, [currentPage, viewport.w, scale, pageLayouts, hasMeasured]);

  const visibleItems = useMemo(() => {
    const centerX = viewport.w / 2;
    const localLeft = (-centerX - pan.x) / scale + centerX;
    const localRight = (viewport.w - centerX - pan.x) / scale + centerX;

    return pageLayouts.filter(item => 
      item.left + item.width > localLeft - viewport.w * 2 && item.left < localRight + viewport.w * 2
    ).map(item => ({
      ...item,
      renderedWidth: item.width * scale
    }));
  }, [pageLayouts, pan.x, scale, viewport.w]);

  useEffect(() => {
    if (!hasMeasured) return;
    
    // Block scroll updates until the camera has finished panning to the target
    if (targetPanX.current !== null) {
      if (pan.x !== targetPanX.current) return;
      targetPanX.current = null;
    }

    const centerX = viewport.w / 2;
    const localCenterX = (-pan.x) / scale + centerX;
    
    let currentIndex = 0;
    for (let i = 0; i < pageLayouts.length; i++) {
      if (localCenterX >= pageLayouts[i].left && localCenterX <= pageLayouts[i].left + pageLayouts[i].width) {
        currentIndex = i;
        break;
      }
    }
    
    if (currentIndex !== currentPage) {
      isInternalChange.current = true;
      onPageChange(currentIndex);
    }
  }, [pan.x, scale, viewport.w, pageLayouts, currentPage, onPageChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDrawMode || isEraserMode || isMaskMode) {
      e.stopPropagation();
    }
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

      const rect = parentRef.current?.getBoundingClientRect();
      if (!rect) return;

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
      className={`w-full h-full overflow-hidden ${(isDrawMode || isEraserMode || isMaskMode) ? 'cursor-none' : 'cursor-crosshair'}`}
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
        {visibleItems.map((item) => (
            <div
              key={item.index}
              style={{
                position: 'absolute',
                top: '50%',
                left: item.left,
                transform: 'translateY(-50%)',
                width: `${item.width}px`,
                height: `${item.height}px`,
                marginLeft: spacing === 0 ? '-1px' : '0',
                zIndex: 0,
              }}
              className="flex items-center relative"
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
        ))}
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
        {visibleItems.map((item) => (
          <div
            key={`notes-${item.index}`}
            style={{
              position: 'absolute',
              top: '50%',
              left: item.left,
              transform: 'translateY(-50%)',
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
        ))}
        
        {/* 3. Dictionary Popups Hoisted to Canvas Root */}
        {activePopups.map((popup) => {
          const item = visibleItems.find(i => i.index === popup.anchor.imgIdx);
          if (!item) return null; // Don't render if page is not visible

          return (
            <div
              key={`popup-container-${popup.id}`}
              style={{
                position: 'absolute',
                top: '50%',
                left: item.left,
                transform: 'translateY(-50%)',
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

export default InfiniteHorizontalCanvas;
