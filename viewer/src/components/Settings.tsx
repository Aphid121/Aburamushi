import React, { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdvancedLLM, setShowAdvancedLLM] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      if ((window as any).electronAPI) {
        const data = await (window as any).electronAPI.getSettings();
        setSettings(data || {});
      }
      setLoading(false);
    };
    loadSettings();
  }, []);

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!(window as any).electronAPI) return;
    setSaving(true);
    for (const [key, value] of Object.entries(settings)) {
      await (window as any).electronAPI.updateSetting(key, value);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto h-full overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>

      <div className="space-y-8">
        {/* LLM Settings */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">LLM Integration</h2>
            <button
              onClick={() => setShowAdvancedLLM(!showAdvancedLLM)}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {showAdvancedLLM ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">LLM API Endpoint</label>
              <input
                type="text"
                value={settings['llm_endpoint'] || 'http://localhost:5000/v1/chat/completions'}
                onChange={(e) => handleChange('llm_endpoint', e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="http://localhost:5000/v1/chat/completions"
              />
              <p className="text-xs text-gray-500 mt-1">The endpoint used for evaluating translations and analyzing images.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">LLM Model Name</label>
              <input
                type="text"
                value={settings['llm_model'] || 'gemini-2.5-pro'}
                onChange={(e) => handleChange('llm_model', e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="gemini-2.5-pro"
              />
              <p className="text-xs text-gray-500 mt-1">The model name to request from the API (required for OpenAI-compatible endpoints).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Assistant System Prompt</label>
              <textarea
                value={settings['llm_system_prompt'] || 'You are a helpful Japanese translation teacher.'}
                onChange={(e) => handleChange('llm_system_prompt', e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors min-h-[100px] custom-scrollbar"
                placeholder="You are a helpful Japanese translation teacher."
              />
              <p className="text-xs text-gray-500 mt-1">The system prompt used when chatting with the Assistant in the reader.</p>
            </div>
            
            {showAdvancedLLM && (
              <div className="pt-4 mt-4 border-t border-gray-800 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Max Tokens</label>
                    <input
                      type="number"
                      value={settings['llm_max_tokens'] || '1000'}
                      onChange={(e) => handleChange('llm_max_tokens', e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="1000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Temperature</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="2"
                      value={settings['llm_temperature'] || '0.7'}
                      onChange={(e) => handleChange('llm_temperature', e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                      placeholder="0.7"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Top P</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={settings['llm_top_p'] || '1.0'}
                    onChange={(e) => handleChange('llm_top_p', e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="1.0"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Reader Settings */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Reader Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Popup Base Scale Multiplier</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="2.0"
                value={settings['popup_base_scale'] || '0.45'}
                onChange={(e) => handleChange('popup_base_scale', e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1">Adjusts the default size of the dictionary popup (Default: 0.45).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Page Spacing (Infinite Modes)</label>
              <div className="flex items-center gap-4">
                <input 
                  type="number" 
                  min="0" 
                  max="500" 
                  step="1"
                  value={settings['infinite_page_spacing'] || '0'} 
                  onChange={(e) => handleChange('infinite_page_spacing', e.target.value)}
                  className="w-24 bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-blue-500 transition-colors font-mono"
                />
                <span className="text-gray-400 text-sm">px</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">The gap between pages in Infinite Vertical and Infinite Horizontal modes.</p>
            </div>
          </div>
        </div>

        {/* Sticky Note Settings */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Sticky Notes</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Default Font Size (cqw)</label>
              <input 
                type="number" 
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                value={settings['sticky_note_font_size'] || '1.5'}
                onChange={(e) => handleChange('sticky_note_font_size', e.target.value)}
                min="0.1" max="10" step="0.1"
              />
              <p className="text-xs text-gray-500 mt-1">Font size is relative to the note's width (Container Query Width).</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Default Font Family</label>
              <select 
                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                value={settings['sticky_note_font_family'] || 'sans-serif'}
                onChange={(e) => handleChange('sticky_note_font_family', e.target.value)}
              >
                <option value="sans-serif">Sans-serif</option>
                <option value="serif">Serif</option>
                <option value="monospace">Monospace</option>
                <option value="cursive">Cursive</option>
              </select>
            </div>
          </div>
        </div>

        {/* Learning Thresholds */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Learning Thresholds</h2>
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="auto_needs_work"
                checked={settings['auto_needs_work'] === 'true'}
                onChange={(e) => handleChange('auto_needs_work', e.target.checked ? 'true' : 'false')}
                className="w-5 h-5 rounded border-gray-700 bg-gray-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
              />
              <label htmlFor="auto_needs_work" className="text-sm font-medium text-gray-300">
                Auto-mark as "Needs Work" (Red)
              </label>
            </div>
            <p className="text-xs text-gray-500 ml-8 -mt-4">If enabled, looking up a word automatically marks it as "Needs Work" when it hits the strike threshold.</p>

            <div className="grid grid-cols-2 gap-6 ml-8">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Max Strikes Threshold</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings['max_strikes'] || '5'}
                  onChange={(e) => handleChange('max_strikes', e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">Number of lookups before a word is marked "Needs Work".</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Strike Decay Rate (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={settings['strike_decay_minutes'] || '1440'}
                  onChange={(e) => handleChange('strike_decay_minutes', e.target.value)}
                  className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
                <p className="text-xs text-gray-500 mt-1">How many minutes must pass before a strike is removed (Default: 1440 = 24 hours).</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quiz Settings */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Quiz Settings</h2>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="quiz_guess_mode"
                checked={settings['quiz_guess_mode'] === 'true'}
                onChange={(e) => handleChange('quiz_guess_mode', e.target.checked ? 'true' : 'false')}
                className="w-5 h-5 rounded border-gray-700 bg-gray-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
              />
              <label htmlFor="quiz_guess_mode" className="text-sm font-medium text-gray-300">
                Enable "Guess Mode"
              </label>
            </div>
            <p className="text-xs text-gray-500 ml-8">Occasionally quiz random dictionary words you haven't seen yet. AI will provide etymology and facts!</p>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="quiz_ai_sentences"
                checked={settings['quiz_ai_sentences'] === 'true'}
                onChange={(e) => handleChange('quiz_ai_sentences', e.target.checked ? 'true' : 'false')}
                className="w-5 h-5 rounded border-gray-700 bg-gray-950 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900"
              />
              <label htmlFor="quiz_ai_sentences" className="text-sm font-medium text-gray-300">
                Enable AI Sentence Generation
              </label>
            </div>
            <p className="text-xs text-gray-500 ml-8">Allows manually requesting the AI to build a challenge sentence using your "Known" words.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
