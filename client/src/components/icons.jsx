// A small, fully custom icon set — no external icon library. Every icon
// shares the same 20x20 grid, 1.6px stroke, round caps/joins, so the set
// reads as one designed family instead of a mix of borrowed styles.
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const IconLink = (p) => (
  <svg {...base} {...p}>
    <path d="M8 12l4-4" />
    <path d="M7.5 5.5l1-1a3 3 0 0 1 4.24 0l.76.76a3 3 0 0 1 0 4.24l-1 1" />
    <path d="M12.5 14.5l-1 1a3 3 0 0 1-4.24 0l-.76-.76a3 3 0 0 1 0-4.24l1-1" />
  </svg>
);

export const IconMonitor = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="14" height="9" rx="1.4" />
    <path d="M7 17h6" />
    <path d="M10 13v4" />
  </svg>
);

export const IconLock = (p) => (
  <svg {...base} {...p}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.6" />
    <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
  </svg>
);

export const IconUnlock = (p) => (
  <svg {...base} {...p}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.6" />
    <path d="M6.5 9V6.5a3.5 3.5 0 0 1 6.4-1.9" />
  </svg>
);

export const IconChat = (p) => (
  <svg {...base} {...p}>
    <path d="M3.5 5.5h13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9l-3.5 3v-3h-2a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z" />
  </svg>
);

export const IconFiles = (p) => (
  <svg {...base} {...p}>
    <path d="M3 6.5a1 1 0 0 1 1-1h3.5l1.3 1.6H16a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
  </svg>
);

export const IconClipboard = (p) => (
  <svg {...base} {...p}>
    <rect x="5" y="4.5" width="10" height="13" rx="1.4" />
    <path d="M7.8 4.5a2.2 2.2 0 0 1 4.4 0" />
    <path d="M7.5 9.5h5M7.5 12.5h5" />
  </svg>
);

export const IconCamera = (p) => (
  <svg {...base} {...p}>
    <path d="M3.5 7.2A1.2 1.2 0 0 1 4.7 6h1.6l.9-1.4h5.6L13.7 6h1.6a1.2 1.2 0 0 1 1.2 1.2V14a1.2 1.2 0 0 1-1.2 1.2H4.7A1.2 1.2 0 0 1 3.5 14z" />
    <circle cx="10" cy="10.4" r="2.6" />
  </svg>
);

export const IconActivity = (p) => (
  <svg {...base} {...p}>
    <path d="M3 10.5h3l1.8-5 2.4 9 1.8-6 1.2 2h3.8" />
  </svg>
);

export const IconSettings = (p) => (
  <svg {...base} {...p}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 3.5v1.6M10 14.9v1.6M16.5 10h-1.6M5.1 10H3.5M14.6 5.4l-1.1 1.1M6.5 13.5l-1.1 1.1M14.6 14.6l-1.1-1.1M6.5 6.5 5.4 5.4" />
  </svg>
);

export const IconPower = (p) => (
  <svg {...base} {...p}>
    <path d="M10 3.5v6" />
    <path d="M6 5.8a6 6 0 1 0 8 0" />
  </svg>
);

export const IconExpand = (p) => (
  <svg {...base} {...p}>
    <path d="M7 3.5H3.5V7M13 3.5h3.5V7M7 16.5H3.5V13M13 16.5h3.5V13" />
  </svg>
);

export const IconMinus = (p) => (
  <svg {...base} {...p}><path d="M4.5 10h11" /></svg>
);

export const IconClose = (p) => (
  <svg {...base} {...p}><path d="M5 5l10 10M15 5L5 15" /></svg>
);
