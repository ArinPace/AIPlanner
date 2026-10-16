export const googleSources = new Set(['gmail','calendar','drive'])
export const googleCdp = 'http://127.0.0.1:9223'
export function browserEndpoint(url) {
  return ['mail.google.com','calendar.google.com','drive.google.com'].includes(new URL(url).hostname) ? googleCdp : 'http://127.0.0.1:9222'
}
