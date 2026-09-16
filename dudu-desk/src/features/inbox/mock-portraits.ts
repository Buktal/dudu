const portraitColors = [
  ["#e8c5b0", "#edc2a5", "#49372f", "#f8f3df"],
  ["#c8d8cd", "#dfb497", "#383b32", "#485952"],
  ["#d4cde8", "#ecc7b6", "#6b5047", "#f2f3e9"],
  ["#e8d9b5", "#edc5a7", "#3f3431", "#56728e"],
  ["#bbd3e1", "#c78e70", "#3d393d", "#eee1cd"],
  ["#e7c6c8", "#e9bba3", "#665143", "#9d6157"],
  ["#d9dfc7", "#e6bc9c", "#43423c", "#677754"],
  ["#d1dee5", "#bd886b", "#302e31", "#c9b9a6"],
] as const;

/** Local, deterministic fixture portraits; no external images or prototype imports. */
export function developmentPortrait(index: number): string {
  const [background, skin, hair, clothing] =
    portraitColors[index % portraitColors.length];
  const fringe =
    index % 2
      ? "M18 28V20C18 5 44 4 47 20c-12 1-15-4-20-7-1 8-5 12-9 15Z"
      : "M17 29V18C19 3 46 6 47 23c-9-3-13-9-15-11-3 9-9 14-15 17Z";
  const glasses =
    index % 4 === 1
      ? `<path d="M21 27h10v7H21Zm13 0h10v7H34Zm-3 2h3" fill="none" stroke="${hair}" stroke-width="1.2"/>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="${background}"/>
    <circle cx="51" cy="13" r="24" fill="#ffffff" opacity=".16"/>
    <path d="M12 66c1-16 9-24 20-24s20 8 21 24" fill="${clothing}"/>
    <path d="M26 38h12v12c-4 4-8 4-12 0Z" fill="${skin}"/>
    <ellipse cx="32" cy="28" rx="16" ry="20" fill="${hair}"/>
    <ellipse cx="32" cy="29" rx="12.7" ry="16" fill="${skin}"/>
    <path d="${fringe}" fill="${hair}"/>
    <path d="M25 29h1m12 0h1" stroke="#514236" stroke-width="2" stroke-linecap="round"/>
    <path d="M29 37q3 3 7-1" stroke="#ae7463" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    ${glasses}
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
