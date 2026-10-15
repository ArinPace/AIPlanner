param(
  [ValidatePattern('^[a-z0-9_]{3,24}$')][string]$Username = 'arin',
  [ValidatePattern('^[A-Za-z0-9_-]{32}$')][Parameter(Mandatory=$true)][string]$PairingCode,
  [string]$PlannerOrigin = 'https://aiplanner-ten.vercel.app'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$multipass = 'C:\Program Files\Multipass\bin\multipass.exe'
$vmName = 'planner-' + $Username.Replace('_','-')
if (!(Test-Path -LiteralPath $multipass)) { throw 'Install Multipass first: winget install --id Canonical.Multipass --exact' }
if (!(Get-Service vmms -ErrorAction SilentlyContinue)) { throw 'Hyper-V is waiting for a Windows restart. Restart, then rerun this script.' }
$all = & $multipass list --format json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Could not contact Multipass.' }
$existing = $all.list | Where-Object name -eq $vmName
if (!$existing) {
  & $multipass launch 24.04 --name $vmName --cpus 2 --memory 4G --disk 25G --timeout 300
  if ($LASTEXITCODE -ne 0) { throw 'VM creation failed.' }
} elseif ($existing.state -ne 'Running') {
  & $multipass start $vmName
  if ($LASTEXITCODE -ne 0) { throw 'VM startup failed.' }
}
$staging = Join-Path $env:TEMP ('planner-vm-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
try {
  # Secrets travel over stdin to the VM, never via cloud-init, Git or process args.
  $enrollment = @{origin=$PlannerOrigin;code=$PairingCode} | ConvertTo-Json -Compress
  & $multipass exec $vmName -- sudo install -d -m 700 /opt/planner-staging
  & $multipass transfer --recursive (Join-Path $repoRoot 'worker') ($vmName + ':/home/ubuntu/planner-worker')
  if ($LASTEXITCODE -ne 0) { throw 'Worker file transfer failed.' }
  & $multipass exec $vmName -- sudo bash /home/ubuntu/planner-worker/bootstrap.sh
  if ($LASTEXITCODE -ne 0) { throw 'VM bootstrap failed.' }
  $enrollment | & $multipass exec $vmName -- sudo -u planner node /opt/planner/enroll.mjs
  if ($LASTEXITCODE -ne 0) { throw 'VM pairing failed. Generate a fresh code in the planner.' }
  & $multipass exec $vmName -- sudo systemctl enable --now planner-worker.service
  if ($LASTEXITCODE -ne 0) { throw 'Worker service did not start.' }
  if (Get-Command Set-VM -ErrorAction SilentlyContinue) { Set-VM -Name $vmName -AutomaticStartAction Start -AutomaticStartDelay 15 -AutomaticStopAction Save }
  Write-Output "Private VM $vmName is running. Return to the planner and connect AI, then websites."
} finally {
  # No recursive cleanup outside the exact temporary directory created above.
  if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging }
}
