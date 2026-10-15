import { writeFile, rename } from 'node:fs/promises'
let text = ''; for await (const chunk of process.stdin) text += chunk
const input = JSON.parse(text), origin = new URL(input.origin)
if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password) throw new Error('Invalid planner origin.')
const response = await fetch(new URL('/api/agent/vm/worker/enroll', origin), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.code }), signal: AbortSignal.timeout(20000) })
if (!response.ok) throw new Error('Pairing failed. Generate a new pairing code in the planner.')
const result = await response.json()
await writeFile('/var/lib/planner/worker.json.tmp', JSON.stringify({ origin: origin.origin, token: result.token, username: result.username, id: result.id }), { mode: 0o600 })
await rename('/var/lib/planner/worker.json.tmp', '/var/lib/planner/worker.json')
console.log('VM paired successfully.')
