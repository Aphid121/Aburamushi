import React, { useState, useEffect } from 'react';
import { TrendingUp, Award, BookOpen, CheckCircle2, Loader2 } from 'lucide-react';

const Progress: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<number>(30); // Default to 30 days

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      if ((window as any).electronAPI) {
        const res = await (window as any).electronAPI.getMasteryProgress(timeRange);
        setData(res);
      }
      setLoading(false);
    };
    fetchData();
  }, [timeRange]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const totalsMap = data.totals.reduce((acc: any, curr: any) => {
    acc[curr.status] = curr.count;
    return acc;
  }, {});

  const maxDaily = Math.max(...data.daily.map((d: any) => d.count), 1);

  const timeRanges = [
    { label: '24 Hours', value: 1 },
    { label: '7 Days', value: 7 },
    { label: '1 Month', value: 30 },
    { label: '3 Months', value: 90 },
    { label: '6 Months', value: 180 },
    { label: '1 Year', value: 365 },
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto h-full overflow-y-auto custom-scrollbar space-y-8">
      <h1 className="text-3xl font-bold text-white mb-8">Learning Progress</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl flex items-center gap-4">
          <div className="bg-blue-500/20 p-3 rounded-xl">
            <BookOpen className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Seen</p>
            <p className="text-2xl font-bold text-white">{totalsMap['seen'] || 0}</p>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl flex items-center gap-4">
          <div className="bg-red-500/20 p-3 rounded-xl">
            <TrendingUp className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Learning</p>
            <p className="text-2xl font-bold text-white">{totalsMap['learning'] || 0}</p>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl flex items-center gap-4">
          <div className="bg-green-500/20 p-3 rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Mastered</p>
            <p className="text-2xl font-bold text-white">{totalsMap['known'] || 0}</p>
          </div>
        </div>
      </div>

      {/* Mastery Chart */}
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl relative">
        {loading && (
          <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-3xl">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 text-yellow-400" />
            <h2 className="text-xl font-bold text-white">Mastery Over Time</h2>
          </div>
          
          <div className="flex bg-gray-950 border border-gray-800 rounded-lg p-1 overflow-x-auto custom-scrollbar">
            {timeRanges.map(range => (
              <button
                key={range.value}
                onClick={() => setTimeRange(range.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  timeRange === range.value 
                    ? 'bg-gray-800 text-white shadow-sm' 
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="h-48 flex items-end gap-1 sm:gap-2">
          {data.daily.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-gray-600 italic">
              No words mastered in this time range. Keep studying!
            </div>
          ) : (
            data.daily.map((d: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col items-center group relative">
                <div 
                  className="w-full bg-green-500/40 hover:bg-green-500/60 rounded-t-sm transition-all duration-500"
                  style={{ height: `${(d.count / maxDaily) * 100}%` }}
                />
                <div className="absolute bottom-full mb-2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  {d.day}: {d.count} words
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-between mt-4 text-[10px] font-bold text-gray-600 uppercase tracking-widest">
          <span>{timeRanges.find(r => r.value === timeRange)?.label} Ago</span>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
};

export default Progress;
