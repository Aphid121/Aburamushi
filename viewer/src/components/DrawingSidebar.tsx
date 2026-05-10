import React, { useState } from 'react';
import { PenTool, Eraser } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';

const CheckerboardIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Row 1 */}
    <rect x="0" y="0" width="5" height="5" fill="currentColor" />
    <rect x="10" y="0" width="5" height="5" fill="currentColor" />
    <rect x="20" y="0" width="5" height="5" fill="currentColor" />
    {/* Row 2 */}
    <rect x="5" y="5" width="5" height="5" fill="currentColor" />
    <rect x="15" y="5" width="5" height="5" fill="currentColor" />
    {/* Row 3 */}
    <rect x="0" y="10" width="5" height="5" fill="currentColor" />
    <rect x="10" y="10" width="5" height="5" fill="currentColor" />
    <rect x="20" y="10" width="5" height="5" fill="currentColor" />
    {/* Row 4 */}
    <rect x="5" y="15" width="5" height="5" fill="currentColor" />
    <rect x="15" y="15" width="5" height="5" fill="currentColor" />
    {/* Row 5 */}
    <rect x="0" y="20" width="5" height="5" fill="currentColor" />
    <rect x="10" y="20" width="5" height="5" fill="currentColor" />
    <rect x="20" y="20" width="5" height="5" fill="currentColor" />
  </svg>
);

interface DrawingSidebarProps {
  isDrawMode: boolean;
  setIsDrawMode: (val: boolean) => void;
  isEraserMode: boolean;
  setIsEraserMode: (val: boolean) => void;
  isMaskMode: boolean;
  setIsMaskMode: (val: boolean) => void;
  activeColor: string;
  setActiveColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (val: number) => void;
  brushOpacity: number;
  setBrushOpacity: (val: number) => void;
  brushHardness: number;
  setBrushHardness: (val: number) => void;
}

const BrushSlider = ({ label, value, min, max, step, onChange, formatValue = (v: number) => v.toString() }: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value.toString());

  return (
    <div className="w-full flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-gray-400 text-xs font-medium">{label}</span>
        {isEditing ? (
          <input
            type="number"
            value={tempVal}
            onChange={e => setTempVal(e.target.value)}
            onBlur={() => {
              setIsEditing(false);
              let num = parseFloat(tempVal);
              if (!isNaN(num)) {
                num = Math.max(min, Math.min(max, num));
                onChange(num);
              } else {
                setTempVal(value.toString());
              }
            }}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="w-12 bg-gray-800 text-white text-xs px-1 rounded border border-blue-500 outline-none text-right"
            autoFocus
          />
        ) : (
          <span 
            className="text-gray-300 text-xs cursor-pointer hover:text-white"
            onClick={() => {
              // For opacity/hardness, we want to edit the 1-100 value, not 0.01-1.00
              const editVal = max <= 1 ? Math.round(value * 100) : value;
              setTempVal(editVal.toString()); 
              setIsEditing(true); 
            }}
          >
            {formatValue(value)}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-500"
      />
    </div>
  );
};

const DrawingSidebar: React.FC<DrawingSidebarProps> = ({
  isDrawMode,
  setIsDrawMode,
  isEraserMode,
  setIsEraserMode,
  isMaskMode,
  setIsMaskMode,
  activeColor,
  setActiveColor,
  brushSize,
  setBrushSize,
  brushOpacity,
  setBrushOpacity,
  brushHardness,
  setBrushHardness
}) => {
  return (
    <div className="w-56 h-full bg-gray-900/95 backdrop-blur-md border-r border-gray-800 flex flex-col items-center py-4 gap-6 shadow-2xl pointer-events-auto overflow-y-auto custom-scrollbar">
      
      {/* Tools Section */}
      <div className="flex gap-2 w-full px-4 justify-center">
        <button
          onClick={() => {
            setIsDrawMode(true);
            setIsEraserMode(false);
            setIsMaskMode(false);
          }}
          className={`p-3 rounded-xl transition-all flex-1 flex justify-center ${isDrawMode ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
          title="Pen Tool"
        >
          <PenTool className="w-5 h-5" />
        </button>
        
        <button
          onClick={() => {
            setIsMaskMode(true);
            setIsDrawMode(false);
            setIsEraserMode(false);
          }}
          className={`p-3 rounded-xl transition-all flex-1 flex justify-center ${isMaskMode ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
          title="Mask Tool (Fast Eraser)"
        >
          <CheckerboardIcon className="w-5 h-5" />
        </button>

        <button
          onClick={() => {
            setIsEraserMode(true);
            setIsDrawMode(false);
            setIsMaskMode(false);
          }}
          className={`p-3 rounded-xl transition-all flex-1 flex justify-center ${isEraserMode ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'}`}
          title="Vector Eraser (Slow)"
        >
          <Eraser className="w-5 h-5" />
        </button>
      </div>

      <div className="w-full h-px bg-gray-800" />

      {/* Color Picker Section */}
      <div className="flex flex-col items-center gap-4 w-full px-4">
        <span className="text-gray-400 text-sm font-medium self-start">Brush Color</span>
        
        <div className="w-full flex justify-center">
          <HexColorPicker color={activeColor} onChange={setActiveColor} />
        </div>
        
        {/* Hex Input */}
        <div className="flex items-center gap-2 w-full bg-gray-800 rounded-lg p-2 border border-gray-700">
          <span className="text-gray-500 font-mono">#</span>
          <input 
            type="text" 
            value={activeColor.replace('#', '')}
            onChange={(e) => {
              const val = e.target.value;
              if (/^[0-9A-Fa-f]{0,6}$/.test(val)) {
                setActiveColor(`#${val}`);
              }
            }}
            className="bg-transparent text-white font-mono w-full focus:outline-none uppercase"
            maxLength={6}
          />
        </div>
      </div>

      <div className="w-full h-px bg-gray-800" />

      {/* Brush Settings Section */}
      <div className="flex flex-col items-center gap-4 w-full px-4 pb-4">
        <BrushSlider 
          label="Size" 
          value={brushSize} 
          min={1} max={100} step={1} 
          onChange={setBrushSize} 
          formatValue={(v: number) => `${v}px`}
        />
        <BrushSlider 
          label="Opacity" 
          value={brushOpacity} 
          min={0.01} max={1} step={0.01} 
          onChange={(v: number) => {
            // If they typed a number > 1, assume they meant percentage
            if (v > 1) v = v / 100;
            setBrushOpacity(v);
          }} 
          formatValue={(v: number) => `${Math.round(v * 100)}%`}
        />
        <BrushSlider 
          label="Hardness" 
          value={brushHardness} 
          min={0.01} max={1} step={0.01} 
          onChange={(v: number) => {
            if (v > 1) v = v / 100;
            setBrushHardness(v);
          }} 
          formatValue={(v: number) => `${Math.round(v * 100)}%`}
        />
      </div>

    </div>
  );
};

export default DrawingSidebar;