import type { ComponentProps } from "react";

const icons = {
  pulse: (
    <>
      <path d="M2 12h4l3-8 5 16 3-8h5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  event: (
    <>
      <path d="M7 3h10v18H7z" />
      <path d="M10 8h4m-4 4h4m-4 4h2" />
    </>
  ),
  scenario: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
      <path d="M6 9v9h9m-4-4 4 4-4 4" />
    </>
  ),
  plan: (
    <>
      <path d="M4 5h16M4 12h16M4 19h16" />
      <circle cx="8" cy="5" r="2" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="19" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  history: (
    <>
      <path d="M3 5v5h5" />
      <path d="M4 9a8 8 0 1 1 0 7" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" fill="var(--card)" />
      <circle cx="16" cy="17" r="3" fill="var(--card)" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  chevron: (
    <>
      <path d="m8 10 4 4 4-4" />
    </>
  ),
  right: (
    <>
      <path d="m9 6 6 6-6 6" />
    </>
  ),
  left: (
    <>
      <path d="m15 6-6 6 6 6" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </>
  ),
  play: (
    <>
      <path d="m8 5 11 7-11 7z" />
    </>
  ),
  stop: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h12l4 4v14H3V3z" />
      <path d="M7 3v6h9V3M7 21v-8h10v8" />
    </>
  ),
  check: (
    <>
      <path d="m5 12 4 4 10-10" />
    </>
  ),
  x: (
    <>
      <path d="m6 6 12 12M6 18 18 6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  message: (
    <>
      <path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z" />
      <path d="M7 8h10M7 12h6" />
    </>
  ),
  hash: (
    <>
      <path d="M10 3 8 21M16 3l-2 18M4 9h16M3 15h16" />
    </>
  ),
  code: (
    <>
      <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16" />
    </>
  ),
  book: (
    <>
      <path d="M12 5c-3-3-7-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-2-10 1Zm0 0v15" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  link: (
    <>
      <path
        d="m10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4m12 0 2-2a4 4 0 0 1 6 6l-4 4"
        transform="translate(1 -1) scale(.92)"
      />
    </>
  ),
  up: (
    <>
      <path d="m6 14 6-6 6 6" />
    </>
  ),
  down: (
    <>
      <path d="m6 10 6 6 6-6" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
    </>
  ),
  parallel: (
    <>
      <path d="M3 7h18m-4-4 4 4-4 4M3 17h18m-4-4 4 4-4 4" />
    </>
  ),
  serial: (
    <>
      <path d="M3 5h15a3 3 0 0 1 0 6H6a3 3 0 0 0 0 6h15m-4-4 4 4-4 4" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  star: (
    <>
      <path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" />
    </>
  ),
  folder: (
    <>
      <path d="M3 5h6l2 3h10v12H3z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
};
export type StudioIconName = keyof typeof icons;
export function StudioIcon({
  name,
  ...props
}: ComponentProps<"svg"> & { name: StudioIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {icons[name]}
    </svg>
  );
}
