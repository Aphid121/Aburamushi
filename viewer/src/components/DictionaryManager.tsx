import React, { useState, useEffect } from 'react';
import { Book, Plus, Trash2, X } from 'lucide-react';

interface Dictionary {
  id: string;
  title: string;
  term_count: number;
}

interface DictionaryManagerProps {
  onClose: () => void;
}

const DictionaryManager: React.FC<DictionaryManagerProps> = ({ onClose }) => {
  const [dictionaries, setDictionaries] = useState<Dictionary[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const fetchDictionaries = async () => {
    if ((window as any).electronAPI) {
      const dicts = await (window as any).electronAPI.getDictionaries();
      setDictionaries(dicts);
    }
  };

  useEffect(() => {
    fetchDictionaries();
  }, []);

  const handleImport = async () => {
    if ((window as any).electronAPI) {
      setIsImporting(true);
      const result = await (window as any).electronAPI.importDictionary();
      setIsImporting(false);
      if (result.success) {
        fetchDictionaries();
      } else if (result.error) {
        alert("Failed to import dictionary: " + result.error);
      }
    }
  };

  const handleRemove = async (id: string) => {
    if ((window as any).electronAPI) {
      const result = await (window as any).electronAPI.removeDictionary(id);
      if (result.success) {
        fetchDictionaries();
      } else {
        alert("Failed to remove dictionary: " + result.error);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/20 p-2 rounded-lg">
              <Book className="w-6 h-6 text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Dictionaries</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar max-h-[60vh]">
          {dictionaries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Book className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">No dictionaries installed</p>
              <p className="text-sm">Import a Yomitan ZIP dictionary to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dictionaries.map(dict => (
                <div key={dict.id} className="flex items-center justify-between p-4 bg-gray-800/50 border border-gray-700 rounded-xl hover:border-gray-600 transition-colors">
                  <div>
                    <h3 className="font-medium text-lg">{dict.title}</h3>
                    <p className="text-sm text-gray-400">{dict.term_count.toLocaleString()} terms</p>
                  </div>
                  <button 
                    onClick={() => handleRemove(dict.id)}
                    className="p-3 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Remove Dictionary"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800 bg-gray-900/50 flex justify-end">
          <button 
            onClick={handleImport}
            disabled={isImporting}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed px-6 py-3 rounded-xl transition-colors font-medium shadow-lg shadow-blue-900/20"
          >
            {isImporting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                Add Dictionary
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default DictionaryManager;
