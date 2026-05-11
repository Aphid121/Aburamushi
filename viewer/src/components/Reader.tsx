import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Maximize, Minimize, BookOpen, Contrast, XSquare, Search as SearchIcon, X, Settings as SettingsIcon, MessageSquare, ZoomIn, ZoomOut, LayoutGrid, LayoutTemplate, Columns, ArrowLeftRight, ArrowDownUp, SplitSquareHorizontal, StickyNote as StickyNoteIcon, PlusSquare, MinusSquare, Bug, PenTool, Eraser } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import PageOverlay from './PageOverlay';
import ScrollerCanvas from './ScrollerCanvas';
import DrawingSidebar from './DrawingSidebar';
import StickyNoteSidebar, { NOTE_COLORS } from './StickyNoteSidebar';
import StickyNoteOverlay, { type StickyNoteData } from './StickyNoteOverlay';
import GlobalDrawingCanvas from './GlobalDrawingCanvas';

interface ReaderProps {
  mangaId: string;
}

interface DisplayImage {
  url: string;
  isSpread: boolean;
  w: number;
  h: number;
  pageIdx: number;
}

import ErrorBoundary from './ErrorBoundary';

const Reader: React.FC<ReaderProps> = ({ mangaId }) => {
  const [mangaData, setMangaData] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [displayImages, setDisplayImages] = useState<DisplayImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Settings State
  const [pageSpacing, setPageSpacing] = useState(0);

  const [cursorPos, setCursorPos] = useState<{x: number, y: number} | null>(null);

  // Analysis Mode State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(384); // Default 96 * 4 = 384px
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isNotesSidebarOpen, setIsNotesSidebarOpen] = useState(false);
  const [activeNoteColor, setActiveNoteColor] = useState(NOTE_COLORS[0]);
  const [stickyNotes, setStickyNotes] = useState<StickyNoteData[]>([]);
  const [isDrawingSidebarOpen, setIsDrawingSidebarOpen] = useState(false);
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [isEraserMode, setIsEraserMode] = useState(false);
  const [isMaskMode, setIsMaskMode] = useState(false);
  const [activeBrushColor, setActiveBrushColor] = useState('#ff0000');
  const [brushSize, setBrushSize] = useState(5);
  const [brushOpacity, setBrushOpacity] = useState(1.0);
  const [brushHardness, setBrushHardness] = useState(1.0);
  const [strokes, setStrokes] = useState<any[]>([]);
  const [activeStroke, setActiveStroke] = useState<{ pageIdx: number, points: number[][] } | null>(null);
  const [isDrawingBox, setIsDrawingBox] = useState(false);
  const [isAddingBbox, setIsAddingBbox] = useState(false);
  const [isRemovingBbox, setIsRemovingBbox] = useState(false);
  const [manualBboxPrompt, setManualBboxPrompt] = useState<{x: number, y: number, w: number, h: number, imgX: number, imgY: number, imgW: number, imgH: number} | null>(null);
  const [manualBboxText, setManualBboxText] = useState("");
  const manualBboxInputRef = useRef<HTMLInputElement>(null);
  const [attachedTexts, setAttachedTexts] = useState<string[]>([]);
  const [analysisStart, setAnalysisStart] = useState<{ x: number, y: number } | null>(null);
  const [analysisCurrent, setAnalysisCurrent] = useState<{ x: number, y: number } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisChatHistory, setAnalysisChatHistory] = useState<{role: string, content: string}[]>([]);
  const [analysisInput, setAnalysisInput] = useState("");
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // We need to track the cursor position globally so it works in infinite modes too
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isDrawMode || isEraserMode || isMaskMode) {
        setCursorPos({ x: e.clientX, y: e.clientY });
      } else {
        setCursorPos(null);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, [isDrawMode, isEraserMode, isMaskMode]);

  useEffect(() => {
    const loadSettings = async () => {
      if ((window as any).electronAPI) {
        const settings = await (window as any).electronAPI.getSettings();
        if (settings['scroller_page_spacing']) {
          setPageSpacing(parseInt(settings['scroller_page_spacing'], 10));
        }
      }
    };
    loadSettings();
  }, []);

  const [viewMode, setViewMode] = useState<'single' | 'dual' | 'scroller' | 'scroller_dual'>('single');

  const toggleViewMode = () => {
    setViewMode(prev => {
      if (prev === 'single') return 'dual';
      if (prev === 'dual') return 'scroller';
      if (prev === 'scroller') return 'scroller_dual';
      return 'single';
    });
  };
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isInverted, setIsInverted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Zoom & Pan State
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const [zoomToast, setZoomToast] = useState<number | null>(null);
  const toastTimeoutRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Modifiers & Debug
  const [isShiftDown, setIsShiftDown] = useState(false);
  const [isCtrlDown, setIsCtrlDown] = useState(false);
  const [isRightMouseDown, setIsRightMouseDown] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
      chatInputRef.current.style.height = `${Math.min(chatInputRef.current.scrollHeight, 120)}px`; // Max ~5 lines
    }
  }, [analysisInput]);

  // Sidebar Resizing Logic
  useEffect(() => {
    const handleMouseMoveResize = (e: MouseEvent) => {
      if (!isResizingSidebar) return;
      // Calculate the new sidebar width based on the mouse position relative to the right screen edge.
      const newWidth = window.innerWidth - e.clientX;
      // Enforce sidebar width constraints between 300px and 800px.
      setSidebarWidth(Math.max(300, Math.min(800, newWidth)));
    };

    const handleMouseUpResize = () => {
      setIsResizingSidebar(false);
    };

    if (isResizingSidebar) {
      window.addEventListener('mousemove', handleMouseMoveResize);
      window.addEventListener('mouseup', handleMouseUpResize);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMoveResize);
      window.removeEventListener('mouseup', handleMouseUpResize);
    };
  }, [isResizingSidebar]);
  
  // Chat Management State
  const [chats, setChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isChatListOpen, setIsChatListOpen] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatTitle, setEditingChatTitle] = useState("");

  // Popup State
  const [wordStatuses, setWordStatuses] = useState<Record<string, string>>({});

  // We store an array of active popups instead of just one
  const [activePopups, setActivePopups] = useState<Array<{
    id: string;
    word: any;
    contextSentence: string;
    anchor: { relX: number, relY: number, relW: number, relH: number, imgIdx: number, bubbleBox: { relX: number, relY: number, relW: number, relH: number }, direction?: string };
    zIndex?: number;
    isNonJapanese?: boolean;
  }>>([]);

  // --- Data Loading ---

  useEffect(() => {
    const loadManga = async (isUpdate = false) => {
      if (!isUpdate) {
        setIsLoading(true);
      }
      setError(null);
      if ((window as any).electronAPI) {
        const result = await (window as any).electronAPI.loadManga(mangaId);
        if (result.success) {
          setMangaData(result.data);
          
          if (!isUpdate) {
            setCurrentPage(result.lastReadPage || 0);
            
            // Load sticky notes
            const notesRes = await (window as any).electronAPI.getStickyNotes(mangaId);
            if (notesRes) {
              setStickyNotes(notesRes);
            }
            
            // Load strokes
            const strokesRes = await (window as any).electronAPI.getStrokes(mangaId);
            if (strokesRes) {
              setStrokes(strokesRes);
            }
            
            // Load chats for this manga
            const loadedChats = await (window as any).electronAPI.getMangaChats(mangaId);
            setChats(loadedChats);
            if (loadedChats.length > 0) {
              loadChat(loadedChats[0].id);
            } else {
              createNewChat();
            }
          }
        } else {
          setError(result.error);
        }
      }
    };
    loadManga();

    // Listen for progress updates to reload data if it's still processing
    const handleProgress = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail.id === mangaId) {
        // Reload manga data to get new pages, but pass true to indicate it's a background update
        loadManga(true);
      }
    };
    
    window.addEventListener('manga-progress', handleProgress);
    return () => window.removeEventListener('manga-progress', handleProgress);
  }, [mangaId]);

  const loadChat = async (chatId: string) => {
    setActiveChatId(chatId);
    const messages = await (window as any).electronAPI.getChatMessages(chatId);
    setAnalysisChatHistory(messages.map((m: any) => ({ role: m.role, content: m.content })));
    setIsChatListOpen(false);
  };

  const createNewChat = async () => {
    const newChat = await (window as any).electronAPI.createMangaChat(mangaId, "New Chat");
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setAnalysisChatHistory([]);
    setIsChatListOpen(false);
  };

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await (window as any).electronAPI.deleteMangaChat(chatId);
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (activeChatId === chatId) {
      setAnalysisChatHistory([]);
      setActiveChatId(null);
    }
  };

  const saveChatTitle = async (chatId: string) => {
    if (!editingChatTitle.trim()) return;
    await (window as any).electronAPI.updateMangaChat(chatId, editingChatTitle.trim());
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: editingChatTitle.trim() } : c));
    setEditingChatId(null);
  };

  const fetchWordStatuses = useCallback(async (data: any, pageIdx: number) => {
    if (!(window as any).electronAPI) return;
    
    const page = data.pages[pageIdx];
    if (!page) return;

    const termsToFetch = new Set<string>();
    page.bubbles?.forEach((b: any) => {
      b.lines?.forEach((l: any) => {
        l.words?.forEach((w: any) => {
          termsToFetch.add(w.base_form);
        });
      });
    });

    if (termsToFetch.size > 0) {
      const statuses = await (window as any).electronAPI.getWordStatuses(Array.from(termsToFetch));
      setWordStatuses(prev => ({ ...prev, ...statuses }));
    }
  }, []);

  useEffect(() => {
    if (mangaData) {
      fetchWordStatuses(mangaData, currentPage);
      if ((viewMode === 'dual') && currentPage + 1 < mangaData.pages.length) {
        fetchWordStatuses(mangaData, currentPage + 1);
      }
    }
  }, [mangaData, currentPage, (viewMode === 'dual'), fetchWordStatuses]);

  const getImageDimensions = (url: string): Promise<{w: number, h: number}> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = url;
    });
  };

  useEffect(() => {
    let isMounted = true;
    let objectUrls: string[] = [];

    const loadImages = async () => {
      if (!mangaData || !mangaData.pages[currentPage]) return;
      
      // If we are in infinite mode, we don't need to load displayImages
      if (viewMode.startsWith('infinite')) {
        if (isMounted) {
          setIsLoading(false);
          setDisplayImages([]);
        }
        return;
      }

      setIsLoading(true);

      try {
        const img1Name = mangaData.pages[currentPage].image;
        const res1 = await (window as any).electronAPI.getMangaImage(img1Name);
        if (!res1.success) throw new Error(res1.error);

        const url1 = URL.createObjectURL(new Blob([res1.buffer]));
        objectUrls.push(url1);
        const dim1 = await getImageDimensions(url1);
        const isSpread1 = dim1.w > dim1.h;

        let loadedImages: DisplayImage[] = [{ 
          url: url1, 
          isSpread: isSpread1, 
          w: dim1.w, 
          h: dim1.h, 
          pageIdx: currentPage 
        }];

        if ((viewMode === 'dual') && !isSpread1 && currentPage + 1 < mangaData.pages.length) {
          const img2Name = mangaData.pages[currentPage + 1].image;
          const res2 = await (window as any).electronAPI.getMangaImage(img2Name);
          if (res2.success) {
            const url2 = URL.createObjectURL(new Blob([res2.buffer]));
            objectUrls.push(url2);
            const dim2 = await getImageDimensions(url2);
            const isSpread2 = dim2.w > dim2.h;

            if (!isSpread2) {
              loadedImages.push({ 
                url: url2, 
                isSpread: false, 
                w: dim2.w, 
                h: dim2.h, 
                pageIdx: currentPage + 1 
              });
            }
          }
        }

        if (isMounted) {
          setDisplayImages(loadedImages);
          (window as any).electronAPI.updateLastRead(mangaId, currentPage);
          setScale(1);
          setPan({ x: 0, y: 0 });
        }
      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadImages();

    return () => {
      isMounted = false;
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [mangaData, currentPage, mangaId, viewMode]);

  // --- Navigation ---

  const advancePage = useCallback((forward: boolean) => {
    if (!mangaData) return;
    
    let step = 1;
    if (viewMode === 'dual') {
      step = 2;
    } else if (viewMode === 'scroller_vertical_dual') {
      const page1 = mangaData.pages[currentPage];
      const isSpread1 = (page1.width || 800) > (page1.height || 1200);
      if (!isSpread1 && currentPage + 1 < mangaData.pages.length) {
        const page2 = mangaData.pages[currentPage + 1];
        const isSpread2 = (page2.width || 800) > (page2.height || 1200);
        if (!isSpread2) {
          step = 2;
        }
      }
    }

    if (forward) {
      setCurrentPage(p => Math.min(mangaData.pages.length - 1, p + step));
    } else {
      const backStep = viewMode === 'dual' ? 2 : 1;
      setCurrentPage(p => Math.max(0, p - backStep));
    }
  }, [mangaData, currentPage, viewMode]);

  // --- Interactions ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!mangaData) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Shift') setIsShiftDown(true);
      if (e.key === 'Control') setIsCtrlDown(true);

      // Debug Mode Toggle (Ctrl + Shift + D)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsDebugMode(prev => !prev);
        return;
      }

      // Add Bbox Toggle (Ctrl + Shift + A)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setIsAddingBbox(prev => {
          if (!prev) { setIsDrawingBox(false); setIsRemovingBbox(false); }
          return !prev;
        });
        return;
      }

      // Remove Bbox Toggle (Ctrl + Shift + X)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        setIsRemovingBbox(prev => {
          if (!prev) { setIsDrawingBox(false); setIsAddingBbox(false); }
          return !prev;
        });
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'arrowright':
        case 'd':
          advancePage(true);
          break;
        case 'arrowleft':
        case 'a':
          advancePage(false);
          break;
        case ' ':
          e.preventDefault();
          advancePage(true);
          break;
        case 'i':
          setIsInverted(prev => !prev);
          break;
        case 's':
          setViewMode(prev => prev === 'dual' ? 'single' : 'dual');
          break;
        case 'x':
          setActivePopups([]);
          break;
        case '/':
        case '?':
          setIsSidebarOpen(prev => !prev);
          if (isSidebarOpen) {
            setIsDrawingBox(false);
            setAnalysisStart(null);
            setAnalysisCurrent(null);
          }
          break;
        case 'f':
          if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().catch(err => console.error(err));
          } else {
            document.exitFullscreen().catch(err => console.error(err));
          }
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftDown(false);
      if (e.key === 'Control') setIsCtrlDown(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [mangaData, advancePage]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleWheelEvent = (e: WheelEvent) => {
      // Only handle wheel events if we are hovering over the reader container
      if (viewMode.startsWith('scroller')) return;
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        // We removed the isDrawMode check here so you can zoom while drawing!
        e.preventDefault();
        
        const isZoomingIn = e.deltaY < 0;
        
        // Get mouse position relative to the container
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Standard zoom levels (in percentages)
        const zoomLevels = [
          1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000
        ];
        
        setScale(prevScale => {
          const currentPercent = Math.round(prevScale * 100);
          let newPercent;
          
          if (isZoomingIn) {
            const nextLevel = zoomLevels.find(level => level > currentPercent);
            newPercent = nextLevel || zoomLevels[zoomLevels.length - 1];
          } else {
            // Find the largest level that is strictly less than the current percent
            const prevLevel = [...zoomLevels].reverse().find(level => level < currentPercent);
            newPercent = prevLevel || zoomLevels[0];
          }
          
          const newScale = newPercent / 100;
          
          setZoomToast(newPercent);
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          toastTimeoutRef.current = setTimeout(() => setZoomToast(null), 1500);

          return newScale;
        });

        // Calculate new pan to zoom into the cursor
        setPan(prevPan => {
          // We need the current scale to calculate the ratio
          const currentScale = scale;
          
          // Calculate what the new scale will be (duplicating logic to avoid state race conditions)
          const currentPercent = Math.round(currentScale * 100);
          let newPercent;
          if (isZoomingIn) {
            const nextLevel = zoomLevels.find(level => level > currentPercent);
            newPercent = nextLevel || zoomLevels[zoomLevels.length - 1];
          } else {
            const prevLevel = [...zoomLevels].reverse().find(level => level < currentPercent);
            newPercent = prevLevel || zoomLevels[0];
          }
          const newScale = newPercent / 100;

          // The transform origin is 'center' (rect.width/2, rect.height/2)
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;
          
          // The ratio of the new scale to the old scale
          const ratio = newScale / currentScale;
          
          // We want the point under the mouse to stay under the mouse.
          // ScreenPos = Center + (ImagePos - Center) * Scale + Pan
          // Solving for new Pan gives:
          return {
            x: mouseX - centerX - (mouseX - centerX - prevPan.x) * ratio,
            y: mouseY - centerY - (mouseY - centerY - prevPan.y) * ratio
          };
        });
      }
    };
    
    window.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => window.removeEventListener('wheel', handleWheelEvent);
  }, [scale, viewMode, isDrawMode]);

  const handleEraser = async (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate mouse position relative to the container in screen pixels
    const mousePixelX = e.clientX - rect.left;
    const mousePixelY = e.clientY - rect.top;
    
    // The eraser radius in screen pixels
    const eraserPixelRadius = (brushSize * scale) / 2;
    
    const strokesToDelete: string[] = [];
    
    // We need to check ALL strokes, not just the ones on a specific page,
    // because the user might have drawn outside the page bounds!
    
    const rectCache = new Map();
    
    for (const stroke of strokes) {
      if (stroke.note_id !== null) continue; // Skip sticky note strokes for now
      
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
      
      if (!imgRect) continue;
      
      // Calculate the offset of the image relative to the container
      const offsetX = imgRect.left - rect.left;
      const offsetY = imgRect.top - rect.top;

      const points = JSON.parse(stroke.points);
      
      // Calculate the visual radius of the stroke in screen pixels
      let visualStrokeRadius = (stroke.size * scale) / 2;
      if (stroke.hardness !== undefined && stroke.hardness < 1.0) {
         const maxBlur = (stroke.size * scale) * 0.5;
         const blurAmount = (1.0 - stroke.hardness) * maxBlur;
         const minCoreSize = (stroke.size * scale) * 0.5;
         const coreSize = (stroke.size * scale) * stroke.hardness;
         const actualCoreSize = Math.max(minCoreSize, coreSize);
         // The visual radius is the core radius plus the blur spread
         visualStrokeRadius = (actualCoreSize / 2) + blurAmount;
      }
      
      const effectivePixelRadius = eraserPixelRadius + visualStrokeRadius;

      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        
        // Convert normalized point back to screen pixels relative to the container
        const pointPixelX = offsetX + (point[0] * imgRect.width);
        const pointPixelY = offsetY + (point[1] * imgRect.height);
        
        const dx = pointPixelX - mousePixelX;
        const dy = pointPixelY - mousePixelY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < effectivePixelRadius) {
          strokesToDelete.push(stroke.id);
          break; // Found a hit, no need to check other points in this stroke
        }
      }
    }
    
    if (strokesToDelete.length > 0) {
      setStrokes(prev => prev.filter(s => !strokesToDelete.includes(s.id)));

      if ((window as any).electronAPI) {
        for (const id of strokesToDelete) {
          await (window as any).electronAPI.deleteStroke(id);
        }
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault();
      setIsRightMouseDown(true);
      return;
    }
    if (e.button !== 0 && e.button !== 1) return;
    
    if (isEraserMode && e.button === 0) {
      handleEraser(e);
      return;
    }
    
    if ((isDrawMode || isMaskMode) && e.button === 0) {
      // Find which page we clicked on (or the closest one if we clicked outside)
      let targetPageIdx = -1;
      let imgElement = null;
      
      if (viewMode.startsWith('scroller')) {
        let minDistance = Infinity;
        const images = document.querySelectorAll('img[id^="manga-img-"]');
        for (const img of Array.from(images)) {
          const rect = img.getBoundingClientRect();
          
          // Check if we clicked directly inside the image
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            targetPageIdx = parseInt(img.id.replace('manga-img-', ''), 10);
            imgElement = img;
            break;
          }
          
          // Otherwise, calculate distance to the center of the image
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
          
          if (dist < minDistance) {
            minDistance = dist;
            targetPageIdx = parseInt(img.id.replace('manga-img-', ''), 10);
            imgElement = img;
          }
        }
      } else {
        // Check all visible images
        const images = document.querySelectorAll('img[id^="manga-img-"]');
        for (const img of Array.from(images)) {
          const rect = img.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            targetPageIdx = parseInt(img.id.replace('manga-img-', ''), 10);
            imgElement = img;
            break;
          }
        }
      }

      if (targetPageIdx !== -1 && imgElement) {
        const rect = imgElement.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        setActiveStroke({ pageIdx: targetPageIdx, points: [[x, y]] });
        return; // Don't trigger panning
      }
      return; // Stop panning even if we didn't click on an image
    }

    if ((isDrawingBox || isAddingBbox || isRemovingBbox) && e.button === 0) {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setAnalysisStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        setAnalysisCurrent({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
      return;
    }

    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isEraserMode && e.buttons === 1) {
      handleEraser(e);
      return;
    }
    if ((isDrawMode || isMaskMode) && activeStroke) {
      const imgElement = document.getElementById(`manga-img-${activeStroke.pageIdx}`);
      if (imgElement) {
        const rect = imgElement.getBoundingClientRect();
        // Allow drawing outside the image bounds by not clamping the coordinates
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        setActiveStroke(prev => prev ? { ...prev, points: [...prev.points, [x, y]] } : null);
      }
      return;
    }

    if ((isDrawingBox || isAddingBbox || isRemovingBbox) && analysisStart) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setAnalysisCurrent({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
      return;
    }

    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    if (e.button === 2) {
      setIsRightMouseDown(false);
      return;
    }

    if (isDrawMode && activeStroke) {
      if (activeStroke.points.length > 1) {
        const newStroke = {
          id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          manga_id: mangaId,
          page_idx: activeStroke.pageIdx,
          note_id: null,
          brush_type: 'pen',
          color: activeBrushColor,
          size: brushSize,
          opacity: brushOpacity,
          hardness: brushHardness,
          points: JSON.stringify(activeStroke.points)
        };
        setStrokes(prev => [...prev, newStroke]);
        if ((window as any).electronAPI) {
          await (window as any).electronAPI.saveStroke(newStroke);
        }
      }
      setActiveStroke(null);
      return;
    }

    if (isMaskMode && activeStroke) {
      if (activeStroke.points.length > 1) {
        const newStroke = {
          id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          manga_id: mangaId,
          page_idx: activeStroke.pageIdx,
          note_id: null,
          brush_type: 'mask',
          color: '#000000', // Color doesn't matter for mask
          size: brushSize,
          opacity: brushOpacity,
          hardness: brushHardness,
          points: JSON.stringify(activeStroke.points)
        };
        setStrokes(prev => [...prev, newStroke]);
        if ((window as any).electronAPI) {
          await (window as any).electronAPI.saveStroke(newStroke);
        }
      }
      setActiveStroke(null);
      return;
    }

    if ((isDrawingBox || isAddingBbox || isRemovingBbox) && analysisStart && analysisCurrent) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      const x = Math.min(analysisStart.x, endX);
      const y = Math.min(analysisStart.y, endY);
      const w = Math.abs(endX - analysisStart.x);
      const h = Math.abs(endY - analysisStart.y);

      setAnalysisStart(null);
      setAnalysisCurrent(null);

      if (w > 10 && h > 10 && displayImages.length > 0) {
        try {
          const imgElement = document.getElementById(`manga-img-0`) as HTMLImageElement;
          if (!imgElement) throw new Error("Image element not found");
          
          const imgRect = imgElement.getBoundingClientRect();
          const scaleX = imgElement.naturalWidth / imgRect.width;
          const scaleY = imgElement.naturalHeight / imgRect.height;
          
          const imgX = (x + rect.left - imgRect.left) * scaleX;
          const imgY = (y + rect.top - imgRect.top) * scaleY;
          const imgW = w * scaleX;
          const imgH = h * scaleY;

          if (isDrawingBox) {
            setIsDrawingBox(false);
            let extractedText = "";
            const pageData = mangaData.pages[displayImages[0].pageIdx];
            if (pageData && pageData.bubbles) {
              const charsInBox: string[] = [];
              pageData.bubbles.forEach((bubble: any) => {
                bubble.lines?.forEach((line: any) => {
                  line.words?.forEach((word: any) => {
                    word.characters?.forEach((char: any) => {
                      if (char.box && char.box[2] > 0) {
                        const cx = char.box[0] + char.box[2]/2;
                        const cy = char.box[1] + char.box[3]/2;
                        if (cx >= imgX && cx <= imgX + imgW && cy >= imgY && cy <= imgY + imgH) {
                          charsInBox.push(char.char);
                        }
                      }
                    });
                  });
                });
              });
              extractedText = charsInBox.join('');
            }

            if (extractedText) {
              setAttachedTexts(prev => [...prev, extractedText]);
            }
          } else if (isAddingBbox) {
            setIsAddingBbox(false);
            setManualBboxPrompt({ x, y, w, h, imgX, imgY, imgW, imgH });
            setTimeout(() => manualBboxInputRef.current?.focus(), 50);
          } else if (isRemovingBbox) {
            setIsRemovingBbox(false);
            const newMangaData = JSON.parse(JSON.stringify(mangaData));
            const pageData = newMangaData.pages[displayImages[0].pageIdx];
            
            if (pageData && pageData.bubbles) {
              let removedAny = false;
              
              // Filter out bubbles that intersect with the drawn box
              pageData.bubbles = pageData.bubbles.filter((bubble: any) => {
                if (!bubble.box) return true;
                const [bx, by, bw, bh] = bubble.box;
                
                // Check for intersection
                const intersects = !(
                  bx > imgX + imgW || 
                  bx + bw < imgX || 
                  by > imgY + imgH || 
                  by + bh < imgY
                );
                
                if (intersects) removedAny = true;
                return !intersects;
              });
              
              if (removedAny) {
                setMangaData(newMangaData);
                if ((window as any).electronAPI) {
                  await (window as any).electronAPI.saveMangaData(mangaId, newMangaData);
                }
              }
            }
          }
        } catch (err: any) {
          console.error(err);
        }
      } else {
        // If box was too small, just cancel the mode
        setIsDrawingBox(false);
        setIsAddingBbox(false);
        setIsRemovingBbox(false);
      }
      return;
    }

    setIsDragging(false);
  };

  const handleManualBboxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBboxPrompt || !manualBboxText.trim()) {
      setManualBboxPrompt(null);
      setManualBboxText("");
      return;
    }

    const { imgX, imgY, imgW, imgH } = manualBboxPrompt;
    const text = manualBboxText.trim();
    
    const newMangaData = JSON.parse(JSON.stringify(mangaData));
    const pageData = newMangaData.pages[displayImages[0].pageIdx];
    
    if (!pageData.bubbles) pageData.bubbles = [];
    
    // Create a simple bubble structure for the manual box
    pageData.bubbles.push({
      box: [Math.round(imgX), Math.round(imgY), Math.round(imgW), Math.round(imgH)],
      raw_text: text,
      lines: [{
        words: [{
          text: text,
          base_form: text,
          reading: text,
          part_of_speech: "Manual",
          characters: text.split('').map((char: string, idx: number) => ({
            char: char,
            box: [
              Math.round(imgX + (imgW / text.length) * idx),
              Math.round(imgY),
              Math.round(imgW / text.length),
              Math.round(imgH)
            ]
          }))
        }]
      }]
    });
    
    setMangaData(newMangaData);
    if ((window as any).electronAPI) {
      await (window as any).electronAPI.saveMangaData(mangaId, newMangaData);
    }

    setManualBboxPrompt(null);
    setManualBboxText("");
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default right-click menu
  };

  const handleClosePopup = (wordToClose: any, imgIdx: number) => {
    setActivePopups(prev => prev.filter(p => !(p.word.base_form === wordToClose.base_form && p.anchor.imgIdx === imgIdx)));
  };

  const bringPopupToFront = (id: string) => {
    setActivePopups(prev => {
      const popup = prev.find(p => p.id === id);
      if (!popup) return prev;
      
      const currentMaxZ = Math.max(0, ...prev.map(x => x.zIndex || 0));
      
      // If it's already the highest, do nothing
      if ((popup.zIndex || 0) === currentMaxZ && currentMaxZ > 0) return prev;
      
      return prev.map(p => ({
        ...p,
        zIndex: p.id === id ? currentMaxZ + 1 : (p.zIndex || 0)
      }));
    });
  };

  const handleAnalysisChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!analysisInput.trim() && attachedTexts.length === 0) return;

    let userMessage = analysisInput.trim();
    if (attachedTexts.length > 0) {
      userMessage = "Attached Text:\n" + attachedTexts.map(t => `"${t}"`).join("\n") + (userMessage ? "\n\n" + userMessage : "");
    }

    setAnalysisInput("");
    setAttachedTexts([]);
    
    // Ensure we have an active chat
    let currentChatId = activeChatId;
    if (!currentChatId) {
      const newChat = await (window as any).electronAPI.createMangaChat(mangaId, "New Chat");
      setChats(prev => [newChat, ...prev]);
      currentChatId = newChat.id;
      setActiveChatId(currentChatId);
    }
    
    // Save user message to DB
    await (window as any).electronAPI.addChatMessage(currentChatId, 'user', userMessage);
    
    // Add user message to UI
    const newHistory = [...analysisChatHistory, { role: 'user', content: userMessage }];
    setAnalysisChatHistory(newHistory);
    setIsAnalyzing(true);

    try {
      let messagesToSend = [...newHistory];
      if (newHistory.length === 1) {
        const settings = await (window as any).electronAPI.getSettings();
        const systemPrompt = settings['llm_system_prompt'] || 'You are a helpful Japanese translation teacher.';
        
        messagesToSend = [
          { role: 'system', content: systemPrompt },
          ...newHistory
        ];
      }

      const result = await (window as any).electronAPI.chatWithLLM(messagesToSend, {
        mangaId: mangaId,
        pageIdx: currentPage
      });
      
      if (result.success) {
        await (window as any).electronAPI.addChatMessage(currentChatId, 'assistant', result.reply);
        setAnalysisChatHistory(prev => [...prev, { role: 'assistant', content: result.reply }]);
        
        // Auto-name chat if it's the first message
        if (newHistory.length === 1) {
          const title = userMessage.length > 30 ? userMessage.substring(0, 30) + "..." : userMessage;
          await (window as any).electronAPI.updateMangaChat(currentChatId, title);
          setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, title } : c));
        }
      } else {
        setAnalysisChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${result.error}` }]);
      }
    } catch (err: any) {
      console.error(err);
      setAnalysisChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleWordClick = (word: any, contextSentence: string, relX: number, relY: number, relW: number, relH: number, imgIdx: number, bubbleBox: any, direction: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Check if this exact word is already open
    const isAlreadyOpen = activePopups.some(p => p.word.base_form === word.base_form && p.anchor.imgIdx === imgIdx);
    
    if (isAlreadyOpen) {
      // Toggle off if clicking the exact same word
      handleClosePopup(word, imgIdx);
    } else {
      // Add to active popups
      const newId = `popup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Auto-detect non-Japanese/punctuation
      const isJapaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\u3005]/;
      const isAutoNonJapanese = !isJapaneseRegex.test(word.base_form);
      
      const isNonJapanese = wordStatuses[word.base_form] === 'non_japanese' || isAutoNonJapanese;
      
      setActivePopups(prev => [...prev, {
        id: newId,
        word,
        contextSentence,
        anchor: { relX, relY, relW, relH, imgIdx, bubbleBox, direction },
        isNonJapanese
      }]);
    }
  };

  const handleDragStartNote = (e: React.DragEvent, preset: { w: number, h: number }, color: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'sticky_note', preset, color }));
    e.dataTransfer.effectAllowed = 'copy';

    // We need to know the current scale and the target image width to create an accurate drag preview.
    // Since we don't know exactly which image it will be dropped on yet, we'll use the first visible image as an approximation.
    let targetImgW = 800; // Fallback
    if (viewMode === 'single' || viewMode === 'dual') {
      if (displayImages.length > 0) {
        const el = document.getElementById(`manga-img-0`);
        if (el) targetImgW = el.getBoundingClientRect().width;
      }
    } else {
      // For scroller modes, we can try to find the first visible page element
      const firstImg = document.querySelector('img[id^="manga-img-"]') as HTMLImageElement;
      if (firstImg) {
        targetImgW = firstImg.getBoundingClientRect().width;
      }
    }

    // The preset width is a percentage of the image width.
    // We calculate the pixel width based on the rendered image width (which already includes scale).
    const pixelW = (preset.w / 100) * targetImgW;
    const pixelH = (preset.h / 100) * targetImgW;

    const dragIcon = document.createElement('div');
    dragIcon.style.width = `${pixelW}px`;
    dragIcon.style.height = `${pixelH}px`;
    dragIcon.style.backgroundColor = color;
    dragIcon.style.backgroundImage = 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(0,0,0,0.1) 100%)';
    dragIcon.style.position = 'absolute';
    dragIcon.style.top = '-10000px';
    document.body.appendChild(dragIcon);
    
    // Center the drag image on the cursor
    e.dataTransfer.setDragImage(dragIcon, pixelW / 2, pixelH / 2);
    
    // Clean up the element after drag starts
    setTimeout(() => document.body.removeChild(dragIcon), 0);
  };

  const handleUpdateNote = async (updatedNote: StickyNoteData) => {
    setStickyNotes(prev => {
      const exists = prev.find(n => n.id === updatedNote.id);
      return exists ? prev.map(n => n.id === updatedNote.id ? updatedNote : n) : [...prev, updatedNote];
    });
    if ((window as any).electronAPI) {
      await (window as any).electronAPI.saveStickyNote(updatedNote);
    }
  };

  const handleDeleteNote = async (id: string) => {
    setStickyNotes(prev => prev.filter(n => n.id !== id));
    if ((window as any).electronAPI) {
      await (window as any).electronAPI.deleteStickyNote(id);
    }
  };

  const getWordColorClass = (word: any) => {
    const status = wordStatuses[word.base_form];
    if (status === 'learning') return 'bg-red-500/30 border-red-500/50 hover:bg-red-400/50 hover:border-red-400';
    if (status === 'known') return 'bg-green-500/30 border-green-500/50 hover:bg-green-400/50 hover:border-green-400';
    if (status === 'seen') return 'bg-cyan-500/30 border-cyan-500/50 hover:bg-cyan-400/50 hover:border-cyan-400';
    if (status === 'banned') return 'bg-yellow-500/30 border-yellow-500/50 hover:bg-yellow-400/50 hover:border-yellow-400';
    if (status === 'non_japanese') return 'bg-gray-500/30 border-gray-500/50 hover:bg-gray-400/50 hover:border-gray-400';
    
    // Auto-detect non-Japanese/punctuation for new words
    const isJapaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\u3005]/;
    if (!isJapaneseRegex.test(word.base_form)) {
      return 'bg-gray-500/30 border-gray-500/50 hover:bg-gray-400/50 hover:border-gray-400';
    }
    
    return 'bg-pink-500/30 border-pink-500/50 hover:bg-pink-400/50 hover:border-pink-400'; // New/Unknown
  };


  const handleZoom = useCallback((newScale: number) => {
    setScale(newScale);
    setZoomToast(Math.round(newScale * 100));
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setZoomToast(null), 1500);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type !== 'sticky_note') return;

      // Find which image we dropped on
      let targetImg = null;
      let targetIdx = -1;
      let imgElement = null;

      if (viewMode === 'single') {
        targetImg = displayImages[0];
        targetIdx = 0;
        imgElement = document.getElementById(`manga-img-0`);
      } else if (viewMode === 'dual') {
        for (let i = 0; i < displayImages.length; i++) {
          const el = document.getElementById(`manga-img-${i}`);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
              targetImg = displayImages[i];
              targetIdx = i;
              imgElement = el;
              break;
            }
          }
        }
      }

      // Fallback: If we didn't drop directly on an image, use the "active" page
      if (!targetImg) {
        if (viewMode === 'single' || viewMode === 'dual') {
          targetImg = displayImages[0];
          imgElement = document.getElementById(`manga-img-0`);
        } else {
          // For scroller modes, use currentPage
          const activePageIdx = currentPage;
          targetImg = { pageIdx: activePageIdx };
          imgElement = document.getElementById(`manga-img-${activePageIdx}`);
        }
      }

      if (targetImg && imgElement) {
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
          page_idx: targetImg.pageIdx,
          local_x: finalPctX, // No longer clamping to 0-100
          local_y: finalPctY, // No longer clamping to 0-100
          width: data.preset.w,
          height: actualHeightPct,
          color: data.color,
          content: ''
        };

        handleUpdateNote(newNote);
      }
    } catch (err) {
      console.error("Drop failed", err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  // --- Render ---

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <p>Error loading manga: {error}</p>
      </div>
    );
  }

  if (!mangaData) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="flex flex-col h-full bg-gray-950 relative overflow-hidden select-none"
    >
      {/* Custom Cursor */}
      {(isDrawMode || isEraserMode || isMaskMode) && cursorPos && (
        <div 
          className="fixed pointer-events-none z-[9999] rounded-full mix-blend-difference"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            width: brushSize * (viewMode.startsWith('scroller') ? 1 : scale),
            height: brushSize * (viewMode.startsWith('scroller') ? 1 : scale),
            transform: 'translate(-50%, -50%)',
            border: `1px ${isEraserMode ? 'dashed' : 'solid'} white`,
            backgroundColor: isMaskMode ? 'rgba(255, 255, 255, 0.2)' : 'transparent'
          }}
        />
      )}

      {/* Top Left Controls */}
      <div className="absolute top-4 left-4 z-50 flex gap-3">
        <button
          onClick={() => {
            setIsNotesSidebarOpen(prev => {
              const next = !prev;
              if (next) {
                setIsDrawingSidebarOpen(false);
                setIsDrawMode(false);
                setIsEraserMode(false);
              }
              return next;
            });
          }}
          className={`p-3 rounded-xl shadow-lg transition-all ${isNotesSidebarOpen ? 'bg-yellow-500 text-gray-900' : 'bg-gray-900/80 text-gray-300 hover:text-white hover:bg-gray-800 backdrop-blur-sm border border-gray-700/50'}`}
          title="Sticky Notes"
        >
          <StickyNoteIcon className="w-6 h-6" />
        </button>
        <button
          onClick={() => {
            setIsDrawingSidebarOpen(prev => {
              const next = !prev;
              if (!next) {
                setIsDrawMode(false);
                setIsEraserMode(false);
              }
              return next;
            });
            setIsNotesSidebarOpen(false);
          }}
          className={`p-3 rounded-xl shadow-lg transition-all ${isDrawingSidebarOpen ? 'bg-blue-500 text-white' : 'bg-gray-900/80 text-gray-300 hover:text-white hover:bg-gray-800 backdrop-blur-sm border border-gray-700/50'}`}
          title="Drawing Tools"
        >
          <PenTool className="w-6 h-6" />
        </button>
      </div>

      {/* Notes Sidebar */}
      <div 
        className={`absolute top-0 left-0 h-full z-40 transition-transform duration-300 ${isNotesSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ paddingTop: '72px' }} // Offset for the button
      >
        <StickyNoteSidebar
          activeColor={activeNoteColor}
          onColorChange={setActiveNoteColor}
          onDragStart={handleDragStartNote}
        />
      </div>

      {/* Drawing Sidebar */}
      <div 
        className={`absolute top-0 left-0 h-full z-40 transition-transform duration-300 ${isDrawingSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ paddingTop: '72px' }} // Offset for the button
      >
        <DrawingSidebar
          isDrawMode={isDrawMode}
          setIsDrawMode={setIsDrawMode}
          isEraserMode={isEraserMode}
          setIsEraserMode={setIsEraserMode}
          isMaskMode={isMaskMode}
          setIsMaskMode={setIsMaskMode}
          activeColor={activeBrushColor}
          setActiveColor={setActiveBrushColor}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          brushOpacity={brushOpacity}
          setBrushOpacity={setBrushOpacity}
          brushHardness={brushHardness}
          setBrushHardness={setBrushHardness}
        />
      </div>

      {/* Main Image Area */}
      <div 
        ref={containerRef}
        className={`flex-1 relative overflow-hidden bg-gray-950 select-none z-0 ${(isDrawMode || isEraserMode || isMaskMode) ? 'cursor-none' : 'cursor-crosshair'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {isLoading && !viewMode.startsWith('scroller') ? (
          <div className="absolute inset-0 flex items-center justify-center z-50">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : null}
        
        {viewMode.startsWith('scroller') ? (
          <ErrorBoundary>
              <ScrollerCanvas
                pages={mangaData.pages}
                scale={scale}
                isInverted={isInverted}
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
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                isDual={viewMode === 'scroller_dual'}
                spacing={pageSpacing}
                mangaId={mangaId}
                stickyNotes={stickyNotes}
                onUpdateNote={handleUpdateNote}
                onDeleteNote={handleDeleteNote}
                isDrawMode={isDrawMode}
                isEraserMode={isEraserMode}
                isMaskMode={isMaskMode}
                strokes={strokes}
                activeStroke={activeStroke}
                activeNoteColor={activeNoteColor}
                brushSize={brushSize}
                brushOpacity={brushOpacity}
                brushHardness={brushHardness}
              />
          </ErrorBoundary>
        ) : viewMode === 'single' || viewMode === 'dual' ? (
          displayImages.length > 0 ? (
            <>
              {/* Base Layer (Images) */}
              <div 
                className="absolute inset-0 w-full h-full flex items-center justify-center"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                  transformOrigin: 'center',
                  zIndex: 10
                }}
              >
                <div 
                  className={`flex ${viewMode === 'dual' ? 'flex-row-reverse' : 'flex-row'} items-center justify-center`}
                  style={{ gap: `${pageSpacing}px` }}
                >
                  {displayImages.map((img, idx) => (
                    <div 
                      key={idx} 
                      className="relative inline-block"
                      style={{
                        marginLeft: viewMode === 'dual' && pageSpacing === 0 && idx > 0 ? '-1px' : '0'
                      }}
                    >
                      <img 
                        id={`manga-img-${idx}`}
                        src={img.url} 
                        alt={`Page ${img.pageIdx + 1}`} 
                        className={`max-w-full h-auto object-contain shadow-2xl ring-1 ring-gray-800 transition-[filter] duration-300 ${isInverted ? 'invert hue-rotate-180' : ''}`}
                        style={{ maxHeight: isFullscreen ? '100vh' : 'calc(100vh - 60px)' }}
                        draggable={false}
                      />
                      
                      <PageOverlay
                        pageData={mangaData.pages[img.pageIdx]}
                        pageIdx={img.pageIdx}
                        imgW={img.w}
                        imgH={img.h}
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
              </div>

              {/* Overlay Layer (Sticky Notes & Popups) */}
              <div 
                className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                  transformOrigin: 'center',
                  zIndex: 30
                }}
              >
                <div 
                  className={`flex ${viewMode === 'dual' ? 'flex-row-reverse' : 'flex-row'} items-center justify-center`}
                  style={{ gap: `${pageSpacing}px` }}
                >
                  {displayImages.map((img, idx) => (
                    <div 
                      key={`overlay-${idx}`} 
                      className="relative inline-block"
                      style={{
                        marginLeft: viewMode === 'dual' && pageSpacing === 0 && idx > 0 ? '-1px' : '0'
                      }}
                    >
                      {/* Invisible image to force exact same layout and sizing as the base layer */}
                      <img 
                        src={img.url} 
                        alt=""
                        className="max-w-full h-auto object-contain opacity-0 pointer-events-none"
                        style={{ maxHeight: isFullscreen ? '100vh' : 'calc(100vh - 60px)' }}
                        draggable={false}
                      />

                      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                        <div style={{ pointerEvents: 'auto', width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
                          <StickyNoteOverlay
                            notes={stickyNotes}
                            pageIdx={img.pageIdx}
                            scale={scale}
                            onUpdateNote={handleUpdateNote}
                            onDeleteNote={handleDeleteNote}
                            isDraggingCanvas={isDragging}
                            isDrawMode={isDrawMode || isMaskMode}
                          />
                        </div>
                      </div>
                      
                      {/* Dictionary Popups */}
                      <div className="absolute inset-0 w-full h-full pointer-events-none z-[100]">
                        {activePopups.filter(p => p.anchor.imgIdx === img.pageIdx).map((popup) => (
                          <DictionaryPopup
                            key={popup.id}
                            word={popup.word}
                            contextSentence={popup.contextSentence}
                            anchor={popup.anchor}
                            scale={scale}
                            zIndex={popup.zIndex}
                            isNonJapanese={popup.isNonJapanese}
                            onClose={() => handleClosePopup(popup.word, img.pageIdx)}
                            onStatusChange={(status, term) => {
                              setWordStatuses(prev => ({ ...prev, [term]: status }));
                            }}
                            onMouseEnter={() => bringPopupToFront(popup.id)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null
        ) : null}

        <GlobalDrawingCanvas
          isDrawMode={isDrawMode}
          isMaskMode={isMaskMode}
          scale={scale}
          pan={pan}
          strokes={strokes}
          activeStroke={activeStroke}
          activeNoteColor={activeBrushColor}
          displayImages={displayImages}
          brushSize={brushSize}
          brushOpacity={brushOpacity}
          brushHardness={brushHardness}
        />
      </div>

      {/* Zoom Toast */}
      {zoomToast !== null && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm font-medium pointer-events-none z-50 transition-opacity duration-200">
          {zoomToast}%
        </div>
      )}

      {/* Selection Box */}
      {(isDrawingBox || isAddingBbox || isRemovingBbox) && analysisStart && analysisCurrent && (
        <div 
          className={`absolute border-2 ${isAddingBbox ? 'border-green-500 bg-green-500/20' : isRemovingBbox ? 'border-red-500 bg-red-500/20' : 'border-blue-500 bg-blue-500/20'} pointer-events-none z-50`}
          style={{
            left: Math.min(analysisStart.x, analysisCurrent.x),
            top: Math.min(analysisStart.y, analysisCurrent.y),
            width: Math.abs(analysisCurrent.x - analysisStart.x),
            height: Math.abs(analysisCurrent.y - analysisStart.y)
          }}
        />
      )}

      {/* Drawing Mode Indicator */}
      {isDrawingBox && (
        <div className="absolute inset-0 z-40 pointer-events-none">
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg font-medium animate-pulse">
            Draw a box around text to attach it
          </div>
        </div>
      )}

      {/* Adding Bbox Indicator */}
      {isAddingBbox && (
        <div className="absolute inset-0 z-40 pointer-events-none">
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg font-medium animate-pulse">
            Draw a box to add a manual bounding box
          </div>
        </div>
      )}

      {/* Removing Bbox Indicator */}
      {isRemovingBbox && (
        <div className="absolute inset-0 z-40 pointer-events-none">
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-full shadow-lg font-medium animate-pulse">
            Draw a box to remove intersecting bounding boxes
          </div>
        </div>
      )}

        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 z-50 flex gap-2">
          <button
            onClick={() => setIsAddingBbox(prev => {
              if (!prev) { setIsDrawingBox(false); setIsRemovingBbox(false); }
              return !prev;
            })}
            className={`p-2 rounded-xl shadow-lg transition-all ${isAddingBbox ? 'bg-green-500 text-white' : 'bg-gray-900/80 text-gray-300 hover:text-white hover:bg-gray-800 backdrop-blur-sm border border-gray-700/50'}`}
            title="Add Bounding Box (Ctrl+Shift+A)"
          >
            <PlusSquare className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsRemovingBbox(prev => {
              if (!prev) { setIsDrawingBox(false); setIsAddingBbox(false); }
              return !prev;
            })}
            className={`p-2 rounded-xl shadow-lg transition-all ${isRemovingBbox ? 'bg-red-500 text-white' : 'bg-gray-900/80 text-gray-300 hover:text-white hover:bg-gray-800 backdrop-blur-sm border border-gray-700/50'}`}
            title="Remove Bounding Box (Ctrl+Shift+X)"
          >
            <MinusSquare className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsDebugMode(prev => !prev)}
            className={`p-2 rounded-xl shadow-lg transition-all ${isDebugMode ? 'bg-purple-500 text-white' : 'bg-gray-900/80 text-gray-300 hover:text-white hover:bg-gray-800 backdrop-blur-sm border border-gray-700/50'}`}
            title="Toggle Debug Mode (Ctrl+Shift+D)"
          >
            <Bug className="w-5 h-5" />
          </button>
        </div>

      {/* Manual Bbox Prompt */}
      {manualBboxPrompt && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl w-96">
            <h3 className="text-lg font-bold text-white mb-4">Add Manual Bounding Box</h3>
            <form onSubmit={handleManualBboxSubmit}>
              <input
                ref={manualBboxInputRef}
                type="text"
                value={manualBboxText}
                onChange={(e) => setManualBboxText(e.target.value)}
                placeholder="Enter text for this box..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setManualBboxPrompt(null); setManualBboxText(""); }}
                  className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Analysis Result Chat Box */}
      <div 
        className={`absolute top-0 right-0 h-full bg-gray-900 border-l border-gray-700 shadow-2xl z-50 flex flex-col transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: `${sidebarWidth}px` }}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Resizer Handle */}
        <div 
          className="absolute top-0 left-0 w-2 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-50"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingSidebar(true);
          }}
        />

        <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex justify-between items-center relative">
          <button 
            onClick={() => setIsChatListOpen(!isChatListOpen)}
            className="font-bold text-blue-400 flex items-center gap-2 hover:text-blue-300 transition-colors"
          >
            <SearchIcon className="w-4 h-4" />
            {chats.find(c => c.id === activeChatId)?.title || "AI Assistant"}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${isChatListOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <button 
            onClick={() => {
              setIsSidebarOpen(false);
              setIsDrawingBox(false);
              setIsChatListOpen(false);
            }}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          {/* Chat List Dropdown */}
          {isChatListOpen && (
            <div className="absolute top-full left-0 w-full bg-gray-800 border-b border-gray-700 shadow-xl z-50 max-h-64 overflow-y-auto custom-scrollbar">
              <div className="p-2">
                <button 
                  onClick={createNewChat}
                  className="w-full text-left px-3 py-2 text-sm text-blue-400 hover:bg-gray-700 rounded-lg flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  New Chat
                </button>
              </div>
              <div className="border-t border-gray-700">
                {chats.map(chat => (
                  <div 
                    key={chat.id} 
                    className={`group flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-700 ${activeChatId === chat.id ? 'bg-gray-700/50' : ''}`}
                    onClick={() => loadChat(chat.id)}
                  >
                    {editingChatId === chat.id ? (
                      <input 
                        type="text" 
                        value={editingChatTitle}
                        onChange={(e) => setEditingChatTitle(e.target.value)}
                        onBlur={() => saveChatTitle(chat.id)}
                        onKeyDown={(e) => e.key === 'Enter' && saveChatTitle(chat.id)}
                        autoFocus
                        className="bg-gray-900 text-white text-sm px-2 py-1 rounded border border-blue-500 w-full mr-2"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="text-sm text-gray-300 truncate flex-1">{chat.title}</span>
                    )}
                    
                    {editingChatId !== chat.id && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditingChatId(chat.id); setEditingChatTitle(chat.title); }}
                          className="p-1 text-gray-400 hover:text-white"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button 
                          onClick={(e) => deleteChat(chat.id, e)}
                          className="p-1 text-gray-400 hover:text-red-400"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 overflow-y-auto custom-scrollbar space-y-4 flex-1" onClick={() => setIsChatListOpen(false)}>
          {analysisChatHistory.length === 0 && (
            <div className="text-center text-gray-500 mt-10">
              <p>How can I help you with this manga?</p>
              <p className="text-sm mt-2">Use the + button below to attach text from the page.</p>
            </div>
          )}
          
          <div className="space-y-3">
            {analysisChatHistory.map((msg, idx) => (
              <div key={idx} className={`p-3 rounded-xl border ${msg.role === 'user' ? 'bg-gray-800 border-gray-700 ml-8' : 'bg-blue-900/20 border-blue-900/50 mr-8'}`}>
                <span className={`text-xs uppercase font-bold mb-1 block ${msg.role === 'user' ? 'text-gray-400' : 'text-blue-400'}`}>
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                </span>
                <div className="text-gray-300 text-sm select-text prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            
            {isAnalyzing && (
              <div className="flex flex-col items-center justify-center py-4 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mb-2 text-blue-500" />
                <p className="text-sm">Thinking...</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-3 bg-gray-950 border-t border-gray-800 flex flex-col gap-2">
          {attachedTexts.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-1">
              {attachedTexts.map((text, idx) => (
                <div key={idx} className="bg-blue-900/40 border border-blue-700/50 text-blue-200 text-xs px-2 py-1 rounded flex items-center gap-1">
                  <span className="truncate max-w-[150px]">{text}</span>
                  <button type="button" onClick={() => setAttachedTexts(prev => prev.filter((_, i) => i !== idx))} className="hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleAnalysisChatSubmit} className="flex gap-2 items-end">
            <textarea
              ref={chatInputRef}
              value={analysisInput}
              onChange={(e) => setAnalysisInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAnalysisChatSubmit(e as any);
                }
              }}
              placeholder="Ask a question..."
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none custom-scrollbar"
              style={{ minHeight: '40px' }}
              disabled={isAnalyzing}
              rows={1}
            />
            <div className="flex gap-2 pb-0.5">
              <button
                type="button"
                onClick={() => setIsDrawingBox(prev => !prev)}
                className={`p-2 rounded-lg transition-colors h-[38px] ${isDrawingBox ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
                title="Attach text from page"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
              <button
                type="submit"
                disabled={isAnalyzing || (!analysisInput.trim() && attachedTexts.length === 0)}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors h-[38px]"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-2 flex items-center gap-2 pointer-events-auto shadow-xl">
        <button 
          onClick={() => advancePage(false)}
          disabled={currentPage === 0}
          className="p-2 rounded-xl hover:bg-white/10 text-gray-300 hover:text-white disabled:opacity-30 transition-all"
          title="Previous Page (A / Left Arrow)"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        
        <button 
          onClick={() => advancePage(true)}
          disabled={currentPage >= mangaData.pages.length - 1}
          className="p-2 rounded-xl hover:bg-white/10 text-gray-300 hover:text-white disabled:opacity-30 transition-all"
          title="Next Page (D / Right Arrow / Space)"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div className="w-px h-6 bg-gray-700/50 mx-1" />

        <div className="relative">
          {isViewMenuOpen && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-800 border border-gray-700 rounded-xl p-1 flex flex-col gap-1 shadow-2xl">
              <button onClick={() => { setViewMode('single'); setIsViewMenuOpen(false); }} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${viewMode === 'single' ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-gray-700 text-gray-300'}`}>Single Page</button>
              <button onClick={() => { setViewMode('dual'); setIsViewMenuOpen(false); }} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${viewMode === 'dual' ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-gray-700 text-gray-300'}`}>Dual Page</button>
              <button onClick={() => { setViewMode('scroller'); setIsViewMenuOpen(false); }} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${viewMode === 'scroller' ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-gray-700 text-gray-300'}`}>Scroller</button>
              <button onClick={() => { setViewMode('scroller_dual'); setIsViewMenuOpen(false); }} className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${viewMode === 'scroller_dual' ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-gray-700 text-gray-300'}`}>Dual Scroller</button>
            </div>
          )}
          <button 
            onClick={() => setIsViewMenuOpen(prev => !prev)}
            className={`p-2 rounded-xl transition-all ${viewMode.startsWith('scroller') ? 'bg-purple-500/20 text-purple-400' : viewMode === 'dual' ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10 text-gray-300 hover:text-white'}`}
            title="View Mode"
          >
            <BookOpen className="w-5 h-5" />
          </button>
        </div>

        <button 
          onClick={() => setIsInverted(prev => !prev)}
          className={`p-2 rounded-xl transition-all ${isInverted ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10 text-gray-300 hover:text-white'}`}
          title="Invert Colors (I)"
        >
          <Contrast className="w-5 h-5" />
        </button>

        <button 
          onClick={() => setActivePopups([])}
          className="p-2 rounded-xl hover:bg-red-500/20 text-gray-300 hover:text-red-400 transition-all"
          title="Close All Popups (X)"
        >
          <XSquare className="w-5 h-5" />
        </button>

        <button 
          onClick={() => {
            setIsSidebarOpen(prev => !prev);
            if (isSidebarOpen) {
              setIsDrawingBox(false);
              setIsAddingBbox(false);
              setIsRemovingBbox(false);
              setAnalysisStart(null);
              setAnalysisCurrent(null);
            }
          }}
          className={`p-2 rounded-xl transition-all ${isSidebarOpen ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10 text-gray-300 hover:text-white'}`}
          title="AI Assistant (/ or ?)"
        >
          <MessageSquare className="w-5 h-5" />
        </button>

        <button 
          onClick={() => {
            if (!document.fullscreenElement) {
              containerRef.current?.requestFullscreen().catch(err => console.error(err));
            } else {
              document.exitFullscreen().catch(err => console.error(err));
            }
          }}
          className={`p-2 rounded-xl transition-all ${isFullscreen ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10 text-gray-300 hover:text-white'}`}
          title="Fullscreen (F)"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

export default Reader;
