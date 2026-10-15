param([string]$ConfigPath)
$ErrorActionPreference = 'Stop'
if (!$ConfigPath) { throw 'Pass the private VM host configuration file.' }
$resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
$repoRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node.exe).Source
$scriptPath = Join-Path $repoRoot 'host/main.mjs'
$action = New-ScheduledTaskAction -Execute $nodePath -Argument ('"' + $scriptPath + '" "' + $resolvedConfig + '"') -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'AIPlanner-VM-Host' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'AIPlanner-VM-Host'
Write-Output 'The private VM host starts with Windows. New accounts will receive isolated VMs as capacity becomes available.'
