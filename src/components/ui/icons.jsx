function IconWrap({ children, className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}

export function CalendarIcon(props) { return <IconWrap {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></IconWrap>; }
export function ClockIcon(props) { return <IconWrap {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></IconWrap>; }
export function DollarIcon(props) { return <IconWrap {...props}><circle cx="12" cy="12" r="9" /><path d="M9.5 15.3c.5 1 1.5 1.6 2.7 1.6 1.8 0 3-.9 3-2.2 0-1.4-1.3-1.9-3-2.3-1.9-.4-3-1-3-2.4 0-1.3 1.3-2.2 3-2.2 1.2 0 2.2.5 2.7 1.4M12 6.5v11" /></IconWrap>; }
export function UsersIcon(props) { return <IconWrap {...props}><circle cx="9.5" cy="8" r="3" /><path d="M4.5 19v-1.2A3.8 3.8 0 0 1 8.3 14h2.4a3.8 3.8 0 0 1 3.8 3.8V19" /><path d="M14.5 5.3a3 3 0 0 1 0 5.7M16.5 19v-1.2c0-1.2-.5-2.3-1.4-3" /></IconWrap>; }
export function WrenchIcon(props) { return <IconWrap {...props}><path d="M14.7 6.3a4 4 0 0 0-5.4 4.9L3.5 17l2.5 2.5 5.8-5.8a4 4 0 0 0 4.9-5.4l-2.6 2.6-2-2z" /></IconWrap>; }
export function AlertIcon(props) { return <IconWrap {...props}><path d="M10.3 3.9 2.5 17.5A1.8 1.8 0 0 0 4 20h16a1.8 1.8 0 0 0 1.5-2.5L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17h.01" /></IconWrap>; }
export function InfoIcon(props) { return <IconWrap {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none" /></IconWrap>; }
export function MapPinIcon(props) { return <IconWrap {...props}><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.3" /></IconWrap>; }
export function ClipboardIcon(props) { return <IconWrap {...props}><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 10h6M9 13h6M9 16h4" /></IconWrap>; }
export function NoteIcon(props) { return <IconWrap {...props}><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="M14 6l3 3" /></IconWrap>; }
export function FileIcon(props) { return <IconWrap {...props}><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4" /></IconWrap>; }
export function ChevronDownIcon(props) { return <IconWrap {...props}><path d="M6 9l6 6 6-6" /></IconWrap>; }
export function SearchIcon(props) { return <IconWrap {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></IconWrap>; }
