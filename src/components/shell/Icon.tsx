/** Minimal stroke icon set (24x24, 1.75 stroke). Paths are original, kept small on purpose. */
const PATHS: Record<string, string> = {
  today: "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM4 9h16M9 4v5",
  board: "M4 5h4.5v14H4V5Zm5.75 0h4.5v9h-4.5V5Zm5.75 0H20v12h-4.5V5Z",
  signal: "M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z",
  chat: "M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12Z",
  intro: "M12 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM5.5 15a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Zm13 0a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5ZM10.4 10.2 6.9 15M13.6 10.2l3.5 4.8",
  folder: "M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5V7Z",
  chart: "M4 19.5h16M7 16v-5m5 5V6m5 10v-7",
  plug: "M9 3v5m6-5v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8Zm5.5 8.5V21",
  upload: "M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15",
  search: "M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Zm5-1.5L20 20",
  refresh: "M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.5l1.7-2M20 20v-4.5h-4.5",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  check: "m5 12.5 4.5 4.5L19 7.5",
  alert: "M12 8v5m0 3.5v.01M10.3 4.3 3.4 16.5A2 2 0 0 0 5.1 19.5h13.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z",
  link: "M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4L12 5.6M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1",
  star: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8-4.3-4.1 5.9-.9L12 3.5Z",
  logout: "M14 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h7M10 12h10m0 0-3.5-3.5M20 12l-3.5 3.5",
  grid: "M4 4h6.5v6.5H4V4Zm9.5 0H20v6.5h-6.5V4ZM4 13.5h6.5V20H4v-6.5Zm9.5 0H20V20h-6.5v-6.5Z",
  list: "M8.5 6.5H20M8.5 12H20M8.5 17.5H20M4 6.5h.01M4 12h.01M4 17.5h.01",
  clock: "M12 7.5V12l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z",
};

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = "h-[18px] w-[18px]" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
