export function Brand() {
  return (
    <div
      className="flex items-center gap-2.5 select-none"
      role="img"
      aria-label="DuDu Admin"
    >
      <span className="brand-mark" aria-hidden="true">
        D
      </span>
      <span className="text-xl font-bold tracking-tight">
        DuDu <span className="text-xs font-semibold text-primary">ADMIN</span>
      </span>
    </div>
  );
}
