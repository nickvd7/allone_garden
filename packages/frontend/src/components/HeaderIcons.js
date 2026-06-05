import React from 'react';

function SvgIcon({ children, label }) {
  return (
    <svg
      className="header-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconWorld() {
  return (
    <SvgIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </SvgIcon>
  );
}

export function IconChat() {
  return (
    <SvgIcon>
      <path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V7a2 2 0 0 1 2-2z" />
      <path d="M8 10h8M8 13h5" />
    </SvgIcon>
  );
}

export function IconBell() {
  return (
    <SvgIcon>
      <path d="M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </SvgIcon>
  );
}

export function IconProfile() {
  return (
    <SvgIcon>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-3.5 4.5-5 7-5s5.5 1.5 7 5" />
    </SvgIcon>
  );
}

export function IconAdmin() {
  return (
    <SvgIcon>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </SvgIcon>
  );
}
