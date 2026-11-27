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

$targetPath = ''
if ($payload.toolCall -and $payload.toolCall.args -and $payload.toolCall.args.Path) {
  $targetPath = [string]$payload.toolCall.args.Path
}
if (-not $targetPath) {
  Write-Output '{"decision":"allow"}'
  exit 0
}

$norm = $targetPath.Replace('\', '/')

# 1. Never write live secret .env files (allow .env.example)
if ($norm -match '/\.env($|\.(?!example$))') {
  $resp = @{
    decision = 'deny'
    reason = 'Blocked writing secret .env file. Use .env.example or Vercel/Firebase console env management instead.'
  } | ConvertTo-Json -Compress
  Write-Output $resp
  exit 0
}

# 2. Prevent stray .ts/.js files under .agents/ (tsconfig.json has allowJs:true with no include array)
if ($norm -match '/\.agents/.*\.(ts|tsx|js|jsx)$') {
  $resp = @{
    decision = 'deny'
    reason = 'Blocked writing .ts/.js inside .agents/ because tsconfig.json has allowJs:true with no include array. Use PowerShell (.ps1) or Markdown (.md) inside .agents/.'
  } | ConvertTo-Json -Compress
  Write-Output $resp
  exit 0
}

Write-Output '{"decision":"allow"}'
exit 0
