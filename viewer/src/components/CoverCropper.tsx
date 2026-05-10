import React, { useState, useRef, useEffect } from 'react';
import { X, Check, ZoomIn, ZoomOut } from 'lucide-react';

interface CoverCropperProps {
  imageUrl: string;
  onSave: (croppedBase64: string) => void;
  onCancel: () => void;
}

const CoverCropper: React.FC<CoverCropperProps> = ({ imageUrl, onSave, onCancel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [minScale, setMinScale] = useState(1);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const containerW = 300;
      const containerH = 450;
      
      const scaleX = containerW / img.width;
      const scaleY = containerH / img.height;
      
      const minS = Math.max(scaleX, scaleY);
      setMinScale(minS);
      setScale(minS);
      
      setPan({
        x: (containerW - img.width * minS) / 2,
        y: (containerH - img.height * minS) / 2
      });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };
    
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const containerW = 300;
      const containerH = 450;
      const imgW = (imageRef.current?.naturalWidth || 0) * scale;
      const imgH = (imageRef.current?.naturalHeight || 0) * scale;
      
      let newX = e.clientX - dragStart.x;
      let newY = e.clientY - dragStart.y;
      
      newX = Math.min(0, Math.max(containerW - imgW, newX));
      newY = Math.min(0, Math.max(containerH - imgH, newY));
      
      setPan({ x: newX, y: newY });
    };

    if (isDragging) {
      window.addEventListener('mouseup', handleGlobalMouseUp);
      window.addEventListener('mousemove', handleGlobalMouseMove);
    }

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isDragging, dragStart, scale]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    let newScale = scale * zoomFactor;
    newScale = Math.max(minScale, Math.min(newScale, minScale * 5));
    
    const containerW = 300;
    const containerH = 450;
    const centerX = containerW / 2;
    const centerY = containerH / 2;
    
    const ratio = newScale / scale;
    
    let newX = centerX - (centerX - pan.x) * ratio;
    let newY = centerY - (centerY - pan.y) * ratio;
    
    const imgW = (imageRef.current?.naturalWidth || 0) * newScale;
    const imgH = (imageRef.current?.naturalHeight || 0) * newScale;
    
    newX = Math.min(0, Math.max(containerW - imgW, newX));
    newY = Math.min(0, Math.max(containerH - imgH, newY));
    
    setScale(newScale);
    setPan({ x: newX, y: newY });
  };

  const handleSave = () => {
    if (!imageRef.current) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const targetW = 600;
    const targetH = 900;
    canvas.width = targetW;
    canvas.height = targetH;
    
    const mult = targetW / 300;
    
    ctx.drawImage(
      imageRef.current,
      pan.x * mult,
      pan.y * mult,
      imageRef.current.naturalWidth * scale * mult,
      imageRef.current.naturalHeight * scale * mult
    );
    
    const base64 = canvas.toDataURL('image/jpeg', 0.9);
    onSave(base64);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 flex flex-col items-center shadow-2xl">
        <div className="flex justify-between w-full mb-4 items-center">
          <h3 className="text-xl font-bold text-white">Adjust Cover</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div 
          ref={containerRef}
          className="relative overflow-hidden bg-gray-800 cursor-move border border-gray-700 rounded-lg shadow-inner"
          style={{ width: 300, height: 450 }}
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
        >
          <img 
            ref={imageRef}
            src={imageUrl} 
            alt="Crop target" 
            className="absolute max-w-none pointer-events-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0'
            }}
            draggable={false}
          />
        </div>
        
        <div className="flex items-center gap-4 mt-6 w-full">
          <button 
            onClick={() => handleWheel({ preventDefault: () => {}, deltaY: 1 } as any)}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <input 
            type="range" 
            min={minScale} 
            max={minScale * 5} 
            step="0.01" 
            value={scale}
            onChange={(e) => {
              const newScale = parseFloat(e.target.value);
              const containerW = 300;
              const containerH = 450;
              const centerX = containerW / 2;
              const centerY = containerH / 2;
              const ratio = newScale / scale;
              
              let newX = centerX - (centerX - pan.x) * ratio;
              let newY = centerY - (centerY - pan.y) * ratio;
              
              const imgW = (imageRef.current?.naturalWidth || 0) * newScale;
              const imgH = (imageRef.current?.naturalHeight || 0) * newScale;
              
              newX = Math.min(0, Math.max(containerW - imgW, newX));
              newY = Math.min(0, Math.max(containerH - imgH, newY));
              
              setScale(newScale);
              setPan({ x: newX, y: newY });
            }}
            className="flex-1"
          />
          <button 
            onClick={() => handleWheel({ preventDefault: () => {}, deltaY: -1 } as any)}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex gap-3 mt-6 w-full">
          <button 
            onClick={onCancel}
            className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            Save Cover
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoverCropper;
