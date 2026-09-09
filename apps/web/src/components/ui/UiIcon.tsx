import type { SVGProps } from "react";

export type UiIconName =
  | "home" | "pipeline" | "contacts" | "properties" | "tasks" | "calendar"
  | "integrations" | "team" | "documentation" | "subscription" | "settings"
  | "search" | "phone" | "meeting" | "message" | "check" | "webhook"
  | "facebook" | "instagram" | "telegram" | "csv";

export function UiIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: UiIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.8 };

  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" {...props}>
    {name === "home" && <g {...common}><path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.2V21h13V9.2M9.2 21v-6.5h5.6V21"/></g>}
    {name === "pipeline" && <g {...common}><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="9.5" y="4" width="5" height="10" rx="1.5"/><rect x="16" y="4" width="5" height="13" rx="1.5"/></g>}
    {name === "contacts" && <g {...common}><circle cx="9" cy="8" r="3"/><path d="M3.8 19c.5-3.3 2.2-5 5.2-5s4.7 1.7 5.2 5M16 7.5h5M18.5 5v5M16.5 15.5H21M16.5 19H21"/></g>}
    {name === "properties" && <g {...common}><path d="m3.5 10.5 8.5-7 8.5 7V21h-17Z"/><path d="M8 10h8M8 14h8M8 18h4"/></g>}
    {name === "tasks" && <g {...common}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 1.5 1.5L12 7.8M14 9h3M8 15h9"/></g>}
    {name === "calendar" && <g {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M17 14h.1M7 18h2M12 18h2"/></g>}
    {name === "integrations" && <g {...common}><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="m8.2 7.2 2.6 8.3M15.8 7.2l-2.6 8.3M8.5 6h7"/></g>}
    {name === "team" && <g {...common}><circle cx="9" cy="8" r="3"/><circle cx="17.5" cy="9" r="2.2"/><path d="M3.5 20c.4-3.8 2.2-5.7 5.5-5.7s5.1 1.9 5.5 5.7M15 14.7c3.4-.4 5.2 1.4 5.5 4.3"/></g>}
    {name === "documentation" && <g {...common}><path d="M5 3.5h10l4 4V21H5Z"/><path d="M15 3.5V8h4M8 12h8M8 16h8"/></g>}
    {name === "subscription" && <g {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 15h4"/></g>}
    {name === "settings" && <g {...common}><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></g>}
    {name === "search" && <g {...common}><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/></g>}
    {name === "phone" && <path {...common} d="M6.2 3.5 9 7.7 7.3 9.6c1.5 3 3.8 5.3 6.8 6.8l1.9-1.7 4.3 2.8-.8 3c-.2.7-.9 1.1-1.6 1-8-.9-14.4-7.3-15.3-15.3-.1-.7.3-1.4 1-1.6Z"/>}
    {name === "meeting" && <g {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></g>}
    {name === "message" && <g {...common}><path d="M4 4h16v12H9l-5 4Z"/><path d="M8 9h8M8 12h5"/></g>}
    {name === "check" && <path {...common} d="m5 12 4.2 4.2L19 6.5"/>}
    {name === "webhook" && <g {...common}><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 11 15.3 7.4M9 13l6.3 3.6"/></g>}
    {name === "facebook" && <path fill="currentColor" d="M13.8 21v-8h2.8l.4-3.1h-3.2v-2c0-.9.3-1.5 1.6-1.5H17V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.5V13h2.8v8Z"/>}
    {name === "instagram" && <g {...common} strokeWidth="2"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></g>}
    {name === "telegram" && <path fill="currentColor" d="m3.2 11.2 16.6-6.4c.8-.3 1.5.2 1.2 1.5l-2.8 13c-.2.9-.8 1.1-1.6.7l-4.3-3.2-2.1 2c-.2.2-.4.4-.9.4l.3-4.4 8-7.2c.4-.3-.1-.5-.5-.2L7.2 13.6 3 12.3c-.9-.3-.9-.9.2-1.1Z"/>}
    {name === "csv" && <g {...common}><path d="M5 3h10l4 4v14H5Z"/><path d="M15 3v5h4"/><path d="M7.5 15.5h9M7.5 12.5h9M10.5 10v8M14 10v8"/></g>}
  </svg>;
}

export function TaskKindIcon({ kind }: { kind: "Звонок" | "Встреча" | "Сообщение" | "Другое" }) {
  const name: UiIconName = kind === "Звонок" ? "phone" : kind === "Встреча" ? "meeting" : kind === "Сообщение" ? "message" : "check";
  return <UiIcon name={name} />;
}
