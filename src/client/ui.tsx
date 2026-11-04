"use client";
// Small shared pieces of Scene's chrome: the mark and a handful of outline icons (one set, 1.5px stroke).

/** Scene's mark: the round table from above, lit amber, with friends seated around it. */
export function Mark({ label = true }: { label?: boolean }) {
  return (
    <span className="mark">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="6.2" fill="#f2b33d" />
        <circle cx="12" cy="2.6" r="2" fill="#fff" />
        <circle cx="20.1" cy="16.7" r="2" fill="#fff" />
        <circle cx="3.9" cy="16.7" r="2" fill="#fff" />
      </svg>
      {label && "Scene"}
    </span>
  );
}

const paths: Record<string, string> = {
  addFriend: "M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M16 11h6",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4",
  keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3M6 11a6 6 0 0 0 12 0M12 17v4",
  close: "M6 6l12 12M18 6L6 18",
  play: "M8 5v14l11-7z",
  copy: "M9 9h11v11H9zM5 15V4h11",
  chevron: "M6 15l6-6 6 6",
  back: "M15 5l-7 7 7 7",
  room: "M4 21V10.5L12 4l8 6.5V21M9.5 21v-6.5h5V21",
};

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
