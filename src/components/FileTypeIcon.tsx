export function FileTypeIcon({note=false,size=24}:{note?:boolean;size?:number}){
  return <svg width={size} height={size*28/24} viewBox="0 0 24 28" fill="none" aria-hidden="true" data-file-type={note?'note':'text'}>
    {note?<><rect x="3" y="2" width="18" height="24" rx="3" fill="#fffbed" stroke="#c49a22" strokeWidth="1.5"/><path d="M6 2h12a3 3 0 0 1 3 3v4H3V5a3 3 0 0 1 3-3Z" fill="#f6c94c"/><path d="M3 9h18" stroke="#c49a22"/><path d="M7 14h10M7 18h10M7 22h6" stroke="#998348" strokeWidth="1.4" strokeLinecap="round"/></>:<g stroke="#8090a3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h9l5 5v17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h5M7 13h8M7 17h8M7 21h5"/></g>}
  </svg>
}
