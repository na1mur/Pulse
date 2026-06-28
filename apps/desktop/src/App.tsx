import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
          Pulse
        </h1>
        <p className="text-sm text-slate-400 mb-6 text-center">
          Productivity Timer App (Desktop)
        </p>

        <div className="flex flex-col items-center justify-center bg-slate-950 border border-slate-800 rounded-xl p-6 w-full mb-6">
          <span className="text-5xl font-mono tracking-wider font-semibold text-purple-400">
            00:00:00
          </span>
          <span className="text-xs text-slate-500 mt-2 uppercase tracking-widest">
            Local Timer
          </span>
        </div>

        <div className="flex gap-4 w-full">
          <button
            onClick={() => setCount((c) => c + 1)}
            className="flex-1 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-medium transition duration-200 shadow-lg shadow-purple-600/20"
          >
            Count: {count}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
