import React, { useRef, useEffect, useState, useMemo } from 'react';
import VirtualPage from './VirtualPage';
import PageOverlay from './PageOverlay';
import StickyNoteOverlay, { type StickyNoteData } from './StickyNoteOverlay';

interface ScrollerCanvasProps {
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
  currentPage: number;
  onPageChange: (pageIdx: number) => void;
  isDual?: boolean;
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
  brushSize: number;
  brushOpacity: number;
  brushHardness: number;
}

const ScrollerCanvas: React.FC<ScrollerCanvasProps> = ({
  pages, scale, isInverted, isDebugMode, isCtrlDown, isShiftDown, isRightMouseDown,
  wordStatuses, activePopups, handleWordClick, handleClosePopup, bringPopupToFront,
  getWordColorClass, currentPage, onPageChange, isDual = false, spacing = 0,
  mangaId, stickyNotes, onUpdateNote, onDeleteNote, isDrawMode = false, isEraserMode = false, isMaskMode = false,
  strokes, activeStroke, activeNoteColor, brushSize, brushOpacity, brushHardness
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(new Set([currentPage]));

  // Chunking: Use IntersectionObserver to track which pages are visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleIndices(prev => {
          const next = new Set(prev);
          entries.forEach(entry => {
            const idx = parseInt((entry.target as HTMLElement).dataset.pageIdx || '0', 10);
            if (entry.isIntersecting) {
              next.add(idx);
            } else {
              next.delete(idx);
            }
          });
          return next;
        });
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '1000px', // Load pages 1000px before they enter the viewport
        threshold: 0.1
      }
    );

    const elements = document.querySelectorAll('.scroller-page-container');
    elements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [pages.length, isDual]);

  // Sync currentPage based on scroll position
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const containerCenter = container.scrollTop + container.clientHeight / 2;
    
    const pageElements = container.querySelectorAll('.scroller-page-container');
    let closestIdx = currentPage;
    let minDistance = Infinity;

    pageElements.forEach(el => {
      const htmlEl = el as HTMLElement;
      const elCenter = htmlEl.offsetTop + htmlEl.clientHeight / 2;
      const distance = Math.abs(containerCenter - elCenter);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestIdx = parseInt(htmlEl.dataset.pageIdx || '0', 10);
      }
    });

    if (closestIdx !== currentPage) {
      onPageChange(closestIdx);
    }

    // Trigger a global event so the Drawing Canvas knows to redraw
    window.dispatchEvent(new CustomEvent('scroller-scroll'));
  };

  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const finalW = useMemo(() => {
    if (!pages || pages.length === 0) return 800;
    
    // 1. Find the smallest width (accounting for spreads)
    let minW = Infinity;
    pages.forEach(p => {
      const w = p.width || 800;
      const h = p.height || 1200;
      const isSpread = w > h;
      
      // If it's a spread, we treat its width as half for the purpose of finding the minimum page width
      // This ensures that a spread is treated as "two pages" wide
      if (isSpread) {
        const halfW = (w - spacing) / 2;
        if (halfW < minW) minW = halfW;
      } else {
        if (w < minW) minW = w;
      }
    });
    if (minW === Infinity) minW = 800;

    // 2. Find the tallest height IF all pages were scaled to their target widths
    let maxH = 0;
    pages.forEach(p => {
      const w = p.width || 800;
      const h = p.height || 1200;
      const isSpread = w > h;
      
      let scaledH;
      if (isSpread) {
        // A spread will take up two columns (minW * 2) plus the gap between them
        scaledH = h * ((minW * 2 + spacing) / w);
      } else {
        // A normal page takes up one column (minW)
        scaledH = h * (minW / w);
      }
      if (scaledH > maxH) maxH = scaledH;
    });

    // 3. Calculate the scale factor to fit the viewport
    const availableH = viewportSize.height - spacing;
    // In dual mode, the available width is the full viewport width.
    // In single mode, the available width is also the full viewport width.
    // We don't divide by 2 here because finalW represents the width of a SINGLE page,
    // and we want to make sure that even if there's a spread (which is 2 * finalW), it fits.
    // So we calculate the scale based on the maximum possible width a row could take.
    const maxRowWidth = isDual ? (minW * 2 + spacing) : minW;
    
    const scaleH = availableH / maxH;
    const scaleW = viewportSize.width / maxRowWidth;
    
    const finalScale = Math.min(scaleH, scaleW);
    
    return minW * finalScale;
  }, [pages, viewportSize, spacing, isDual]);

  const rows = useMemo(() => {
    const r = [];
    let i = 0;
    while (i < pages.length) {
      const p1 = pages[i];
      const w1 = p1.width || 800;
      const h1 = p1.height || 1200;
      // A page is a spread if its width is greater than its height
      const isSpread1 = w1 > h1;

      if (isSpread1) {
        // Spreads always get their own row, even in single mode
        r.push({ isSpread: true, pages: [{ ...p1, originalIndex: i }] });
        i += 1;
      } else {
        if (isDual && i + 1 < pages.length) {
          const p2 = pages[i + 1];
          const w2 = p2.width || 800;
          const h2 = p2.height || 1200;
          const isSpread2 = w2 > h2;
          if (!isSpread2) {
            // Two normal pages side-by-side
            r.push({ isSpread: false, pages: [{ ...p1, originalIndex: i }, { ...p2, originalIndex: i + 1 }] });
            i += 2;
          } else {
            // Next page is a spread, so this normal page gets its own row
            r.push({ isSpread: false, pages: [{ ...p1, originalIndex: i }] });
            i += 1;
          }
        } else {
          // Single mode, or last page in dual mode
          r.push({ isSpread: false, pages: [{ ...p1, originalIndex: i }] });
          i += 1;
        }
      }
    }
    return r;
  }, [pages, isDual]);

  // Initial scroll to current page
  useEffect(() => {
    const target = document.querySelector(`[data-page-idx="${currentPage}"]`);
    if (target) {
      target.scrollIntoView({ block: 'start' });
    }
  }, []);



  return (
    <div 
      ref={scrollContainerRef}
      className="w-full h-full overflow-y-auto custom-scrollbar bg-gray-950"
      onScroll={handleScroll}
    >
      <div className="flex flex-col items-center" style={{ gap: `${spacing}px`, padding: '0' }}>
        {rows.map((row, rowIdx) => (
          <div 
            key={`row-${rowIdx}`}
            className="flex justify-center items-center w-full"
            style={{ gap: `${spacing}px` }}
          >
            {row.pages.map((page) => {
              const pageIdx = page.originalIndex;
              const isVisible = visibleIndices.has(pageIdx);
              
              const pageW = page.width || 800;
              const pageH = page.height || 1200;
              
              const isSpread = row.isSpread;
              const targetW = isSpread ? (finalW * 2 + spacing) : finalW;
              const finalH = pageH * (targetW / pageW);

              return (
                <div 
                  key={pageIdx}
                  data-page-idx={pageIdx}
                  className="scroller-page-container relative shadow-2xl ring-1 ring-gray-800 bg-gray-900"
                  style={{ width: `${targetW}px`, height: 'auto' }}
                >
                  {isVisible ? (
                    <>
                      <VirtualPage 
                        pageIdx={pageIdx}
                        imageName={page.image}
                        width={targetW}
                        height={pageH}
                        isInverted={isInverted}
                      />
                      <PageOverlay
                        pageData={page}
                        pageIdx={pageIdx}
                        imgW={pageW}
                        imgH={pageH}
                        scale={targetW / pageW}
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
                      <div className="absolute inset-0 pointer-events-none">
                        <StickyNoteOverlay
                          notes={stickyNotes}
                          pageIdx={pageIdx}
                          scale={targetW / pageW}
                          onUpdateNote={onUpdateNote}
                          onDeleteNote={onDeleteNote}
                          isDraggingCanvas={false}
                          isDrawMode={isDrawMode || isMaskMode}
                        />
                      </div>
                    </>
                  ) : (
                    <div 
                      className="flex items-center justify-center text-gray-700 bg-gray-900"
                      style={{ width: `${targetW}px`, height: 'auto', aspectRatio: `${pageW} / ${pageH}` }}
                    >
                      Loading Page {pageIdx + 1}...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScrollerCanvas;
