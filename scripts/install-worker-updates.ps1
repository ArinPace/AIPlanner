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
$sshTarget = $null
$sshOptions = @()
$ssh = Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
$scp = Join-Path $env:WINDIR 'System32/OpenSSH/scp.exe'
function Invoke-Guest([string[]]$Command) {
  $ErrorActionPreference='Continue'
  if ($script:sshTarget) { $output=& $script:ssh @script:sshOptions $script:sshTarget ($Command -join ' ') 2>&1 }
  else { $output=& $script:multipass exec $script:vmName -- @Command 2>&1 }
  $code=$LASTEXITCODE
  if ($code -ne 0) { throw ('VM command failed (exit '+$code+'): '+(($output|ForEach-Object {"$_"}) -join "`n")) }
  $output | ForEach-Object {"$_"}
}
try {
  Assert-Idle
  New-Item -ItemType Directory -Path $stage | Out-Null
  # Restrict the directory before placing a temporary SSH key inside it.
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=Get-Acl -LiteralPath $stage
  $acl.SetAccessRuleProtection($true,$false)
  $acl.SetOwner($identity)
  foreach ($sid in @($identity.Value,'S-1-5-18') | Select-Object -Unique) {
    $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $stage -AclObject $acl
  $vms = & $multipass list --format json | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or !($vms.list | Where-Object {$_.name -eq $vmName -and $_.state -eq 'Running'})) { throw 'The existing VM must be running. This installer never creates a VM.' }
  $ErrorActionPreference='Continue'
  $hostname = & $multipass exec $vmName -- hostname 2>$null
  $probeExit=$LASTEXITCODE
  $ErrorActionPreference='Stop'
  if ($probeExit -ne 0) {
    Write-Output 'Multipass management is unavailable; using authenticated SSH to the verified Hyper-V adapter.'
    $adapters=@(Get-VMNetworkAdapter -VMName $vmName)
    $macs=@($adapters | ForEach-Object {$_.MacAddress.Replace('-','').Replace(':','').ToUpperInvariant()})
    $addresses = @($adapters | ForEach-Object IPAddresses | Where-Object {$_ -match '^\d+\.\d+\.\d+\.\d+$'})
    if (!$addresses.Count) { $addresses = @(Resolve-DnsName $vmHost -Type A | ForEach-Object IPAddress | Where-Object {$_}) }
    $address=$null
    foreach ($candidate in ($addresses | Select-Object -Unique)) {
      if (!(Test-NetConnection $candidate -Port 22 -InformationLevel Quiet -WarningAction SilentlyContinue)) { continue }
      $neighbors=@(Get-NetNeighbor -IPAddress $candidate -ErrorAction SilentlyContinue)
      if (@($neighbors | Where-Object {$macs -contains $_.LinkLayerAddress.Replace('-','').Replace(':','').ToUpperInvariant()}).Count) { $address=$candidate; break }
    }
    if (!$address) { throw 'No reachable SSH address matched the existing VM MAC address. No guest files changed.' }
    $keyRoots=@('C:/ProgramData/Multipass','C:/Windows/System32/config/systemprofile/AppData/Roaming/Multipass')
    $keys=@($keyRoots | Where-Object {Test-Path -LiteralPath $_} | ForEach-Object {Get-ChildItem -LiteralPath $_ -Filter id_rsa -Recurse -File -ErrorAction SilentlyContinue})
    if (!$keys.Count) { throw 'Existing Multipass SSH key not found. No credentials were changed.' }
    $keyPath=Join-Path $stage 'temporary-ssh-key'
    $sshOptions=@('-i',$keyPath,'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=accept-new','-o','LogLevel=ERROR','-o',('UserKnownHostsFile='+(Join-Path $stage 'known_hosts')),'-o','ConnectTimeout=10')
    $sshTarget='ubuntu@'+$address
    $verified=$false
    foreach ($key in $keys) {
      # OpenSSH rejects Multipass's broad key ACL. Leave its original untouched.
      [IO.File]::WriteAllBytes($keyPath,[IO.File]::ReadAllBytes($key.FullName))
      $keyAcl=Get-Acl -LiteralPath $keyPath
      $keyAcl.SetOwner($identity)
      Set-Acl -LiteralPath $keyPath -AclObject $keyAcl
      try { $hostname=Invoke-Guest -Command @('hostname'); $verified=$true; break }
      catch { $sshFailure=$_.Exception.Message }
    }
    if (!$verified) { throw ('Existing VM SSH authentication failed: '+$sshFailure) }
  }
  if (($hostname -join '').Trim() -ne $vmName) { throw ('Unexpected VM hostname: '+(($hostname -join '').Trim())+'. Expected '+$vmName+'. No guest files changed.') }
  $remote = '/home/ubuntu/planner-update-install-'+[guid]::NewGuid().ToString('N')
  Invoke-Guest -Command @('mkdir','-m','700',$remote)
  foreach ($name in @('update-launcher.mjs','auto-update.mjs','update-protocol.mjs','install-updates.sh','package.json','package-lock.json')) {
    $target = Join-Path $stage $name
    $text = [IO.File]::ReadAllText((Join-Path (Join-Path $repoRoot 'worker') $name)).Replace("`r`n", "`n")
    [IO.File]::WriteAllText($target,$text,[Text.UTF8Encoding]::new($false))
    if ($sshTarget) {
      $ErrorActionPreference='Continue'
      $transferOutput=& $scp @sshOptions $target ($sshTarget+':'+$remote+'/'+$name) 2>&1
      $transferExit=$LASTEXITCODE
      $ErrorActionPreference='Stop'
      if ($transferExit -ne 0) { throw ('Updater transfer failed: '+($transferOutput -join "`n")) }
    } else {
      & $multipass transfer $target ($vmName+':'+$remote+'/'+$name)
      if ($LASTEXITCODE -ne 0) { throw 'Updater transfer failed.' }
    }
  }
  Assert-Idle
  Write-Output 'Installing updater on the idle VM. Do not start a chat until this finishes.'
  Invoke-Guest -Command @('sudo','systemctl','stop','planner-worker')
  $stopped=$true
  Invoke-Guest -Command @('sudo','bash',($remote+'/install-updates.sh'))
  $stopped=$false
  Invoke-Guest -Command @('systemctl','is-active','planner-worker')
  Write-Output 'Updater installed. Releases now arrive over outbound HTTPS, without Windows access.'
} finally {
  if ($stopped) { try { Invoke-Guest -Command @('sudo','systemctl','start','planner-worker') } catch { Write-Warning $_.Exception.Message } }
  if (Test-Path -LiteralPath $stage) {
    Get-ChildItem -LiteralPath $stage -File | ForEach-Object {Remove-Item -LiteralPath $_.FullName}
    Remove-Item -LiteralPath $stage
  }
  if ($ownSession) { try { Invoke-RestMethod -Method Post -Uri ($PlannerOrigin.TrimEnd('/')+'/api/logout') -Headers $headers | Out-Null } catch {} }
  $token=$null; $headers=$null
}
