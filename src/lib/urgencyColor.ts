/** Blank urgency stays neutral; 0–99 moves from green through yellow to red. */
export function urgencyColor(value: number | null | undefined) {
  if (value == null || !Number.isInteger(value) || value < 0 || value > 99) return {}
  const hue = Math.round(120 * (1 - value / 99))
  return {
    backgroundColor: `hsl(${hue} 85% 88%)`,
    borderColor: `hsl(${hue} 65% 35%)`,
    color: `hsl(${hue} 80% 18%)`,
  }
}
