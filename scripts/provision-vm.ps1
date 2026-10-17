param(
  [ValidatePattern('^[a-z0-9_]{3,24}$')][string]$Username = 'arin',
  [string]$PairingCode,
  [string]$PlannerOrigin = 'https://aiplanner-ten.vercel.app'
)
$ErrorActionPreference = 'Stop'
if (!$PairingCode) { $PairingCode = [Console]::ReadLine() }
if ($PairingCode -notmatch '^[A-Za-z0-9_-]{32}$') { throw 'A valid one-time pairing code is required.' }
$repoRoot = Split-Path -Parent $PSScriptRoot
$multipass = 'C:\Program Files\Multipass\bin\multipass.exe'
$vmName = 'planner-' + $Username.Replace('_','-')
if (!(Test-Path -LiteralPath $multipass)) { throw 'Install Multipass first: winget install --id Canonical.Multipass --exact' }
if (!(Get-Service vmms -ErrorAction SilentlyContinue)) { throw 'Hyper-V is waiting for a Windows restart. Restart, then rerun this script.' }
$all = & $multipass list --format json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Could not contact Multipass.' }
$existing = $all.list | Where-Object name -eq $vmName
if (!$existing) {
  & $multipass launch 24.04 --name $vmName --cpus 4 --memory 8G --disk 25G --timeout 300
  if ($LASTEXITCODE -ne 0) { throw 'VM creation failed.' }
} elseif ($existing.state -ne 'Running') {
  & $multipass start $vmName
  if ($LASTEXITCODE -ne 0) { throw 'VM startup failed.' }
}
$staging = Join-Path $env:TEMP ('planner-vm-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
$stagingAcl = Get-Acl -LiteralPath $staging
$stagingAcl.SetAccessRuleProtection($true, $false)
foreach ($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544') | Select-Object -Unique) {
  $rule = [Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $stagingAcl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $staging -AclObject $stagingAcl
try {
  # The coordinator supplies secrets over stdin, never in process args.
  # Multipass on Windows can leave piped remote stdin unread, so transfer the
  # one-use enrollment code over SSH into an owner-only guest directory.
  $enrollment = @{origin=$PlannerOrigin;code=$PairingCode} | ConvertTo-Json -Compress
  & $multipass exec $vmName -- mkdir -p /home/ubuntu/planner-worker
  foreach ($sourceFile in (Get-ChildItem -LiteralPath (Join-Path $repoRoot 'worker') -File)) {
    $stageFile = Join-Path $staging $sourceFile.Name
    # Never copy Windows node_modules or host files into a guest.
    $fileText = [IO.File]::ReadAllText($sourceFile.FullName).Replace("`r`n", "`n")
    [IO.File]::WriteAllText($stageFile, $fileText, [Text.UTF8Encoding]::new($false))
    & $multipass transfer $stageFile ($vmName + ':/home/ubuntu/planner-worker/' + $sourceFile.Name)
    if ($LASTEXITCODE -ne 0) { throw 'Worker file transfer failed.' }
  }
  & $multipass exec $vmName -- sudo bash /home/ubuntu/planner-worker/bootstrap.sh
  if ($LASTEXITCODE -ne 0) { throw 'VM bootstrap failed.' }
  & $multipass exec $vmName -- install -d -m 0700 /home/ubuntu/planner-enrollment
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare private enrollment directory.' }
  $enrollmentFile = Join-Path $staging 'enrollment.json'
  [IO.File]::WriteAllText($enrollmentFile, $enrollment, [Text.UTF8Encoding]::new($false))
  $guestEnrollment = '/home/ubuntu/planner-enrollment/enrollment.json'
  & $multipass transfer $enrollmentFile ($vmName + ':' + $guestEnrollment)
  if ($LASTEXITCODE -ne 0) { throw 'Enrollment transfer failed.' }
  & $multipass exec $vmName -- sudo install -o planner -g planner -m 0600 $guestEnrollment /var/lib/planner/enrollment.json
  if ($LASTEXITCODE -ne 0) { throw 'Could not protect enrollment data.' }
  & $multipass exec $vmName -- rm -f $guestEnrollment
  & $multipass exec $vmName -- sudo -u planner node /opt/planner/enroll.mjs /var/lib/planner/enrollment.json
  if ($LASTEXITCODE -ne 0) { throw 'VM pairing failed. Generate a fresh code in the planner.' }
  & $multipass exec $vmName -- sudo systemctl enable --now planner-worker.service
  if ($LASTEXITCODE -ne 0) { throw 'Worker service did not start.' }
  # The lightweight Windows scheduler wakes guests only when needed.
  # Multipass guests may not support Hyper-V's shutdown integration setting.
  # Keep its safe host-shutdown save behavior; only disable automatic startup.
  if (Get-Command Set-VM -ErrorAction SilentlyContinue) { Set-VM -Name $vmName -AutomaticStartAction Nothing }
  Write-Output "Private VM $vmName is running. Return to the planner and connect AI, then websites."
} finally {
  # No recursive cleanup outside the exact temporary directory created above.
  if (Test-Path -LiteralPath $staging) {
    foreach ($stageFile in (Get-ChildItem -LiteralPath $staging -File)) { Remove-Item -LiteralPath $stageFile.FullName }
    Remove-Item -LiteralPath $staging
  }
}
