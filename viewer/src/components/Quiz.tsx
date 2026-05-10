import React, { useState, useEffect, useRef } from 'react';
import { BrainCircuit, Loader2, CheckCircle2, XCircle, HelpCircle, ArrowRight, BookOpen, MessageSquare, ArrowLeftRight } from 'lucide-react';

type QuizMode = 'word' | 'sentence';

const Quiz: React.FC = () => {
  const [words, setWords] = useState<any[]>([]);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [translation, setTranslation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ correct: boolean | null, score?: number, feedback: string, corrections?: string } | null>(null);
  const [mode, setMode] = useState<QuizMode | null>(null); // null means we are on the selection screen
  const [stats, setStats] = useState<{ current_streak: number, best_streak: number } | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [isGeneratingSentence, setIsGeneratingSentence] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  const init = async (selectedMode: QuizMode) => {
    if ((window as any).electronAPI) {
      const s = await (window as any).electronAPI.getSettings();
      setSettings(s);

      // Retrieve words with 'learning' status.
      let learningWords = await (window as any).electronAPI.getWordsByStatus('learning');
      
      // Filter word list based on the active quiz mode.
      if (selectedMode === 'sentence') {
        learningWords = learningWords.filter((w: any) => !!w.context_sentence);
      }

      // Inject random dictionary words if 'guess mode' is enabled.
      if (selectedMode === 'word' && s.quiz_guess_mode === 'true' && Math.random() > 0.7) {
        const randomWord = await (window as any).electronAPI.getRandomDictionaryWord();
        if (randomWord) {
          learningWords.push({
            ...randomWord,
            isGuess: true,
            status: 'new'
          });
        }
      }

      // Randomize the word list order.
      const shuffled = learningWords.sort(() => 0.5 - Math.random());
      setWords(shuffled);
      setMode(selectedMode);
    }
  };

  // Retrieve quiz statistics for the current word.
  useEffect(() => {
    const fetchStats = async () => {
      if ((window as any).electronAPI && words[currentWordIdx]) {
        const word = words[currentWordIdx];
        const s = await (window as any).electronAPI.getQuizStats(word.term, word.reading);
        setStats(s || { current_streak: 0, best_streak: 0 });
      }
    };
    if (mode) fetchStats();
  }, [currentWordIdx, words, mode]);

  // Automatically focus the input field when transitioning to the next word.
  useEffect(() => {
    if (mode && !result && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentWordIdx, result, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!translation.trim() || isSubmitting || !mode) return;

    setIsSubmitting(true);
    setResult(null);

    const currentWord = words[currentWordIdx];

    try {
      if ((window as any).electronAPI) {
        const contextToPass = mode === 'sentence' ? currentWord.context_sentence : null;
        
        const response = await (window as any).electronAPI.evaluateTranslation(
          currentWord.term,
          currentWord.reading,
          translation,
          mode,
          contextToPass
        );
        
        setResult({
          correct: response.isCorrect,
          score: response.score,
          feedback: response.feedback,
          corrections: response.corrections
        });

        // Persist quiz results to the backend.
        await (window as any).electronAPI.updateQuizStats(currentWord.term, currentWord.reading, response.isCorrect);
        
        // Synchronize local statistics with the backend.
        const newStats = await (window as any).electronAPI.getQuizStats(currentWord.term, currentWord.reading);
        setStats(newStats);
      }
    } catch (err: any) {
      setResult({
        correct: null,
        feedback: `Error: ${err.message}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    setTranslation('');
    setResult(null);
    setCurrentWordIdx(prev => (prev + 1) % words.length);
  };

  const handleGenerateSentence = async () => {
    if (isGeneratingSentence || !(window as any).electronAPI) return;
    setIsGeneratingSentence(true);
    try {
      const knownWords = await (window as any).electronAPI.getWordsByStatus('known');
      if (knownWords.length < 3) {
        alert("You need at least 3 'known' words to generate a sentence!");
        return;
      }
      
      const selection = knownWords.sort(() => 0.5 - Math.random()).slice(0, 5);
      const wordList = selection.map((w: any) => `${w.term} (${w.reading})`).join(', ');
      
      const prompt = `Create a natural Japanese sentence using some of these words: ${wordList}. 
The sentence should be suitable for a Japanese learner.
Respond with a JSON object:
{
  "sentence": "The Japanese sentence",
  "target_word": "One of the words used",
  "reading": "Reading of the target word"
}
Respond with ONLY JSON.`;

      const response = await (window as any).electronAPI.chatWithLLM([
        { role: "system", content: "You are a Japanese teacher creating practice sentences." },
        { role: "user", content: prompt }
      ]);

      if (response.success) {
        const jsonMatch = response.reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          const newWord = {
            term: data.target_word,
            reading: data.reading,
            context_sentence: data.sentence,
            isAI: true
          };
          setWords([newWord, ...words]);
          setCurrentWordIdx(0);
          setMode('sentence');
        }
      }
    } catch (err) {
      console.error("Failed to generate sentence:", err);
    } finally {
      setIsGeneratingSentence(false);
    }
  };

  if (!mode) {
    return (
      <div className="flex flex-col h-full bg-gray-950 text-white p-6 items-center justify-center overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl p-10 text-center">
          <BrainCircuit className="w-20 h-20 text-purple-500 mx-auto mb-6" />
          <h1 className="text-4xl font-bold mb-4">Choose Your Challenge</h1>
          <p className="text-gray-400 mb-10 text-lg">Select a quiz mode to test your knowledge.</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <button
              onClick={() => init('word')}
              className="flex flex-col items-center gap-4 p-8 bg-gray-800/50 hover:bg-blue-900/30 border border-gray-700 hover:border-blue-500/50 rounded-2xl transition-all group"
            >
              <div className="bg-blue-500/20 p-4 rounded-full group-hover:scale-110 transition-transform">
                <BookOpen className="w-10 h-10 text-blue-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Word Mode</h2>
                <p className="text-gray-400 text-sm">Translate individual words. Great for quick vocabulary building.</p>
              </div>
            </button>
            
            <button
              onClick={() => init('sentence')}
              className="flex flex-col items-center gap-4 p-8 bg-gray-800/50 hover:bg-purple-900/30 border border-gray-700 hover:border-purple-500/50 rounded-2xl transition-all group"
            >
              <div className="bg-purple-500/20 p-4 rounded-full group-hover:scale-110 transition-transform">
                <MessageSquare className="w-10 h-10 text-purple-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Sentence Mode</h2>
                <p className="text-gray-400 text-sm">Translate full sentences in context. Tests grammar and comprehension.</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-950 text-gray-500">
        <BrainCircuit className="w-16 h-16 mb-4 opacity-20" />
        <h2 className="text-2xl font-bold mb-2">No Words to Quiz</h2>
        <p>Mark some words as "Needs Work" in the reader to start quizzing!</p>
        <button 
          onClick={() => setMode(null)}
          className="mt-6 px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  const currentWord = words[currentWordIdx];
  const hasContext = !!currentWord.context_sentence;

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white p-6 items-center justify-center overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-3xl bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-800 bg-gray-800/30 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMode(null)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Back to Mode Selection"
            >
              <ArrowLeftRight className="w-5 h-5" />
            </button>
            <div className={`p-2 rounded-xl ${mode === 'word' ? 'bg-blue-500/20' : 'bg-purple-500/20'}`}>
              {mode === 'word' ? <BookOpen className="w-6 h-6 text-blue-400" /> : <MessageSquare className="w-6 h-6 text-purple-400" />}
            </div>
            <h2 className="text-xl font-bold">
              {mode === 'word' ? 'Word Quiz' : 'Sentence Quiz'}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            {settings.quiz_ai_sentences === 'true' && mode === 'sentence' && (
              <button
                onClick={handleGenerateSentence}
                disabled={isGeneratingSentence}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/30 disabled:opacity-50"
              >
                {isGeneratingSentence ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                AI Sentence
              </button>
            )}
            {stats && (
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-tighter">
                <span className="text-orange-400">Streak: {stats.current_streak}</span>
                <span className="text-gray-600">|</span>
                <span className="text-purple-400">Best: {stats.best_streak}</span>
              </div>
            )}
            <span className="text-sm font-medium text-gray-400 bg-gray-800 px-3 py-1 rounded-full shrink-0">
              {currentWordIdx + 1} / {words.length}
            </span>
          </div>
        </div>

        {/* Question Area */}
        <div className="p-10 flex flex-col items-center justify-center text-center min-h-[250px] relative overflow-hidden">
          {/* Decorative background blur */}
          <div className={`absolute inset-0 opacity-20 blur-3xl transition-colors duration-1000 ${mode === 'word' ? 'bg-blue-500' : 'bg-purple-500'}`} />
          
          <div className="relative z-10 w-full max-w-2xl">
            {currentWord.isGuess && (
              <div className="mb-4 inline-block bg-yellow-500/20 text-yellow-400 text-[10px] font-black uppercase px-2 py-0.5 rounded border border-yellow-500/30 tracking-widest">
                Guess Mode Challenge
              </div>
            )}
            {mode === 'sentence' && hasContext ? (
              <div className="space-y-6">
                <p className="text-sm font-semibold text-purple-400 uppercase tracking-widest">Translate this sentence</p>
                <h1 className="text-3xl sm:text-4xl font-bold text-white leading-relaxed">
                  {/* Apply visual highlighting to the target word within the sentence context. */}
                  {currentWord.context_sentence.split(currentWord.term).map((part: string, i: number, arr: any[]) => (
                    <React.Fragment key={i}>
                      {part}
                      {i < arr.length - 1 && <span className="text-purple-400 underline decoration-purple-500/50 underline-offset-4">{currentWord.term}</span>}
                    </React.Fragment>
                  ))}
                </h1>
                <p className="text-lg text-gray-400">Target word: {currentWord.term} ({currentWord.reading})</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-semibold text-blue-400 uppercase tracking-widest">Translate this word</p>
                <h1 className="text-6xl sm:text-7xl font-bold text-white tracking-wider">{currentWord.term}</h1>
                <p className="text-2xl text-gray-400">{currentWord.reading}</p>
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 bg-gray-800/30 border-t border-gray-800">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              ref={inputRef}
              type="text"
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              disabled={isSubmitting || result !== null}
              placeholder={mode === 'sentence' ? "Type the full English translation..." : "Type the English meaning..."}
              className="w-full bg-gray-950 border border-gray-700 rounded-xl px-6 py-5 text-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 transition-all disabled:opacity-50 shadow-inner"
            />
            
            {!result ? (
              <button
                type="submit"
                disabled={!translation.trim() || isSubmitting}
                className={`w-full font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg ${
                  mode === 'word' 
                    ? 'bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50' 
                    : 'bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50'
                } disabled:cursor-not-allowed text-white`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Evaluating with AI...
                  </>
                ) : (
                  'Submit Answer'
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg group"
                autoFocus
              >
                Next Challenge
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            )}
          </form>
        </div>

        {/* Result Area */}
        {result && (
          <div className={`p-6 border-t transition-all duration-500 ${
            result.correct === true ? 'bg-green-900/20 border-green-900/50' : 
            result.correct === false ? 'bg-red-900/20 border-red-900/50' : 
            'bg-yellow-900/20 border-yellow-900/50'
          }`}>
            <div className="flex items-start gap-4">
              <div className="shrink-0 mt-1">
                {result.correct === true ? <CheckCircle2 className="w-8 h-8 text-green-400" /> :
                 result.correct === false ? <XCircle className="w-8 h-8 text-red-400" /> :
                 <HelpCircle className="w-8 h-8 text-yellow-400" />}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-2">
                  <h3 className={`font-bold text-xl ${
                    result.correct === true ? 'text-green-400' : 
                    result.correct === false ? 'text-red-400' : 
                    'text-yellow-400'
                  }`}>
                    {result.correct === true ? 'Excellent!' : 
                     result.correct === false ? 'Not quite right.' : 
                     'Close, but needs review.'}
                  </h3>
                  {result.score !== undefined && (
                    <span className={`text-sm font-black px-2 py-1 rounded ${
                      result.score >= 80 ? 'bg-green-500/20 text-green-400' :
                      result.score >= 50 ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      SCORE: {result.score}%
                    </span>
                  )}
                </div>
                <p className="text-gray-300 leading-relaxed text-lg mb-4">{result.feedback}</p>
                
                {result.corrections && (
                  <div className="bg-gray-950/50 p-4 rounded-xl border border-gray-800/50">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Suggested Translation</p>
                    <p className="text-white font-medium">{result.corrections}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Quiz;
