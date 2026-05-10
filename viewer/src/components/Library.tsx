import React, { useState, useEffect } from 'react';
import { Book, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import DictionaryManager from './DictionaryManager';
import CoverCropper from './CoverCropper';

interface MangaItem {
  id: string;
  title: string;
  path: string;
  cover_image: string | null;
  cover_url?: string;
  total_pages: number;
  processed_pages: number;
  status: 'processing' | 'ready' | 'error';
  last_read_page: number;
}

const Library: React.FC = () => {
  const [mangaList, setMangaList] = useState<MangaItem[]>([]);
  const [isRemoveMode, setIsRemoveMode] = useState(false);
  const [showDictManager, setShowDictManager] = useState(false);
  const [cropTarget, setCropTarget] = useState<{ id: string, url: string } | null>(null);

  const fetchLibrary = async () => {
    if ((window as any).electronAPI) {
      const library = await (window as any).electronAPI.getLibrary();
      
      // Load cover image URLs
      const libraryWithCovers = await Promise.all(library.map(async (manga: MangaItem) => {
        if (manga.cover_image) {
          const url = await (window as any).electronAPI.getMangaCoverUrl(manga.cover_image);
          return { ...manga, cover_url: url };
        }
        return manga;
      }));
      
      setMangaList(libraryWithCovers);
    }
  };

  useEffect(() => {
    fetchLibrary();

    const handleProgress = (e: Event) => {
      const customEvent = e as CustomEvent;
      const data = customEvent.detail;
      setMangaList(prev => prev.map(manga => {
        if (manga.id === data.id) {
          // If we just got a cover image update, we need to fetch the URL for it
          if (data.cover_image && !data.cover_url) {
            (window as any).electronAPI.getMangaCoverUrl(data.cover_image).then((url: string) => {
              setMangaList(currentList => currentList.map(m => 
                m.id === data.id ? { ...m, ...data, cover_url: url } : m
              ));
            });
          }
          return { ...manga, ...data };
        }
        return manga;
      }));
    };

    window.addEventListener('manga-progress', handleProgress);
    return () => window.removeEventListener('manga-progress', handleProgress);
  }, []);

  const handleAddManga = async () => {
    if ((window as any).electronAPI) {
      const result = await (window as any).electronAPI.addManga();
      if (result.success) {
        fetchLibrary(); // Refresh to show the new 'processing' item
      }
    }
  };

  const handleRemoveManga = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if ((window as any).electronAPI) {
      const result = await (window as any).electronAPI.removeManga(id);
      if (result.success) {
        fetchLibrary();
      } else {
        alert("Failed to remove manga: " + result.error);
      }
    }
  };

  const handleSetCover = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if ((window as any).electronAPI) {
      const result = await (window as any).electronAPI.selectMangaCover();
      if (result.success && result.imagePath) {
        // Instead of saving immediately, open the cropper
        const url = await (window as any).electronAPI.getMangaCoverUrl(result.imagePath);
        setCropTarget({ id, url });
      }
    }
  };

  const handleSaveCroppedCover = async (base64: string) => {
    if (!cropTarget) return;
    if ((window as any).electronAPI) {
      const result = await (window as any).electronAPI.saveCroppedCover(cropTarget.id, base64);
      if (result.success) {
        fetchLibrary();
      }
    }
    setCropTarget(null);
  };

  const handleMangaClick = (manga: MangaItem) => {
    if (isRemoveMode) return;
    if (manga.status === 'error') return;
    
    // Dispatch a custom event that App.tsx can listen to
    const event = new CustomEvent('open-reader', { detail: { mangaId: manga.id } });
    window.dispatchEvent(event);
  };

  return (
    <div className="relative flex h-full bg-gray-950 text-white p-6">
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col pr-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        </div>

        <div className="flex-1 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 auto-rows-max overflow-y-auto custom-scrollbar pb-24">
          {mangaList.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-700 rounded-xl text-gray-500">
              <p>No manga in library.</p>
              <p className="text-sm">Click "Add Manga" to begin.</p>
            </div>
          ) : (
            mangaList.map(manga => (
              <div 
                key={manga.id} 
                onClick={() => handleMangaClick(manga)}
                className={`relative flex flex-col aspect-[2/3] rounded-xl overflow-hidden border-2 transition-all cursor-pointer group
                  ${manga.status === 'processing' ? 'border-blue-500/50 hover:border-blue-400' : 'border-gray-800 hover:border-blue-500'}
                `}
              >
                {/* Cover Image Placeholder */}
                <div className="flex-1 bg-gray-800 flex items-center justify-center relative">
                  {(manga as any).cover_url ? (
                    <img src={(manga as any).cover_url} alt={manga.title} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-12 h-12 text-gray-600" />
                  )}
                  
                  {/* Set Cover Button (Visible on Hover) */}
                  {!isRemoveMode && manga.status === 'ready' && (
                    <button
                      onClick={(e) => handleSetCover(manga.id, e)}
                      className="absolute top-2 right-2 bg-gray-900/80 hover:bg-blue-600 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm border border-gray-700 hover:border-blue-500"
                      title="Set Cover Image"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {/* Title Bar */}
                <div className="bg-gray-900 p-3 border-t border-gray-800">
                  <h3 className="font-medium text-sm truncate" title={manga.title}>{manga.title}</h3>
                </div>

                {/* Remove Overlay */}
                {isRemoveMode && (
                  <div 
                    className="absolute inset-0 bg-red-900/40 flex items-center justify-center backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity z-20"
                    onClick={(e) => handleRemoveManga(manga.id, e)}
                  >
                    <div className="bg-red-600 p-4 rounded-full shadow-lg transform group-hover:scale-110 transition-transform">
                      <Trash2 className="w-8 h-8 text-white" />
                    </div>
                  </div>
                )}

                {/* Processing Overlay */}
                {manga.status === 'processing' && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none">
                    {/* Circular Progress */}
                    <div className="relative w-16 h-16 mb-2">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" className="stroke-gray-700" strokeWidth="8" fill="none" />
                        <circle 
                          cx="50" cy="50" r="40" 
                          className="stroke-blue-500 transition-all duration-300 ease-out" 
                          strokeWidth="8" fill="none" 
                          strokeDasharray="251.2" 
                          strokeDashoffset={251.2 - (251.2 * (manga.processed_pages / Math.max(1, manga.total_pages)))} 
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                        {manga.total_pages > 0 ? Math.round((manga.processed_pages / manga.total_pages) * 100) : 0}%
                      </div>
                    </div>
                    <span className="text-xs font-medium text-blue-400 animate-pulse">Processing...</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Side Action Buttons */}
      <div className="flex flex-col gap-4 w-32 shrink-0">
        <button 
          onClick={handleAddManga}
          className="flex flex-col items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 aspect-square rounded-2xl transition-colors border border-gray-700 hover:border-gray-500 group"
        >
          <Plus className="w-10 h-10 text-gray-400 group-hover:text-white transition-colors" />
          <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">Add Manga</span>
        </button>
        
        <button 
          onClick={() => setIsRemoveMode(!isRemoveMode)}
          className={`flex flex-col items-center justify-center gap-3 aspect-square rounded-2xl transition-colors border group
            ${isRemoveMode 
              ? 'bg-red-900/30 border-red-500 hover:bg-red-900/50' 
              : 'bg-gray-800 hover:bg-gray-700 border-gray-700 hover:border-gray-500'
            }
          `}
        >
          <Trash2 className={`w-10 h-10 transition-colors ${isRemoveMode ? 'text-red-400' : 'text-gray-400 group-hover:text-white'}`} />
          <span className={`text-sm font-medium transition-colors ${isRemoveMode ? 'text-red-400' : 'text-gray-400 group-hover:text-white'}`}>
            {isRemoveMode ? 'Done' : 'Remove Manga'}
          </span>
        </button>
      </div>

      {/* Floating Dictionary Button */}
      <button 
        onClick={() => setShowDictManager(true)}
        className="absolute bottom-8 left-8 bg-gray-800 hover:bg-gray-700 p-5 rounded-full shadow-2xl shadow-black/50 border border-gray-700 hover:border-gray-500 transition-all hover:scale-105 group z-50"
      >
        <Book className="w-8 h-8 text-blue-400 group-hover:text-blue-300 transition-colors" />
      </button>

      {/* Dictionary Manager Modal */}
      {showDictManager && (
        <DictionaryManager onClose={() => setShowDictManager(false)} />
      )}

      {/* Cover Cropper Modal */}
      {cropTarget && (
        <CoverCropper 
          imageUrl={cropTarget.url} 
          onSave={handleSaveCroppedCover} 
          onCancel={() => setCropTarget(null)} 
        />
      )}

    </div>
  );
};

export default Library;
