export function tomlValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return '{' + Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}=${tomlValue(v)}`).join(',') + '}'
  return JSON.stringify(value)
}
