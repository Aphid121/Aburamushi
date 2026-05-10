import React, { useState, useEffect, useRef } from 'react';
import { Search as SearchIcon, Loader2, Book } from 'lucide-react';

const Search: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim() === '') {
        setResults([]);
        return;
      }

      setIsSearching(true);
      try {
        if ((window as any).electronAPI) {
          const searchResults = await (window as any).electronAPI.searchDictionary(query);
          setResults(searchResults || []);
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white p-6 items-center">
      <div className="w-full max-w-4xl flex flex-col h-full">
        
        {/* Search Header */}
        <div className="mb-8 shrink-0">
          <h1 className="text-3xl font-bold mb-6 flex items-center gap-3">
            <SearchIcon className="w-8 h-8 text-blue-400" />
            Dictionary Search
          </h1>
          
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              {isSearching ? (
                <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
              ) : (
                <SearchIcon className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in Romaji, Hiragana, Katakana, or Kanji..."
              className="w-full bg-gray-900 border border-gray-800 rounded-2xl py-5 pl-14 pr-6 text-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 transition-all shadow-inner"
            />
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6 pb-8">
          {query.trim() === '' ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-600">
              <Book className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-xl">Type something to search your installed dictionaries.</p>
            </div>
          ) : results.length === 0 && !isSearching ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-600">
              <SearchIcon className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-xl">No results found for "{query}".</p>
            </div>
          ) : (
            results.map((result, idx) => (
              <div key={idx} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-lg">
                <div className="p-5 border-b border-gray-800 bg-gray-800/30">
                  <h2 className="text-3xl font-bold text-blue-400 mb-1">{result.term}</h2>
                  <p className="text-lg text-gray-400">{result.reading}</p>
                </div>
                
                <div className="p-5 space-y-4">
                  {result.definitions.map((def: any, dIdx: number) => {
                    // Try to parse Yomitan structured definitions
                    let defStrings: string[] = [];
                    try {
                      const parsed = JSON.parse(def.definition);
                      const extractText = (node: any): string => {
                        if (typeof node === 'string') return node;
                        if (typeof node === 'number') return String(node);
                        if (!node) return '';
                        if (Array.isArray(node)) return node.map(extractText).join('');
                        if (typeof node === 'object') {
                          if (node.type === 'image') return '[Image]';
                          if (node.tag === 'br') return '\n';
                          if (node.tag === 'li') return '• ' + extractText(node.content) + '\n';
                          if (node.text !== undefined) return extractText(node.text);
                          if (node.content !== undefined) return extractText(node.content);
                        }
                        return '';
                      };

                      if (Array.isArray(parsed)) {
                        defStrings = parsed.map(item => extractText(item).trim()).filter(s => s.length > 0);
                      } else {
                        const text = extractText(parsed).trim();
                        if (text) defStrings.push(text);
                      }
                      if (defStrings.length === 0 && parsed && typeof parsed === 'object') {
                        defStrings.push(JSON.stringify(parsed));
                      }
                    } catch (e) {
                      defStrings = [def.definition];
                    }

                    return (
                      <div key={dIdx} className="bg-gray-800/30 rounded-xl border border-gray-700/50 overflow-hidden">
                        <div className="bg-gray-800/80 px-3 py-2 border-b border-gray-700/50 flex items-center gap-2">
                          <Book className="w-4 h-4 text-blue-400" />
                          <span className="text-xs font-semibold text-gray-300">{def.dict_title || 'Unknown Dictionary'}</span>
                        </div>
                        <div className="p-4">
                          <ul className="space-y-3">
                            {defStrings.map((str, sIdx) => (
                              <li key={sIdx} className="text-gray-300 flex gap-3">
                                <span className="text-gray-600 select-none shrink-0 font-medium">{sIdx + 1}.</span>
                                <span className="break-words whitespace-pre-wrap leading-relaxed">{str}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Search;
