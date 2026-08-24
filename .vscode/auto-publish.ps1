param(
    [int]$IntervalSeconds = 10,
    [int]$StabilizeSeconds = 3
)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$logFile = Join-Path $PSScriptRoot 'auto-commit.log'

function Write-Log {
    param([string]$Message)
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message" | Out-File -FilePath $logFile -Append -Encoding utf8
}

Write-Log "Auto-commit gestartet ($root) - Push bleibt manuell/auf Anfrage"

while ($true) {
    Start-Sleep -Seconds $IntervalSeconds

    $status = git status --porcelain 2>$null
    if ($status) {
        # kurze Stabilisierungspause, damit mehrere schnelle Speicherungen in einen Commit fallen
        Start-Sleep -Seconds $StabilizeSeconds
        git add -A 2>$null
        $msg = "Auto-save: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
        git commit -m $msg 2>$null | Out-Null
        Write-Log "Committed (lokal, nicht gepusht): $msg"
    }
}
