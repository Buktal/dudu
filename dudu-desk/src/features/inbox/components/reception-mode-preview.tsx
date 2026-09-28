import type { ReceptionMode } from "@/lib/reception-mode";

/** A small map of the actual queue / conversation arrangement in each mode. */
export function ReceptionModePreview({ mode }: { mode: ReceptionMode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 144 76"
      preserveAspectRatio="xMinYMid meet"
      className="h-14 w-full max-w-44"
    >
      <rect
        x="0.5"
        y="0.5"
        width="143"
        height="75"
        rx="8"
        className="fill-background stroke-border"
      />
      <path
        d="M10 9h20m84 0h20"
        className="stroke-border"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {mode === "quick" ? (
        [
          { x: 8, y: 18 },
          { x: 75, y: 18 },
          { x: 8, y: 46 },
          { x: 75, y: 46 },
        ].map(({ x, y }) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
            <rect
              width="61"
              height="23"
              rx="3"
              className="fill-card stroke-border"
            />
            <rect
              x="4"
              y="4"
              width="7"
              height="7"
              rx="2"
              className="fill-sidebar-accent"
            />
            <path
              d="M16 6h20M5 17h38"
              className="stroke-border"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <rect
              x="49"
              y="14"
              width="7"
              height="5"
              rx="1.5"
              className="fill-primary"
            />
          </g>
        ))
      ) : (
        <>
          <rect
            x="8"
            y="18"
            width="26"
            height="51"
            rx="3"
            className="fill-muted"
          />
          <rect
            x="11"
            y="24"
            width="20"
            height="9"
            rx="2"
            className="fill-sidebar-accent"
          />
          <path
            d="M13 40h16m-16 9h16m-16 9h12"
            className="stroke-border"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect
            x="39"
            y="18"
            width={mode === "parallel" ? 44 : 97}
            height="51"
            rx="3"
            className="fill-card stroke-border"
          />
          <rect
            x="44"
            y="24"
            width={mode === "parallel" ? 19 : 36}
            height="8"
            rx="2"
            className="fill-muted"
          />
          <rect
            x={mode === "parallel" ? 56 : 93}
            y="37"
            width={mode === "parallel" ? 21 : 37}
            height="8"
            rx="2"
            className="fill-sidebar-accent"
          />
          <rect
            x="44"
            y="54"
            width={mode === "parallel" ? 34 : 87}
            height="10"
            rx="2"
            className="fill-muted"
          />
          {mode === "parallel" && (
            <>
              <rect
                x="89"
                y="18"
                width="47"
                height="51"
                rx="3"
                className="fill-sidebar-accent stroke-border"
              />
              <path
                d="M112 24v5m-4-5h8m-6 2-2 6h8l-2-6m-2 6v5"
                className="stroke-primary"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <rect
                x="94"
                y="42"
                width="26"
                height="6"
                rx="2"
                className="fill-card"
              />
              <rect
                x="94"
                y="54"
                width="37"
                height="10"
                rx="2"
                className="fill-card"
              />
            </>
          )}
        </>
      )}
    </svg>
  );
}
