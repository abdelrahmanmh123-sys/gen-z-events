$ErrorActionPreference = 'SilentlyContinue'

$rawInput = [Console]::In.ReadToEnd()
if (-not $rawInput) {
  Write-Output '{"decision":"allow"}'
  exit 0
}

try {
  $payload = $rawInput | ConvertFrom-Json
} catch {
  Write-Output '{"decision":"allow"}'
  exit 0
}

# Only gate normal idle completion; never block cancellations, errors, waiting tasks, or second-pass continuations
if ($payload.terminationReason -ne 'NO_TOOL_CALL') {
  Write-Output '{"decision":"allow"}'
  exit 0
}
if ($payload.continuationActive -eq $true -or $payload.fullyIdle -eq $false) {
  Write-Output '{"decision":"allow"}'
  exit 0
}
if ($payload.lastUserInput -and ([string]$payload.lastUserInput).Trim().StartsWith('/plan')) {
  Write-Output '{"decision":"allow"}'
  exit 0
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$gitCmd = Get-Command git -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $gitCmd) {
  $gitCmd = Get-ChildItem -Path "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -ExpandProperty FullName -First 1
}
if (-not $gitCmd) {
  Write-Output '{"decision":"allow"}'
  exit 0
}

# Check whether any code/rules/config files are dirty
$statusLines = & $gitCmd -C $repoRoot status --porcelain -- src firestore.rules vite.config.ts eslint.config.mjs tsconfig.json package.json 2>$null
if (-not $statusLines -or $statusLines.Count -eq 0) {
  Write-Output '{"decision":"allow"}'
  exit 0
}

# Build a deterministic fingerprint of dirty code files (paths + sizes + mtime ticks)
$parts = New-Object System.Collections.Generic.List[string]
foreach ($line in ($statusLines | Sort-Object)) {
  $rel = $line.Substring(3).Trim().Trim('"')
  $full = Join-Path $repoRoot $rel
  if (Test-Path $full -PathType Leaf) {
    $fi = Get-Item $full
    $parts.Add("$line|$($fi.Length)|$($fi.LastWriteTimeUtc.Ticks)")
  } else {
    $parts.Add("$line|deleted")
  }
}
$joined = $parts -join "`n"
$sha = [System.Security.Cryptography.SHA256]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
$currentHash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()

$stampPath = Join-Path $repoRoot '.git\.verify-stamp'
if (Test-Path $stampPath -PathType Leaf) {
  $savedHash = (Get-Content $stampPath -Raw).Trim()
  if ($savedHash -eq $currentHash) {
    Write-Output '{"decision":"allow"}'
    exit 0
  }
}

$resp = @{
  decision = 'continue'
  reason = 'Unverified code changes detected in src/ or config/rules since the last passing verify.ps1 run. Run powershell -ExecutionPolicy Bypass -File .agents/skills/gen-z-events-dev/scripts/verify.ps1 -Quick (or -Build -Git) before concluding.'
} | ConvertTo-Json -Compress
Write-Output $resp
exit 0
