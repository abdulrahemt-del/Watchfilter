export default function Loading() {
  return (
    <div className="home-root" style={{ minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>

      {/* Header skeleton */}
      <div className="dash-deck-header">
        <div className="h-4 w-48 bg-slate-800 rounded animate-pulse" />
        <div className="flex items-center gap-3">
          <div className="h-4 w-24 bg-slate-800 rounded animate-pulse" />
          <div className="h-4 w-40 bg-slate-800 rounded animate-pulse" />
        </div>
        <div className="h-4 w-32 bg-slate-800 rounded animate-pulse" />
      </div>

      <div className="home-feed-section">
        {/* Tab bar skeleton */}
        <div className="home-tabs-bar">
          <div className="h-4 w-64 bg-slate-800 rounded animate-pulse" />
          <div className="h-4 w-32 bg-slate-800 rounded animate-pulse" />
        </div>

        <div className="px-6 pb-10 space-y-6">

          {/* Executive Summary skeleton */}
          <div className="bg-[#141a27] border border-slate-800/60 rounded-2xl px-7 py-6 space-y-4 animate-pulse">
            <div className="flex gap-2">
              <div className="h-3 w-36 bg-slate-700 rounded" />
              <div className="h-3 w-20 bg-slate-700 rounded" />
            </div>
            <div className="h-7 w-64 bg-slate-700 rounded" />
            <div className="flex gap-4">
              <div className="h-3 w-20 bg-slate-800 rounded" />
              <div className="h-3 w-20 bg-slate-800 rounded" />
              <div className="h-3 w-20 bg-slate-800 rounded" />
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full w-2/3 bg-gradient-to-r from-purple-800 to-blue-800 rounded-full" />
            </div>
          </div>

          {/* Most Important Insight skeleton */}
          <div className="bg-blue-950/30 border border-blue-900/40 rounded-2xl px-7 py-6 space-y-3 animate-pulse">
            <div className="h-3 w-36 bg-blue-900/60 rounded" />
            <div className="h-5 w-full bg-blue-900/40 rounded" />
            <div className="h-5 w-4/5 bg-blue-900/40 rounded" />
          </div>

          {/* Recommended Actions skeleton */}
          <div className="bg-[#141a27] border border-slate-800/60 rounded-2xl overflow-hidden animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-7 py-4 border-b border-slate-800/60 last:border-0">
                <div className="h-3 w-3 bg-emerald-800 rounded shrink-0" />
                <div className="h-3 w-full bg-slate-700 rounded" />
              </div>
            ))}
          </div>

          {/* Cluster cards skeleton */}
          {[1, 2].map((i) => (
            <div key={i} className="bg-[#141a27] border border-slate-800/60 rounded-2xl overflow-hidden animate-pulse">
              <div className="px-7 py-5 border-b border-slate-800/40 space-y-3">
                <div className="flex gap-2">
                  <div className="h-3 w-16 bg-slate-700 rounded" />
                  <div className="h-3 w-24 bg-slate-800 rounded" />
                </div>
                <div className="h-5 w-full bg-slate-700 rounded" />
              </div>
              <div className="px-7 py-4 space-y-2">
                <div className="h-3 w-48 bg-slate-800 rounded" />
                <div className="h-3 w-32 bg-slate-800 rounded" />
              </div>
            </div>
          ))}

          {/* Spinner */}
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <svg className="animate-spin w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Synthesizing intelligence from your video library…
          </div>

        </div>
      </div>
    </div>
  );
}
