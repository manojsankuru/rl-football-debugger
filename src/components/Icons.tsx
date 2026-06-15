// Icons.tsx — inline SVG glyphs (no icon-font dependency). 1em, currentColor.
import React from "react";

type P = { size?: number; className?: string };
const S = (size = 16): React.CSSProperties => ({ width: size, height: size });

export const Play = ({ size, className }: P) => (
  <svg viewBox="0 0 16 16" style={S(size)} className={className} fill="currentColor">
    <path d="M4 3.2v9.6a.5.5 0 0 0 .77.42l7.2-4.8a.5.5 0 0 0 0-.84l-7.2-4.8A.5.5 0 0 0 4 3.2z" />
  </svg>
);

export const Pause = ({ size, className }: P) => (
  <svg viewBox="0 0 16 16" style={S(size)} className={className} fill="currentColor">
    <rect x="3.5" y="3" width="3" height="10" rx="1" />
    <rect x="9.5" y="3" width="3" height="10" rx="1" />
  </svg>
);

export const Step = ({ size, className }: P) => (
  <svg viewBox="0 0 16 16" style={S(size)} className={className} fill="currentColor">
    <path d="M3 3.4v9.2a.5.5 0 0 0 .78.41L9 9.1v3.5a.5.5 0 0 0 .78.41l5-4.6a.5.5 0 0 0 0-.74l-5-4.6A.5.5 0 0 0 9 3.4v3.5L3.78 3A.5.5 0 0 0 3 3.4z" />
  </svg>
);

export const Reset = ({ size, className }: P) => (
  <svg viewBox="0 0 16 16" style={S(size)} className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 8a5 5 0 1 1-1.6-3.7" />
    <path d="M13 2.5V5h-2.5" />
  </svg>
);

export const Dot = ({ size, className }: P) => (
  <svg viewBox="0 0 16 16" style={S(size)} className={className} fill="currentColor">
    <circle cx="8" cy="8" r="4" />
  </svg>
);
