$ErrorActionPreference = 'Stop'
$env:BH_RECORD = '0'
$env:BH_TAB_MARKER = '0'
$harnessPath = Join-Path $env:USERPROFILE '.local\bin\browser-harness.exe'
$mutex = New-Object System.Threading.Mutex($false, 'Local\AIPlannerChromeDebugConnection')
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
    if (-not (Test-Path -LiteralPath $harnessPath)) { exit 1 }
    $health = & $harnessPath doctor --json --require-existing-daemon 2>$null | ConvertFrom-Json
    if ($health.healthy) { exit 0 }
    # One connection attempt per logon. Never loop on Chrome's approval prompt.
    "print('Persistent Chrome debugging daemon connected')" | & $harnessPath
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
