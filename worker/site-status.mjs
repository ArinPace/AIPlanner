export function signedInPage(source, href, text, hasPassword = false) {
  let url
  try { url = new URL(href) } catch { return false }
  const hosts = { brightspace:'brightspace.nyu.edu', gradescope:'gradescope.com', gmail:'mail.google.com', calendar:'calendar.google.com', drive:'drive.google.com', slack:'app.slack.com', instagram:'instagram.com', x:'x.com' }
  if (url.protocol !== 'https:' || url.hostname.replace(/^www\./,'') !== hosts[source] || hasPassword || /(?:^|\/)(?:login|signin|auth|saml)(?:\/|$)/i.test(url.pathname) || /sign in to continue|log in to gradescope|sign in to x|log in to instagram|sign in to your workspace/i.test(text)) return false
  return Boolean({
    brightspace: /\/d2l\/home/.test(url.pathname) && /my courses|course selector|select a course|course home|content|announcements/i.test(text),
    gradescope: /\/account|\/courses\//.test(url.pathname) && /your courses|dashboard|assignments|course dashboard/i.test(text),
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
