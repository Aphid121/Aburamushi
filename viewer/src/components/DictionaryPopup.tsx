import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, X, CheckCircle2, AlertCircle, Ban, Type } from 'lucide-react';

interface Word {
  text: string;
  base_form: string;
  reading: string;
  part_of_speech: string;
}

interface DictionaryPopupProps {
  word: Word | null;
  contextSentence?: string;
  anchor: { relX: number, relY: number, relW: number, relH: number, imgIdx: number, bubbleBox: { relX: number, relY: number, relW: number, relH: number }, direction?: string } | null;
  scale: number;
  zIndex?: number;
  isNonJapanese?: boolean;
  disableLookupRecord?: boolean;
  onClose: () => void;
  onStatusChange?: (status: string, term: string) => void;
  onMouseEnter?: () => void;
}

const DictionaryPopup: React.FC<DictionaryPopupProps> = ({ word, contextSentence, anchor, scale, zIndex = 0, isNonJapanese = false, disableLookupRecord = false, onClose, onStatusChange, onMouseEnter }) => {
  const [dbInfo, setDbInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (word && (window as any).electronAPI) {
      setLoading(true);
      
      // Fetch the word info immediately so the popup renders fast
      (window as any).electronAPI.getWordInfo(word.base_form, word.reading)
        .then((info: any) => {
          setDbInfo(info);
          setLoading(false);
        })
        .catch((err: any) => {
          console.error("Failed to fetch word info:", err);
          setLoading(false);
        });
        
      // Record the lookup in the background (this handles the strike system)
      if (!disableLookupRecord) {
        (window as any).electronAPI.recordLookup(word.base_form, word.reading, contextSentence)
          .then((result: any) => {
            // If the status changed due to auto-needs-work (e.g. hit 5 strikes), notify the parent
            if (result && result.status && onStatusChange) {
              const term = word.base_form || (word as any).char || word.text;
              onStatusChange(result.status, term);
            }
          })
          .catch((err: any) => console.error("Failed to record lookup:", err));
      }
    }
  }, [word]);

  const handleStatusChange = async (status: string) => {
    if (word && (window as any).electronAPI) {
      await (window as any).electronAPI.updateWordStatus(word.base_form, word.reading, status, contextSentence);
      
      // Update local state immediately for snappy UI
      const term = word.base_form || (word as any).char || word.text;
      if (onStatusChange) onStatusChange(status, term);
      
      onClose();
    }
  };

  const handleBan = async () => {
    if (word && (window as any).electronAPI) {
      await (window as any).electronAPI.banUserWord(word.base_form, word.reading);
      
      const term = word.base_form || (word as any).char || word.text;
      if (onStatusChange) onStatusChange('banned', term);
      
      onClose();
    }
  };

  const handleNonJapanese = async () => {
    if (word && (window as any).electronAPI) {
      await (window as any).electronAPI.markNonJapanese(word.base_form, word.reading);
      
      const term = word.base_form || (word as any).char || word.text;
      if (onStatusChange) onStatusChange('non_japanese', term);
      
      onClose();
    }
  };

  if (!word || !anchor) return null;

  // Group definitions by dictionary
  const dictGroups: Record<string, any[]> = {};
  if (dbInfo?.definitions) {
    dbInfo.definitions.forEach((def: any) => {
      const title = def.dict_title || 'Unknown Dictionary';
      if (!dictGroups[title]) dictGroups[title] = [];
      dictGroups[title].push(def);
    });
  }

  // Calculate base scale relative to window size
  // We'll use a baseline window height of 1080px. If the window is smaller, the popup scales down.
  const [baseScale, setBaseScale] = useState(0.45);
  
  useEffect(() => {
    const updateBaseScale = async () => {
      let multiplier = 0.45;
      if ((window as any).electronAPI) {
        const settings = await (window as any).electronAPI.getSettings();
        if (settings && settings['popup_base_scale']) {
          multiplier = parseFloat(settings['popup_base_scale']);
        }
      }
      
      // If disableLookupRecord is true, we are likely in the Database tab, so we want a larger scale
      if (disableLookupRecord) {
        multiplier = Math.max(multiplier, 0.8);
      }
      
      // Calculate scale based on window height, with a max scale of 1, then multiply by the user's setting
      const newScale = Math.min(1, window.innerHeight / 1080) * multiplier;
      setBaseScale(newScale);
    };
    
    updateBaseScale();
    window.addEventListener('resize', updateBaseScale);
    return () => window.removeEventListener('resize', updateBaseScale);
  }, [disableLookupRecord]);
  // Calculate placement based on bubble position
  const bubbleCenterX = anchor.bubbleBox.relX + (anchor.bubbleBox.relW / 2);
  const bubbleCenterY = anchor.bubbleBox.relY + (anchor.bubbleBox.relH / 2);
  
  // Calculate distance from the clicked word to each edge of the speech bubble
  const distLeft = Math.abs(anchor.relX - anchor.bubbleBox.relX);
  const distRight = Math.abs((anchor.bubbleBox.relX + anchor.bubbleBox.relW) - (anchor.relX + anchor.relW));
  const distTop = Math.abs(anchor.relY - anchor.bubbleBox.relY);
  const distBottom = Math.abs((anchor.bubbleBox.relY + anchor.bubbleBox.relH) - (anchor.relY + anchor.relH));

  let placement: 'left' | 'right' | 'top' | 'bottom' | 'center' = 'right'; // Default
  const isVertical = anchor.direction === 'vertical-rl';

  if (isVertical) {
    // Columns should NEVER get the notch on the top/bottom
    placement = distLeft < distRight ? 'left' : 'right';
  } else {
    // Rows should NEVER get the notch on the left/right
    placement = distTop < distBottom ? 'top' : 'bottom';
  }
  
  let anchorLeft = 0;
  let anchorTop = 0;

  // If disableLookupRecord is true, we are in the Database tab, so center it perfectly
  if (disableLookupRecord) {
    anchorLeft = 50;
    anchorTop = 50;
    placement = 'center'; // Force center placement so it centers nicely
  } else {
    // Position the 0x0 anchor point at the edge of the WORD, aligned with the center of the word
    anchorLeft = anchor.relX + (anchor.relW / 2);
    anchorTop = anchor.relY + (anchor.relH / 2);

    // Add a tiny padding so the notch just touches the word
    const padding = 0.5;

    if (placement === 'right') {
      anchorLeft = anchor.relX + anchor.relW + padding;
    } else if (placement === 'left') {
      anchorLeft = anchor.relX - padding;
    } else if (placement === 'bottom') {
      anchorTop = anchor.relY + anchor.relH + padding;
    } else if (placement === 'top') {
      anchorTop = anchor.relY - padding;
    }
  }

  return (
    <div 
      className="absolute pointer-events-none"
      style={{ 
        left: `${anchorLeft}%`, 
        top: `${anchorTop}%`, 
        width: 0, 
        height: 0,
        zIndex: 50 + zIndex
      }}
    >
      <div 
        className="absolute pointer-events-auto"
        style={{
          left: 0,
          top: 0,
          transform: `scale(${baseScale})`,
        }}
      >
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: placement === 'left' || placement === 'right' ? "-50%" : placement === 'center' ? "-50%" : 0, x: placement === 'top' || placement === 'bottom' ? "-50%" : placement === 'center' ? "-50%" : 0 }}
            animate={{ opacity: 1, scale: 1, y: placement === 'left' || placement === 'right' ? "-50%" : placement === 'center' ? "-50%" : 0, x: placement === 'top' || placement === 'bottom' ? "-50%" : placement === 'center' ? "-50%" : 0 }}
            exit={{ opacity: 0, scale: 0.9, y: placement === 'left' || placement === 'right' ? "-50%" : placement === 'center' ? "-50%" : 0, x: placement === 'top' || placement === 'bottom' ? "-50%" : placement === 'center' ? "-50%" : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="absolute bg-gray-900 border border-gray-700 shadow-2xl rounded-2xl p-0 w-[384px] max-h-[400px] flex flex-col overflow-visible"
            style={{
              ...(placement === 'right' ? { left: '12px' } : placement === 'left' ? { right: '12px' } : {}),
              ...(placement === 'bottom' ? { top: '12px' } : placement === 'top' ? { bottom: '12px' } : {}),
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            onMouseEnter={onMouseEnter}
          >
            {/* The Notch */}
            {!disableLookupRecord && (
              <div 
                className={`absolute w-0 h-0 border-solid drop-shadow-[-1px_0_0_rgba(55,65,81,1)]
                  ${placement === 'right' ? 'border-r-gray-900 border-y-transparent border-l-transparent' : ''}
                  ${placement === 'left' ? 'border-l-gray-900 border-y-transparent border-r-transparent' : ''}
                  ${placement === 'bottom' ? 'border-b-gray-900 border-x-transparent border-t-transparent' : ''}
                  ${placement === 'top' ? 'border-t-gray-900 border-x-transparent border-b-transparent' : ''}
                `} 
                style={{
                  borderWidth: '12px',
                  ...(placement === 'left' || placement === 'right' ? { top: 'calc(50% - 12px)' } : { left: 'calc(50% - 12px)' }),
                  ...(placement === 'right' ? { left: '-24px' } : placement === 'left' ? { right: '-24px' } : {}),
                  ...(placement === 'bottom' ? { top: '-24px' } : placement === 'top' ? { bottom: '-24px' } : {}),
                }} 
              />
            )}
            
            {/* Header */}
            <div className="flex justify-between items-start p-5 bg-gray-800/50 border-b border-gray-800 shrink-0 rounded-t-2xl">
              <div>
                <h2 className="text-3xl font-bold text-blue-400 mb-1">{word.text}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="bg-gray-800 px-2 py-0.5 rounded-md border border-gray-700">{word.reading}</span>
                  <span>•</span>
                  <span>{word.part_of_speech}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={handleNonJapanese}
                  className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 rounded-lg transition-colors"
                  title="Mark as non-Japanese/punctuation/onomatopoeia"
                >
                  <Type className="w-5 h-5" />
                </button>
                <button 
                  onClick={handleBan}
                  className="p-2 text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-colors"
                  title="Ban word (mark as not a real word)"
                >
                  <Ban className="w-5 h-5" />
                </button>
                <button 
                  onClick={onClose}
                  className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-5 pr-3 space-y-4 overflow-y-auto flex-1 custom-scrollbar mr-1">
              {isNonJapanese ? (
                <div className="text-center py-8 text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50 text-orange-400" />
                  <p className="text-sm leading-relaxed">
                    This is not a Japanese character/word, it is punctuation, or it is onomatopoeia. If you want to know the meaning of this word/character, please do an external search or request help from the AI assistant.
                  </p>
                </div>
              ) : (
                <>
                  {/* Base Form (if different) */}
                  {word.text !== word.base_form && (
                    <div className="bg-gray-800/50 p-3 rounded-xl border border-gray-700/50">
                      <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-1">Base Form</span>
                      <p className="text-gray-200 text-lg">{word.base_form}</p>
                    </div>
                  )}
                  
                  {/* Definitions */}
                  <div className="space-y-4">
                    {loading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                    ) : Object.keys(dictGroups).length > 0 ? (
                      Object.entries(dictGroups).map(([dictTitle, defs], dictIdx) => (
                        <div key={dictIdx} className="bg-gray-800/30 rounded-xl border border-gray-700/50 overflow-hidden">
                          <div className="bg-gray-800/80 px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
                            <Book className="w-4 h-4 text-blue-400" />
                            <span className="text-xs font-semibold text-gray-300">{dictTitle}</span>
                          </div>
                          <div className="p-3">
                            <ul className="space-y-3">
                              {defs.map((def: any, i: number) => {
                                try {
                                  const parsed = JSON.parse(def.definition);
                                  
                                  const extractText = (node: any): string => {
                                    if (typeof node === 'string') return node;
                                    if (typeof node === 'number') return String(node);
                                    if (!node) return '';
                                    
                                    if (Array.isArray(node)) {
                                      return node.map(extractText).join('');
                                    }
                                    
                                    if (typeof node === 'object') {
                                      if (node.type === 'image') return '[Image]';
                                      if (node.tag === 'br') return '\n';
                                      if (node.tag === 'li') return '• ' + extractText(node.content) + '\n';
                                      if (node.tag === 'div') return extractText(node.content) + '\n';
                                      
                                      if (node.text !== undefined) return extractText(node.text);
                                      if (node.content !== undefined) return extractText(node.content);
                                    }
                                    return '';
                                  };

                                  let defStrings: string[] = [];
                                  if (Array.isArray(parsed)) {
                                    defStrings = parsed.map(item => extractText(item).trim()).filter(s => s.length > 0);
                                  } else {
                                    const text = extractText(parsed).trim();
                                    if (text) defStrings.push(text);
                                  }

                                  if (defStrings.length === 0 && parsed && typeof parsed === 'object') {
                                    defStrings.push(JSON.stringify(parsed));
                                  }

                                  return (
                                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                                      <span className="text-gray-600 select-none shrink-0">{i + 1}.</span>
                                      <div className="flex flex-col gap-1">
                                        {defStrings.map((str, idx) => (
                                          <span key={idx} className="break-words whitespace-pre-wrap">{str}</span>
                                        ))}
                                      </div>
                                    </li>
                                  );
                                } catch (e) {
                                  return (
                                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                                      <span className="text-gray-600 select-none shrink-0">{i + 1}.</span>
                                      <span className="break-words whitespace-pre-wrap">{def.definition}</span>
                                    </li>
                                  );
                                }
                              })}
                            </ul>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <Book className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No definitions found.</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            
            {/* Footer Actions */}
            {!isNonJapanese && (
              <div className="p-4 bg-gray-800/50 border-t border-gray-800 shrink-0 flex gap-3 rounded-b-2xl">
                <button 
                  onClick={() => handleStatusChange('learning')}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-900/20 text-red-400 hover:bg-red-900/40 py-2.5 rounded-xl text-sm font-medium transition-colors border border-red-900/50 hover:border-red-500/50"
                >
                  <AlertCircle className="w-4 h-4" />
                  Needs Work
                </button>
                <button 
                  onClick={() => handleStatusChange('known')}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-900/20 text-green-400 hover:bg-green-900/40 py-2.5 rounded-xl text-sm font-medium transition-colors border border-green-900/50 hover:border-green-500/50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Known
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DictionaryPopup;
