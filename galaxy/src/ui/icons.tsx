// Inline stroke icons (24-unit grid, currentColor). Decorative: aria-hidden.

import type { ReactNode, SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const IconReport = (p: P) => (
  <Icon {...p}>
    <path d="M6 3.5h8.5L19 8v12.5H6z" />
    <path d="M14 3.5V8h5M9 12h7M9 15.5h7M9 9h3" />
  </Icon>
);
/** Flat star map (the 2D view). */
export const IconFlat = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.3" />
    <circle cx="15.5" cy="9" r="1.3" />
    <circle cx="12.5" cy="15" r="1.3" />
    <path d="m9.7 10.6 1.9 3.3M13.6 14l1.4-3.8" />
  </Icon>
);

export const IconQuality = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5-2-5.5L4.5 11 10 9z" />
    <path d="M19 3.5v3M17.5 5h3" />
  </Icon>
);
export const IconCore = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="8" strokeDasharray="2.5 3" />
    <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
  </Icon>
);
export const IconReset = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4" />
    <path d="M4.5 4v4h4" />
  </Icon>
);
export const IconHelp = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7M12 16.8v.2" />
  </Icon>
);
export const IconMore = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />
  </Icon>
);
export const IconClose = (p: P) => (
  <Icon {...p}>
    <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
  </Icon>
);
export const IconChevron = (p: P) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);
export const IconChevronDown = (p: P) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
export const IconCheck = (p: P) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const IconRetry = (p: P) => (
  <Icon {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4" />
    <path d="M19.5 4v4h-4" />
  </Icon>
);
export const IconOffline = (p: P) => (
  <Icon {...p}>
    <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" />
    <path d="M12 19.5v.1M3 3l18 18" />
  </Icon>
);
export const IconExternal = (p: P) => (
  <Icon {...p}>
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 14v5.5H4.5V7H10" />
  </Icon>
);

const TRASH = "M4.5 6.5h15M9 6.5V4.7c0-.7.6-1.2 1.3-1.2h3.4c.7 0 1.3.5 1.3 1.2v1.8m-8.9 0 .8 12.1c.1 1 .8 1.7 1.8 1.7h6.6c1 0 1.7-.7 1.8-1.7l.8-12.1";

/** Home delete control (its own stroke on the path, 1.6). `lines` adds the two inner strokes. */
export function IconTrash({ lines = false }: { lines?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={lines ? `${TRASH}M10 10v6.5m4-6.5v6.5` : TRASH}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Small glyphs for the tool-step trace (13px, stroke via CSS). */
export function ToolGlyph({ tool }: { tool: string }) {
  const paths: Record<string, ReactNode> = {
    web_search: (
      <>
        <circle cx="10.5" cy="10.5" r="5.5" />
        <path d="m15 15 4.5 4.5" />
      </>
    ),
    web_fetch: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16M12 4c2.5 2.6 2.5 13.4 0 16M12 4c-2.5 2.6-2.5 13.4 0 16" />
      </>
    ),
    bash: <path d="m5 7 5 5-5 5M12.5 17.5H19" />,
    read_file: (
      <>
        <path d="M6.5 3.5h8l3 3v14h-11z" />
        <path d="M9.5 11h5M9.5 14.5h5" />
      </>
    ),
    create_file: <path d="m14.5 5.5 4 4L9 19H5v-4zM12.5 7.5l4 4" />,
    submit_report: <path d="M4 12 20 4l-4 16-4.5-6.5zM11.5 13.5 20 4" />,
    download_file: <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />,
    压缩: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
    思考: (
      <>
        <circle cx="12" cy="12" r="1.2" />
        <circle cx="6.5" cy="12" r="1.2" />
        <circle cx="17.5" cy="12" r="1.2" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[tool] ?? <circle cx="12" cy="12" r="4" />}
    </svg>
  );
}

export const IconDownload = (p: P) => (
  <Icon {...p}>
    <path d="M12 4v10.5M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Icon>
);

export const IconSettings = (p: P) => (
  <Icon {...p}>
    <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </Icon>
);
