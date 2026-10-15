import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export class CodexRpc {
  constructor(command, args, options, notify = () => {}) {
    this.next = 0; this.pending = new Map(); this.notify = notify
    this.child = spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    // Never relay stderr: provider errors can contain request headers or credentials.
    this.child.stderr.resume()
    this.child.on('error', () => this.fail(new Error('Could not start the Codex runtime.')))
    this.child.on('exit', () => this.fail(new Error('The Codex runtime stopped.')))
    createInterface({ input: this.child.stdout }).on('line', line => {
      let message; try { message = JSON.parse(line) } catch { return }
      if (message.id !== undefined && message.method) {
        this.send({ id: message.id, error: { code: -32601, message: 'Interactive approvals are unavailable during unattended runs. Ask the user in chat.' } })
      } else if (message.id !== undefined) {
        const pending = this.pending.get(message.id)
        if (pending) { this.pending.delete(message.id); clearTimeout(pending.timer); if (message.error) pending.reject(new Error('Codex rejected the request. Check model access and reconnect AI if needed.')); else pending.resolve(message.result) }
      } else if (message.method) this.notify(message.method, message.params)
    })
  }
  send(value) { if (!this.child.stdin.destroyed) this.child.stdin.write(JSON.stringify(value) + '\n') }
  request(method, params = {}, timeout = 30000) {
    const id = ++this.next
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The agent runtime did not respond in time.')) }, timeout)
      this.pending.set(id, { resolve, reject, timer }); this.send({ id, method, params })
    })
  }
  fail(error) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error) } this.pending.clear() }
  close() { this.fail(new Error('Agent stopped.')); this.child.kill() }
  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'ai_planner', title: 'AI Planner', version: '0.1.0' } })
    this.send({ method: 'initialized' })
  }
}
