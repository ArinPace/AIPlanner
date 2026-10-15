import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'

const configPath = process.argv[2]
if (!configPath) throw new Error('Pass the private host configuration file path.')
const config = JSON.parse(await readFile(configPath, 'utf8'))
const origin = new URL(config.origin)
if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Use an HTTPS planner origin.')
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const multipass = 'C:/Program Files/Multipass/bin/multipass.exe'
function command(executable, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('VM command timed out.')) }, executable === multipass ? 180000 : 45 * 60000)
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-100000) }); child.stderr.resume()
    child.on('error', error => { clearTimeout(timer); reject(error) }); child.on('exit', code => { clearTimeout(timer); if (code === 0) resolve(output); else reject(new Error('VM provisioning failed.')) }); child.stdin.end(input)
  })
}
async function api(action, value) {
  const response = await fetch(new URL('/api/agent/vm/host/' + action, origin), { method: 'POST', headers: { Authorization: 'Bearer ' + config.token, 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.timeout(25000) })
  if (!response.ok) throw new Error('The provisioning server could not be reached.')
  return response.json()
}
for (;;) {
  try {
    const power = await api('power', {})
    // Enabling Hyper-V requires a reboot. Leave accounts queued until its
    // service exists, rather than marking their first provisioning as failed.
    await command('powershell.exe', ['-NoProfile', '-Command', "if (!(Get-Service vmms -ErrorAction SilentlyContinue)) { exit 1 }"])
    let list = JSON.parse(await command(multipass, ['list', '--format', 'json']))
    // Stop idle guests before allocating memory to a different user's task.
    for (const computer of power.computers.filter(c => !c.shouldRun)) {
      if (!/^[a-z0-9_]{3,24}$/.test(computer.username)) continue
      const name = 'planner-' + computer.username.replaceAll('_', '-')
      if (list.list.some(vm => vm.name === name && vm.state === 'Running')) await command(multipass, ['stop', name])
    }
    list = JSON.parse(await command(multipass, ['list', '--format', 'json']))
    let vmCount = list.list.filter(vm => vm.name.startsWith('planner-') && vm.state === 'Running').length
    for (const computer of power.computers.filter(c => c.shouldRun)) {
      if (!/^[a-z0-9_]{3,24}$/.test(computer.username) || vmCount >= power.capacity || os.freemem() < 5 * 1024 ** 3) continue
      const name = 'planner-' + computer.username.replaceAll('_', '-')
      if (list.list.some(vm => vm.name === name && vm.state !== 'Running')) { await command(multipass, ['start', name]); vmCount++ }
    }
    const { job } = await api('claim', { vmCount: os.freemem() < 5 * 1024 ** 3 ? power.capacity : vmCount })
    if (job) {
      if (!/^[a-z0-9_]{3,24}$/.test(job.username)) throw new Error('Invalid VM account.')
      try {
        await command('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repo, 'scripts/provision-vm.ps1'), '-Username', job.username], job.code + '\n')
        await api('finish', { username: job.username, lease: job.lease })
        console.log('A private planner computer is ready.')
      } catch { await api('finish', { username: job.username, lease: job.lease, error: true }).catch(() => {}); console.error('A VM needs operator attention.') }
    }
  } catch { console.error('VM host is waiting for its network or virtualization service.') }
  await new Promise(resolve => setTimeout(resolve, 15000))
}
