export function signedInPage(source, href, text, hasPassword = false) {
  let url
  try { url = new URL(href) } catch { return false }
  const hosts = { linkedin:'linkedin.com', albert:'albert.nyu.edu', whatsapp:'web.whatsapp.com', brightspace:'brightspace.nyu.edu', gradescope:'gradescope.com', gmail:'mail.google.com', calendar:'calendar.google.com', drive:'drive.google.com', slack:'app.slack.com', instagram:'instagram.com', x:'x.com' }
  if (url.protocol !== 'https:' || !(url.hostname.replace(/^www\./,'') === hosts[source] || source==='albert' && url.hostname==='sis.nyu.edu') || hasPassword || /(?:^|\/)(?:login|signin|auth|saml)(?:\/|$)/i.test(url.pathname) || /sign in to continue|log in to gradescope|sign in to x|log in to instagram|sign in to your workspace/i.test(text)) return false
  return Boolean({
    linkedin: /\/(?:feed|messaging|mynetwork)(?:\/|$)/.test(url.pathname) && /messaging/i.test(text) && /my network|notifications/i.test(text),
    albert: /student center|student homepage|academics|class schedule|my class schedule/i.test(text) && !/sign in|log in|enter your (?:netid|password)/i.test(text),
    whatsapp: /chats|communities/i.test(text) && /search|new chat/i.test(text) && !/scan.*qr|log into whatsapp|link with phone number/i.test(text),
    brightspace: /\/d2l\/home/.test(url.pathname) && /my courses|course selector|select a course|course home|content|announcements/i.test(text),
    gradescope: (/\/account|\/courses\//.test(url.pathname) || url.pathname === '/' && /your courses/i.test(text) && /account|course dashboard/i.test(text)) && /your courses|dashboard|assignments|course dashboard/i.test(text),
    gmail: /inbox|compose|drafts/i.test(text) && /\/mail\/u\/\d/.test(url.pathname),
    calendar: /create|my calendars|today/i.test(text) && /\/calendar\/u\/\d/.test(url.pathname),
    drive: /my drive|shared with me|my files/i.test(text) && /\/drive\/u\/\d/.test(url.pathname),
    slack: /\/client\//.test(url.pathname) && /channels|threads|direct messages/i.test(text),
    instagram: /messages|notifications/i.test(text) && !/sign up to see|log in to see/i.test(text),
    x: /\/home/.test(url.pathname) && /for you|following/i.test(text),
  }[source])
}

export function brightspaceCourse(href) {
  try { const u = new URL(href); return u.protocol === 'https:' && u.hostname === 'brightspace.nyu.edu' && /^\/d2l\/home\/\d+\/?$/.test(u.pathname) ? u.origin + u.pathname : null } catch { return null }
}
