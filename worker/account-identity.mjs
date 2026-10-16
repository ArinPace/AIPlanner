// Read only account controls, never message bodies, event guests or contacts.
export function identityFromAccountControl(value) {
  if (typeof value !== 'string') return null
  const text = value.trim().slice(0,1000)
  const email = text.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  if (email && email.length <= 200) return email.toLowerCase()
  const handle = text.match(/(?:^|\s)@[a-z0-9_.]{1,50}(?=\s|$)/i)?.[0].trim()
  return handle || null
}
export async function browserAccountIdentity(source, page) {
  const selectors = {
    gmail:'[aria-label^="Google Account"], [aria-label^="Google account"]',
    calendar:'[aria-label^="Google Account"], [aria-label^="Google account"]',
    drive:'[aria-label^="Google Account"], [aria-label^="Google account"]',
    brightspace:'d2l-navigation-dropdown-button-text[slot="user"], .d2l-navigation-s-personal-menu',
    gradescope:'.userMenu, #user-menu, [aria-label="Account menu"]',
    slack:'[data-qa="user-button"], [data-qa="user_menu_button"]',
    instagram:'a[href$="/"][aria-label="Profile"], [aria-label="Your profile"]',
    x:'[data-testid="SideNav_AccountSwitcher_Button"]',
  }
  const selector = selectors[source]
  if (!selector) return null
  for (const frame of page.frames()) {
    const values = await frame.locator(selector).evaluateAll(nodes => nodes.slice(0,5).map(node => [node.getAttribute('aria-label'),node.getAttribute('title'),node.textContent].filter(Boolean).join(' '))).catch(()=>[])
    for (const value of values) { const identity=identityFromAccountControl(value); if(identity)return identity }
  }
  return null
}
