// Logo DANZI. Aproximação em SVG da marca (borboleta coral) + wordmark.
// Para usar o arquivo oficial, troque o <svg> por <img src="/logo.png" />.

export function Logo({
  compact = false,
  size = "sm",
}: {
  compact?: boolean;
  size?: "sm" | "lg";
}) {
  const lg = size === "lg";
  const dim = lg ? 52 : 30;
  return (
    <div className={`flex items-center ${lg ? "gap-3.5" : "gap-2.5"}`}>
      <svg
        width={dim}
        height={dim}
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
        <span
          className={`font-semibold text-brand ${
            lg ? "text-3xl tracking-[0.4em]" : "text-lg tracking-[0.35em]"
          }`}
        >
          DANZI
        </span>
      )}
    </div>
  );
}
