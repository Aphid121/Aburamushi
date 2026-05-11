import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface VirtualPageProps {
  pageIdx: number;
  imageName: string;
  width: number;
  height: number;
  isInverted: boolean;
  onImageLoad?: (imgElement: HTMLImageElement) => void;
}

const VirtualPage: React.FC<VirtualPageProps> = ({ pageIdx, imageName, width, height, isInverted, onImageLoad }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        } else {
          setIsVisible(false);
        }
      },
      { rootMargin: '2000px' } // Load images when they are within 2000px of the viewport
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Force visibility to true initially so the observer has something to measure
    setIsVisible(true);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) {
      if (url) {
        URL.revokeObjectURL(url);
        // We can't call setUrl(null) here because it triggers a re-render during an effect
        // which causes the "cascading renders" warning.
        // Instead, we'll just let the URL be revoked, and the next time it becomes visible,
        // it will fetch a new one and overwrite the old state.
      }
      return;
    }

    let isMounted = true;
    
    const loadImage = async () => {
      try {
        const res = await (window as any).electronAPI.getMangaImage(imageName);
        if (!res.success) throw new Error(res.error);
        
        if (isMounted) {
          const blobUrl = URL.createObjectURL(new Blob([res.buffer]));
          setUrl(blobUrl);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message);
      }
    };
    
    loadImage();
    
    return () => {
      isMounted = false;
    };
  }, [imageName, isVisible]);

  useEffect(() => {
    if (url && imgRef.current && onImageLoad) {
      if (imgRef.current.complete) {
        onImageLoad(imgRef.current);
      } else {
        imgRef.current.onload = () => {
          if (imgRef.current) onImageLoad(imgRef.current);
        };
      }
    }
  }, [url, onImageLoad]);

  return (
    <div 
      ref={containerRef}
      className="relative w-full bg-gray-900 shrink-0"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center text-red-500 text-sm">Error</div>
      ) : !url ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
        </div>
      ) : (
        <img 
          id={`manga-img-${pageIdx}`}
          ref={imgRef}
          src={url} 
          alt={`Page ${pageIdx + 1}`} 
          className={`w-full h-auto block transition-[filter] duration-300 ${isInverted ? 'invert hue-rotate-180' : ''}`}
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      )}
    </div>
  );
};

export default VirtualPage;
