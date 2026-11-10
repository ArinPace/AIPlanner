import {isIPhoneApp, nativeRequest} from './platform'

const preferenceKey = 'planner-open-links-in-browser'

export function externalLinks() {
  return localStorage.getItem(preferenceKey) === 'true'
}

export function setExternalLinks(enabled: boolean) {
  localStorage.setItem(preferenceKey, String(enabled))
}

export function openBrowserLink(url: string) {
  if (isIPhoneApp()) {
    void nativeRequest({action: 'openExternalLink', url}).catch(() => window.open(url, '_blank', 'noopener,noreferrer'))
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function openPlannerLink(url: string) {
  if (!/^https?:\/\//i.test(url)) return
  if (isIPhoneApp() && externalLinks()) openBrowserLink(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}
