// Logo DANZI. Aproximação em SVG da marca (borboleta coral) + wordmark.
// Para usar o arquivo oficial, troque o <svg> por <img src="/logo.png" />.

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width="30"
        height="30"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M20 20c-8-11-17-8-15 0 1 5 8 6 15 0zm0 0c-8 11-17 8-15 0m15 0c8-11 17-8 15 0-1 5-8 6-15 0zm0 0c8 11 17 8 15 0"
          stroke="var(--color-brand)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <span className="text-lg font-semibold tracking-[0.35em] text-brand">
          DANZI
        </span>
      )}
    </div>
  );
}
