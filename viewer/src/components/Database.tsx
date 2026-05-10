import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCw, Ban, Type, BookOpen } from 'lucide-react';
import DictionaryPopup from './DictionaryPopup';

interface UserWord {
  term: string;
  reading: string;
  status: string;
  context_sentence: string;
  last_reviewed: number;
}

const Database: React.FC = () => {
  const [words, setWords] = useState<UserWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'banned'>('all');
  const [activePopupWord, setActivePopupWord] = useState<UserWord | null>(null);

  const loadWords = async () => {
    setLoading(true);
    try {
      if ((window as any).electronAPI) {
        const data = await (window as any).electronAPI.getAllUserWords();
        setWords(data);
      }
    } catch (error) {
      console.error('Failed to load words:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWords();
  }, []);

  const handleDelete = async (term: string, reading: string, skipConfirm = false) => {
    if (skipConfirm || confirm(`Are you sure you want to delete "${term}"?`)) {
      try {
        if ((window as any).electronAPI) {
          await (window as any).electronAPI.deleteUserWord(term, reading);
          loadWords(); // Refresh the list
        }
      } catch (error) {
        console.error('Failed to delete word:', error);
      }
    }
  };

  const handleBan = async (term: string, reading: string) => {
    if (confirm(`Are you sure you want to ban "${term}"? It will no longer be tracked.`)) {
      try {
        if ((window as any).electronAPI) {
          await (window as any).electronAPI.banUserWord(term, reading);
          loadWords(); // Refresh the list
        }
      } catch (error) {
        console.error('Failed to ban word:', error);
      }
    }
  };

  const handleNonJapanese = async (term: string, reading: string) => {
    if (confirm(`Mark "${term}" as non-Japanese/punctuation/onomatopoeia?`)) {
      try {
        if ((window as any).electronAPI) {
          await (window as any).electronAPI.markNonJapanese(term, reading);
          loadWords(); // Refresh the list
        }
      } catch (error) {
        console.error('Failed to mark non-japanese:', error);
      }
    }
  };

  const handleUnban = async (term: string, reading: string) => {
    try {
      if ((window as any).electronAPI) {
        await (window as any).electronAPI.updateWordStatus(term, reading, 'seen', null);
        loadWords(); // Refresh the list
      }
    } catch (error) {
      console.error('Failed to unban word:', error);
    }
  };

  const filteredWords = words.filter(w => activeTab === 'banned' ? w.status === 'banned' : w.status !== 'banned');

  return (
    <div className="h-full flex flex-col bg-gray-950 p-6 overflow-hidden relative">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-bold text-white">Database Management</h1>
          <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'all' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
            >
              All Words
            </button>
            <button
              onClick={() => setActiveTab('banned')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'banned' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Banned
            </button>
          </div>
        </div>
        <button 
          onClick={loadWords}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-md transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-gray-900 rounded-lg border border-gray-800">
        {loading ? (
          <div className="flex justify-center items-center h-full text-gray-400">
            Loading database...
          </div>
        ) : filteredWords.length === 0 ? (
          <div className="flex justify-center items-center h-full text-gray-400">
            No {activeTab === 'banned' ? 'banned ' : ''}words found in the database.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-950 sticky top-0 z-10">
              <tr>
                <th className="p-3 border-b border-gray-800 text-gray-400 font-medium">Term</th>
                <th className="p-3 border-b border-gray-800 text-gray-400 font-medium">Reading</th>
                <th className="p-3 border-b border-gray-800 text-gray-400 font-medium">Status</th>
                <th className="p-3 border-b border-gray-800 text-gray-400 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWords.map((word, index) => (
                <tr key={`${word.term}-${word.reading}-${index}`} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="p-3 text-white font-medium">{word.term}</td>
                  <td className="p-3 text-gray-300">{word.reading}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      word.status === 'learning' ? 'bg-blue-900/50 text-blue-400' :
                      word.status === 'known' ? 'bg-green-900/50 text-green-400' :
                      word.status === 'banned' ? 'bg-yellow-900/50 text-yellow-400' :
                      word.status === 'non_japanese' ? 'bg-gray-700/50 text-gray-400' :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {word.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => setActivePopupWord(word)}
                        className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-md transition-colors"
                        title="Show Definition"
                      >
                        <BookOpen className="w-4 h-4" />
                      </button>
                      {activeTab === 'banned' ? (
                        <button 
                          onClick={() => handleUnban(word.term, word.reading)}
                          className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-green-400/10 rounded-md transition-colors"
                          title="Unban word"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={() => handleNonJapanese(word.term, word.reading)}
                            className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 rounded-md transition-colors"
                            title="Mark as non-Japanese/punctuation/onomatopoeia"
                          >
                            <Type className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleBan(word.term, word.reading)}
                            className="p-1.5 text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-md transition-colors"
                            title="Ban word (mark as not a real word)"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button 
                        onClick={(e) => handleDelete(word.term, word.reading, e.shiftKey)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                        title="Delete word (Shift+Click to bypass confirmation)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Dictionary Popup Overlay */}
      {activePopupWord && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setActivePopupWord(null)}>
          <div onClick={e => e.stopPropagation()} className="relative w-full h-full flex items-center justify-center">
            <DictionaryPopup
              word={{
                text: activePopupWord.term,
                base_form: activePopupWord.term,
                reading: activePopupWord.reading,
                part_of_speech: ""
              }}
              contextSentence={activePopupWord.context_sentence}
              anchor={{ relX: 50, relY: 50, relW: 0, relH: 0, imgIdx: 0, bubbleBox: { relX: 50, relY: 50, relW: 0, relH: 0 } }}
              scale={1}
              zIndex={100}
              isNonJapanese={activePopupWord.status === 'non_japanese'}
              disableLookupRecord={true}
              onClose={() => setActivePopupWord(null)}
              onStatusChange={(status) => {
                // Update the local state immediately
                setWords(prev => prev.map(w => 
                  w.term === activePopupWord.term && w.reading === activePopupWord.reading 
                    ? { ...w, status } 
                    : w
                ));
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Database;
