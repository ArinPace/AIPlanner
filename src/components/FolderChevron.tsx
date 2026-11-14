export function FolderChevron({open=false}:{open?:boolean}) {
 return <svg className={'folder-chevron'+(open?' is-open':'')} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
}
