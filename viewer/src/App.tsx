import React, { useState, useEffect } from 'react';
import { BookOpen, Library as LibraryIcon, BrainCircuit, Settings as SettingsIcon, Search as SearchIcon, TrendingUp, Database as DatabaseIcon } from 'lucide-react';
import Library from './components/Library';
import Reader from './components/Reader';
import Quiz from './components/Quiz';
import Settings from './components/Settings';
import Search from './components/Search';
import Progress from './components/Progress';
import Database from './components/Database';

type Tab = 'library' | 'reader' | 'quiz' | 'search' | 'progress' | 'database' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [activeMangaId, setActiveMangaId] = useState<string | null>(null);

  useEffect(() => {
    const handleOpenReader = (e: Event) => {
      const customEvent = e as CustomEvent;
      setActiveMangaId(customEvent.detail.mangaId);
      setActiveTab('reader');
    };

    window.addEventListener('open-reader', handleOpenReader);
    
    // Forward IPC manga-progress events to standard window events for component consumption.
    if ((window as any).electronAPI) {
      (window as any).electronAPI.onMangaProgress((data: any) => {
        const event = new CustomEvent('manga-progress', { detail: data });
        window.dispatchEvent(event);
      });
    }
    
    return () => {
      window.removeEventListener('open-reader', handleOpenReader);
      if ((window as any).electronAPI) {
        (window as any).electronAPI.removeMangaProgress();
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-center p-2 bg-gray-900 border-b border-gray-800 shadow-sm z-10">
        <div className="flex bg-gray-950 rounded-lg p-1 border border-gray-800">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'library' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <LibraryIcon className="w-4 h-4" />
            Library
          </button>
          <button
            onClick={() => setActiveTab('reader')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'reader' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Reader
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'quiz' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            Quiz
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'search' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <SearchIcon className="w-4 h-4" />
            Search
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'progress' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Progress
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'database' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <DatabaseIcon className="w-4 h-4" />
            Database
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'settings' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'library' && <Library />}
        {activeTab === 'reader' && (
          activeMangaId ? (
            <Reader mangaId={activeMangaId} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <BookOpen className="w-16 h-16 mb-4 opacity-20" />
              <h2 className="text-2xl font-bold mb-2">No Manga Selected</h2>
              <p>Go to the Library and select a manga to read.</p>
            </div>
          )
        )}
        {activeTab === 'quiz' && <Quiz />}
        {activeTab === 'search' && <Search />}
        {activeTab === 'progress' && <Progress />}
        {activeTab === 'database' && <Database />}
        {activeTab === 'settings' && <Settings />}
      </div>
    </div>
  );
};

export default App;
