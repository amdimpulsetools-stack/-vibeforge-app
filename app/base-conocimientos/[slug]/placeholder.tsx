export function Placeholder({ label }: { label: string }) {
  return (
    <div className="my-6 aspect-[16/9] rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
      <div className="text-center">
        <svg className="h-10 w-10 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}
