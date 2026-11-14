type IconProps = {
  size?: number
  className?: string
}

export function MinusIcon({ size = 18, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function PlusIcon({ size = 18, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function ChevronIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SettingsIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 13a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MenuIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function CloseIcon({ size = 20, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function TrashIcon({ size = 18, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 7h14M10 11v6M14 11v6M8 7l1-2h6l1 2M7 7l1 13h8l1-13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function RepeatIcon({ size = 12, className }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17 1l4 4-4 4M7 23l-4-4 4-4M21 5H9a4 4 0 0 0-4 4v2M3 19h12a4 4 0 0 0 4-4v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CalendarMark({ size = 28 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="6" width="26" height="23" rx="5" fill="#1a73e8" />
      <rect x="3" y="6" width="26" height="8" rx="5" fill="#185abc" />
      <rect x="3" y="10" width="26" height="4" fill="#185abc" />
      <rect x="9" y="3" width="3" height="7" rx="1.5" fill="#3c4043" />
      <rect x="20" y="3" width="3" height="7" rx="1.5" fill="#3c4043" />
      <text x="16" y="25" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700" fontFamily="Roboto, sans-serif">
        12
      </text>
    </svg>
  )
}

export function EditIcon({size=20,className}:IconProps) {
 return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path transform="translate(-.029 -.307) scale(1.0096 1.0622)" d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
export function ScreenTimeIcon({size=20,className}:IconProps) {
 return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4Zm0 5v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
export function CheckIcon({size=20,className}:IconProps) {
 return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

export function WindIcon({size=24,className}:IconProps) {
 return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 8h12.5A2.5 2.5 0 1 0 13 5.5M2 12h17a3 3 0 1 1-3 3M4 16h5.5A2.5 2.5 0 1 1 7 18.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
