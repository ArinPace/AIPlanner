import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { createInterface } from 'node:readline'
let text = ''
if (process.argv[2]) {
  // Multipass on Windows does not reliably forward piped stdin. The host
  // transfers this one-use code into a private guest directory over SSH.
  try { text = await readFile(process.argv[2], 'utf8') }
  finally { await unlink(process.argv[2]).catch(() => {}) }
} else {
  const lines = createInterface({ input: process.stdin })
  const timer = setTimeout(() => { lines.close(); process.stdin.destroy() }, 10000)
  try { for await (const line of lines) { text = line; break } }
  finally { clearTimeout(timer); lines.close(); process.stdin.destroy() }
}
const input = JSON.parse(text), origin = new URL(input.origin)
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password) throw new Error('Invalid planner origin.')
if (!/^[A-Za-z0-9_-]{32}$/.test(input.code)) throw new Error('Invalid pairing code.')
const response = await fetch(new URL('/api/agent/vm/worker/enroll', origin), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.code }), signal: AbortSignal.timeout(20000) })
if (!response.ok) throw new Error('Pairing failed. Generate a new pairing code in the planner.')
const result = await response.json()
await writeFile('/var/lib/planner/worker.json.tmp', JSON.stringify({ origin: origin.origin, token: result.token, username: result.username, id: result.id }), { mode: 0o600 })
await rename('/var/lib/planner/worker.json.tmp', '/var/lib/planner/worker.json')
console.log('VM paired successfully.')
