// 工具栏 / 面板用的线性图标(16px,stroke = currentColor)
const P = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Icon = {
  topic: () => (
    <svg {...P}>
      <rect x="2" y="5" width="12" height="6" rx="2" />
    </svg>
  ),
  subtopic: () => (
    <svg {...P}>
      <rect x="1.5" y="2.5" width="7" height="4" rx="1.5" />
      <path d="M5 6.5V11.5H8.5" />
      <rect x="8.5" y="9.5" width="6" height="4" rx="1.5" />
    </svg>
  ),
  parent: () => (
    <svg {...P}>
      <rect x="7.5" y="2.5" width="7" height="4" rx="1.5" />
      <path d="M11 6.5V11.5H7.5" />
      <rect x="1.5" y="9.5" width="6" height="4" rx="1.5" />
    </svg>
  ),
  relationship: () => (
    <svg {...P}>
      <circle cx="3.5" cy="12" r="1.5" />
      <path d="M4.5 10.8C6 4 11 3 13 4.2" strokeDasharray="2 2" />
      <path d="M10.6 2.8L13.2 4.1L11.6 6.4" />
    </svg>
  ),
  summary: () => (
    <svg {...P}>
      <path d="M3 2.5C5 2.5 5 3.5 5 5V6.5C5 7.5 5.6 8 7 8C5.6 8 5 8.5 5 9.5V11C5 12.5 5 13.5 3 13.5" />
      <rect x="8.5" y="6" width="6" height="4" rx="1.5" />
    </svg>
  ),
  boundary: () => (
    <svg {...P}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2.5" strokeDasharray="2.4 1.8" />
      <rect x="4.5" y="6.5" width="7" height="3" rx="1" />
    </svg>
  ),
  marker: () => (
    <svg {...P}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.6 6.2L8.2 5V11" />
    </svg>
  ),
  note: () => (
    <svg {...P}>
      <rect x="3" y="1.5" width="10" height="13" rx="2" />
      <path d="M5.5 5H10.5M5.5 8H10.5M5.5 11H8.5" />
    </svg>
  ),
  link: () => (
    <svg {...P}>
      <path d="M7 9a2.8 2.8 0 0 0 4 0l2.3-2.3a2.8 2.8 0 0 0-4-4l-1 1M9 7a2.8 2.8 0 0 0-4 0L2.7 9.3a2.8 2.8 0 0 0 4 4l1-1" />
    </svg>
  ),
  label: () => (
    <svg {...P}>
      <path d="M2 2.5H8.2L14 8.3L8.3 14L2.5 8.2V2.5Z" />
      <circle cx="5.3" cy="5.5" r="1" />
    </svg>
  ),
  structure: () => (
    <svg {...P}>
      <rect x="5.5" y="6" width="5" height="4" rx="1" />
      <path d="M5.5 8H3V3.5H1.5M3 8V12.5H1.5M10.5 8H13V3.5H14.5M13 8V12.5H14.5" />
    </svg>
  ),
  theme: () => (
    <svg {...P}>
      <path d="M8 1.5A6.5 6.5 0 1 0 8 14.5C9 14.5 9.3 13.7 8.8 13C8.2 12.2 8.6 11 9.8 11H11.5C13.2 11 14.5 9.7 14.5 8A6.5 6.5 0 0 0 8 1.5Z" />
      <circle cx="5" cy="7" r="0.9" fill="currentColor" />
      <circle cx="8" cy="4.6" r="0.9" fill="currentColor" />
      <circle cx="11" cy="7" r="0.9" fill="currentColor" />
    </svg>
  ),
  export: () => (
    <svg {...P}>
      <path d="M8 2V10M5 5L8 2L11 5M3 9V13.5H13V9" />
    </svg>
  ),
  outline: () => (
    <svg {...P}>
      <path d="M2.5 3.5H4M6.5 3.5H13.5M4.5 8H6M8.5 8H13.5M4.5 12.5H6M8.5 12.5H13.5" />
    </svg>
  ),
  map: () => (
    <svg {...P}>
      <rect x="5.5" y="6.5" width="5" height="3" rx="1" />
      <path d="M10.5 8C12 8 12 4 14 4M10.5 8C12 8 12 12 14 12M5.5 8C4 8 4 4 2 4M5.5 8C4 8 4 12 2 12" />
    </svg>
  ),
  panel: () => (
    <svg {...P}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M10 2.5V13.5" />
    </svg>
  ),
  undo: () => (
    <svg {...P}>
      <path d="M5 4L2 7L5 10" />
      <path d="M2 7H10A4 4 0 0 1 10 15H7" />
    </svg>
  ),
  redo: () => (
    <svg {...P}>
      <path d="M11 4L14 7L11 10" />
      <path d="M14 7H6A4 4 0 0 0 6 15H9" />
    </svg>
  ),
  plus: () => (
    <svg {...P}>
      <path d="M8 3V13M3 8H13" />
    </svg>
  ),
  minus: () => (
    <svg {...P}>
      <path d="M3 8H13" />
    </svg>
  ),
  fit: () => (
    <svg {...P}>
      <path d="M2 5.5V2H5.5M10.5 2H14V5.5M14 10.5V14H10.5M5.5 14H2V10.5" />
    </svg>
  ),
  chevron: () => (
    <svg {...P} width={10} height={10}>
      <path d="M4 6L8 10L12 6" />
    </svg>
  ),
  close: () => (
    <svg {...P}>
      <path d="M4 4L12 12M12 4L4 12" />
    </svg>
  ),
  trash: () => (
    <svg {...P}>
      <path d="M2.5 4H13.5M6 4V2.5H10V4M4 4L4.8 14H11.2L12 4" />
    </svg>
  ),
  warn: () => (
    <svg {...P}>
      <path d="M8 2L14.5 13.5H1.5L8 2Z" />
      <path d="M8 6.5V9.5M8 11.5V11.6" />
    </svg>
  ),
  open: () => (
    <svg {...P}>
      <path d="M9 2.5H13.5V7M13.5 2.5L7.5 8.5M11.5 9.5V13.5H2.5V4.5H6.5" />
    </svg>
  ),
};
