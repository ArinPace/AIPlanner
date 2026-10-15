import { readFile, appendFile, stat, rename } from 'node:fs/promises'
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
const powershell = 'powershell.exe'
async function listGuests() {
  const output = await command(powershell, ['-NoProfile', '-Command', "ConvertTo-Json -Compress -InputObject @(Get-VM | Select-Object Name,@{Name='State';Expression={$_.State.ToString()}})"])
  return { list: JSON.parse(output).map(vm => ({ name: vm.Name, state: vm.State })) }
}
async function powerGuest(name, running) {
  if (!/^planner-[a-z0-9-]{3,24}$/.test(name)) throw new Error('Invalid VM name.')
  // Manage existing guests directly: a stalled Multipass daemon must not block
  // scheduled work. Stop-VM requests guest shutdown; never force power off.
  await command(powershell, ['-NoProfile', '-Command', `${running ? 'Start' : 'Stop'}-VM -Name '${name}' -ErrorAction Stop`])
}
const logPath = path.join(path.dirname(configPath), 'host.log')
async function log(event, detail = {}) {
  try {
    if ((await stat(logPath).catch(() => null))?.size > 1024 * 1024) await rename(logPath, logPath + '.previous')
    await appendFile(logPath, JSON.stringify({ at: new Date().toISOString(), event, ...detail }) + '\n')
  } catch { console.error('Could not write VM host diagnostics.') }
}
function command(executable, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); let output = ''
    const provisioning = args.includes('-File')
    const timer = setTimeout(() => { child.kill(); reject(new Error('VM command timed out.')) }, provisioning ? 45 * 60000 : 180000)
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-100000) }); child.stderr.resume()
    child.on('error', error => { clearTimeout(timer); reject(error) }); child.on('exit', code => { clearTimeout(timer); if (code === 0) resolve(output); else { void log('command_failed', { executable: path.basename(executable), code }); reject(new Error('VM provisioning failed.')) } }); child.stdin.end(input)
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
    let list = await listGuests()
    // Stop idle guests before allocating memory to a different user's task.
    for (const computer of power.computers.filter(c => !c.shouldRun)) {
      if (!/^[a-z0-9_]{3,24}$/.test(computer.username)) continue
      const name = 'planner-' + computer.username.replaceAll('_', '-')
      if (list.list.some(vm => vm.name === name && vm.state === 'Running')) { await log('stopping', { name }); await powerGuest(name, false) }
    }
    list = await listGuests()
    let vmCount = list.list.filter(vm => vm.name.startsWith('planner-') && vm.state === 'Running').length
    for (const computer of power.computers.filter(c => c.shouldRun)) {
      if (!/^[a-z0-9_]{3,24}$/.test(computer.username) || vmCount >= power.capacity || os.freemem() < 5 * 1024 ** 3) continue
      const name = 'planner-' + computer.username.replaceAll('_', '-')
      if (list.list.some(vm => vm.name === name && vm.state === 'Off')) { await log('starting', { name }); await powerGuest(name, true); vmCount++ }
    }
    const { job } = await api('claim', { vmCount: os.freemem() < 5 * 1024 ** 3 ? power.capacity : vmCount })
    if (job) {
      if (!/^[a-z0-9_]{3,24}$/.test(job.username)) throw new Error('Invalid VM account.')
      await log('provisioning', { username: job.username })
      try {
        await command('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repo, 'scripts/provision-vm.ps1'), '-Username', job.username], job.code + '\n')
        await api('finish', { username: job.username, lease: job.lease })
        await log('ready', { username: job.username })
        console.log('A private planner computer is ready.')
      } catch { await api('finish', { username: job.username, lease: job.lease, error: true }).catch(() => {}); await log('provision_failed', { username: job.username }); console.error('A VM needs operator attention.') }
    }
  } catch { await log('retrying'); console.error('VM host is waiting for its network or virtualization service.') }
  await new Promise(resolve => setTimeout(resolve, 15000))
}
