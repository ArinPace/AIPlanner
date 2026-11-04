param(
  [ValidatePattern('^[a-z0-9_]{3,24}$')][string]$Username = 'arin',
  [string]$PlannerOrigin = 'https://aiplanner-ten.vercel.app',
  [string]$SessionFile
)
$ErrorActionPreference = 'Stop'
$admin = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run this one-time installer in PowerShell as Administrator.' }
$multipass = 'C:\Program Files\Multipass\bin\multipass.exe'
$repoRoot = Split-Path -Parent $PSScriptRoot
$vmName = 'planner-' + $Username.Replace('_','-')
$vmHost = $vmName + '.mshome.net'
$origin = [Uri]$PlannerOrigin
if ($origin.Scheme -ne 'https' -or $origin.UserInfo -or $origin.AbsolutePath -ne '/') { throw 'Use the HTTPS planner origin.' }
$ownSession = $false
if ($SessionFile) {
  $session = Get-Content -LiteralPath $SessionFile -Raw | ConvertFrom-Json
  if ($session.origin.TrimEnd('/') -ne $PlannerOrigin.TrimEnd('/')) { throw 'Session origin does not match.' }
  $token = $session.token
} else {
  $secret = Read-Host 'Planner password (used once to check that the agent is idle)' -AsSecureString
  $credential = [PSCredential]::new($Username, $secret)
  $loginBody = @{username=$Username;password=$credential.GetNetworkCredential().Password} | ConvertTo-Json
  try { $token = (Invoke-RestMethod -Method Post -Uri ($PlannerOrigin.TrimEnd('/')+'/api/login') -ContentType 'application/json' -Body $loginBody).token }
  finally { $loginBody=$null; $credential=$null; $secret=$null }
  $ownSession = $true
}
$headers = @{Authorization='Bearer '+$token}
function Assert-Idle {
  $state = Invoke-RestMethod -Uri ($PlannerOrigin.TrimEnd('/')+'/api/agent/vm') -Headers $headers
  if ($state.queue.active -or $state.queue.queuedIds.Count -gt 0 -or @($state.runs | Where-Object {$_.status -in @('running','queued','waiting','paused')}).Count -gt 0) { throw 'Agent work is pending. Finish or stop it before installing the updater.' }
}
$stage = Join-Path $env:TEMP ('planner-update-install-'+[guid]::NewGuid().ToString('N'))
$stopped = $false
try {
  Assert-Idle
  $vms = & $multipass list --format json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or !($vms.list | Where-Object {$_.name -eq $vmName -and $_.state -eq 'Running'})) { throw 'The existing VM must be running. This installer never creates a VM.' }
  $ErrorActionPreference='Continue'
  $hostname = & $multipass exec $vmName -- hostname 2>$null
  $probeExit=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  if ($probeExit -ne 0) {
    # Recover the local management name without relying on a fixed subnet/IP.
    $addresses = @(Get-VMNetworkAdapter -VMName $vmName | ForEach-Object IPAddresses | Where-Object {$_ -match '^\d+\.\d+\.\d+\.\d+$'})
    if (!$addresses.Count) { $addresses = @(Resolve-DnsName $vmHost -Type A | ForEach-Object IPAddress | Where-Object {$_}) }
    $address = $addresses | Where-Object {Test-NetConnection $_ -Port 22 -InformationLevel Quiet -WarningAction SilentlyContinue} | Select-Object -First 1
    if (!$address) { throw 'No reachable existing VM address was found.' }
    $hostsPath = "$env:WINDIR\System32\drivers\etc\hosts"
    $backup = "$hostsPath.planner-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item -LiteralPath $hostsPath -Destination $backup
    $pattern = '^\s*[^#\s]+\s+.*\b'+[regex]::Escape($vmHost)+'\b'
    $lines = @(Get-Content -LiteralPath $hostsPath | Where-Object {$_ -notmatch $pattern})
    @($lines; "$address $vmHost") | Set-Content -LiteralPath $hostsPath -Encoding ascii
    Clear-DnsClientCache
    $hostname = & $multipass exec $vmName -- hostname
    if ($LASTEXITCODE -ne 0 -or ($hostname -join '').Trim() -ne $vmName) {
      Copy-Item -LiteralPath $backup -Destination $hostsPath -Force
      Clear-DnsClientCache
      throw 'Multipass could not authenticate the expected VM. Hosts backup restored; no guest files changed.'
    }
  }
  if (($hostname -join '').Trim() -ne $vmName) { throw 'Unexpected VM hostname.' }
  New-Item -ItemType Directory -Path $stage | Out-Null
  $remote = '/home/ubuntu/planner-update-install-'+[guid]::NewGuid().ToString('N')
  & $multipass exec $vmName -- mkdir -m 700 $remote
  if ($LASTEXITCODE -ne 0) { throw 'Cannot stage updater.' }
  foreach ($name in @('update-launcher.mjs','auto-update.mjs','update-protocol.mjs','install-updates.sh','package.json','package-lock.json')) {
    $target = Join-Path $stage $name
    $text = [IO.File]::ReadAllText((Join-Path (Join-Path $repoRoot 'worker') $name)).Replace("`r`n", "`n")
    [IO.File]::WriteAllText($target,$text,[Text.UTF8Encoding]::new($false))
    & $multipass transfer $target ($vmName+':'+$remote+'/'+$name)
    if ($LASTEXITCODE -ne 0) { throw 'Updater transfer failed.' }
  }
  Assert-Idle
  Write-Output 'Installing updater on the idle VM. Do not start a chat until this finishes.'
  & $multipass exec $vmName -- sudo systemctl stop planner-worker
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop the idle worker.' }
  $stopped=$true
  & $multipass exec $vmName -- sudo bash ($remote+'/install-updates.sh')
  if ($LASTEXITCODE -ne 0) { throw 'Updater installation failed; the previous worker will be restarted.' }
  $stopped=$false
  & $multipass exec $vmName -- systemctl is-active planner-worker
  if ($LASTEXITCODE -ne 0) { throw 'Worker has not started. Inspect planner-worker logs.' }
  Write-Output 'Updater installed. Releases now arrive over outbound HTTPS, without Windows access.'
} finally {
  if ($stopped) { & $multipass exec $vmName -- sudo systemctl start planner-worker }
  if (Test-Path -LiteralPath $stage) {
    Get-ChildItem -LiteralPath $stage -File | ForEach-Object {Remove-Item -LiteralPath $_.FullName}
    Remove-Item -LiteralPath $stage
  }
  if ($ownSession) { try { Invoke-RestMethod -Method Post -Uri ($PlannerOrigin.TrimEnd('/')+'/api/logout') -Headers $headers | Out-Null } catch {} }
  $token=$null; $headers=$null
}
