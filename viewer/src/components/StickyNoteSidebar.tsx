import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw, PenTool, Palette } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';

export const NOTE_COLORS = [
  '#fef08a', // Yellow
  '#bbf7d0', // Green
  '#bfdbfe', // Blue
  '#fbcfe8', // Pink
  '#e5e7eb', // Gray
];

// Base unit is 5% of the page width/height
const BASE_UNIT = 5;

export const NOTE_PRESETS = [
  { w: 1, h: 1, label: '1x1' },
  { w: 1, h: 2, label: '1x2' },
  { w: 1, h: 3, label: '1x3' },
  { w: 1, h: 4, label: '1x4' },
  { w: 1, h: 5, label: '1x5' },
  { w: 1, h: 6, label: '1x6' },
  { w: 2, h: 2, label: '2x2' },
  { w: 2, h: 3, label: '2x3' },
  { w: 2, h: 4, label: '2x4' },
  { w: 2, h: 5, label: '2x5' },
  { w: 2, h: 6, label: '2x6' },
  { w: 3, h: 3, label: '3x3' },
  { w: 3, h: 4, label: '3x4' },
  { w: 3, h: 5, label: '3x5' },
  { w: 3, h: 6, label: '3x6' },
  { w: 4, h: 4, label: '4x4' },
  { w: 4, h: 5, label: '4x5' },
  { w: 4, h: 6, label: '4x6' },
  { w: 5, h: 5, label: '5x5' },
  { w: 5, h: 6, label: '5x6' },
  { w: 6, h: 6, label: '6x6' },
];

interface StickyNoteSidebarProps {
  activeColor: string;
  onColorChange: (color: string) => void;
  onDragStart: (e: React.DragEvent, preset: { w: number, h: number }, color: string) => void;
}

const StickyNoteSidebar: React.FC<StickyNoteSidebarProps> = ({
  activeColor,
  onColorChange,
  onDragStart
}) => {
  // Local state to track swapped dimensions for presets
  const [swappedPresets, setSwappedPresets] = useState<Record<number, boolean>>({});
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setIsColorPickerOpen(false);
      }
    };

    if (isColorPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColorPickerOpen]);

  const toggleSwap = (index: number) => {
    setSwappedPresets(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  return (
    <div className="w-56 bg-gray-900/95 backdrop-blur-md border-r border-gray-800 flex flex-col h-full shadow-2xl">
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-gray-200 font-semibold mb-3 text-sm">Sticky Notes</h3>
        
        {/* Color Picker */}
        <div className="flex gap-2 flex-wrap relative">
          {NOTE_COLORS.map(color => (
            <button
              key={color}
              onClick={() => onColorChange(color)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${activeColor === color ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
              style={{ backgroundColor: color }}
              title="Select Color"
            />
          ))}
          
          <button
            onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-transform ${!NOTE_COLORS.includes(activeColor) ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
            style={{ backgroundColor: !NOTE_COLORS.includes(activeColor) ? activeColor : '#374151' }}
            title="Custom Color"
          >
            <Palette className="w-3 h-3 text-white" />
          </button>

          {isColorPickerOpen && (
            <div 
              ref={colorPickerRef}
              className="absolute top-full left-0 mt-2 z-50 bg-gray-800 p-3 rounded-xl shadow-2xl border border-gray-700"
            >
              <HexColorPicker color={activeColor} onChange={onColorChange} />
              <div className="flex items-center gap-2 w-full bg-gray-900 rounded-lg p-2 border border-gray-700 mt-3">
                <span className="text-gray-500 font-mono text-xs">#</span>
                <input 
                  type="text" 
                  value={activeColor.replace('#', '')}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^[0-9A-Fa-f]{0,6}$/.test(val)) {
                      onColorChange(`#${val}`);
                    }
                  }}
                  className="bg-transparent text-white font-mono text-xs w-full focus:outline-none uppercase"
                  maxLength={6}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Presets List */}
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
        onWheel={(e) => e.stopPropagation()}
      >
        <p className="text-xs text-gray-500 mb-2">Drag onto page</p>
        
        <div className="grid grid-cols-2 gap-2">
          {NOTE_PRESETS.map((preset, idx) => {
            const isSwapped = swappedPresets[idx] || false;
            const currentW = isSwapped ? preset.h : preset.w;
            const currentH = isSwapped ? preset.w : preset.h;
            
            // Calculate visual representation size (max 60px width for grid)
            const maxVisualSize = 60;
            const visualW = Math.min(maxVisualSize, currentW * 10);
            const visualH = Math.min(maxVisualSize, currentH * 10);

            return (
              <div 
                key={idx} 
                draggable
                onDragStart={(e) => onDragStart(e, { w: currentW * BASE_UNIT, h: currentH * BASE_UNIT }, activeColor)}
                className="flex flex-col items-center justify-between p-2 rounded-lg hover:bg-gray-800/50 transition-colors group cursor-grab active:cursor-grabbing h-24 bg-gray-800/20 border border-gray-800/50"
                title={`Drag ${currentW}x${currentH} note`}
              >
                <div className="flex-1 flex items-center justify-center w-full">
                  <div
                    className="transition-transform group-hover:scale-105"
                    style={{
                      width: `${visualW}px`,
                      height: `${visualH}px`,
                      backgroundColor: activeColor,
                      backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(0,0,0,0.1) 100%)',
                      boxShadow: '2px 4px 8px rgba(0,0,0,0.3)'
                    }}
                  />
                </div>
                
                <div className="flex items-center justify-center w-full gap-1 mt-1 shrink-0">
                  <span className="text-[10px] text-gray-400">{currentW}x{currentH}</span>
                  {currentW !== currentH && (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSwap(idx); }}
                      className="text-gray-500 hover:text-gray-300 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Swap Dimensions"
                    >
                      <RotateCcw size={10} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StickyNoteSidebar;