export type Theme = 'light' | 'dark'
export function readTheme(): Theme {
  try { return localStorage.getItem('ai-planner-theme') === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem('ai-planner-theme', theme) } catch { /* Keep the current theme when storage is unavailable. */ }
}
