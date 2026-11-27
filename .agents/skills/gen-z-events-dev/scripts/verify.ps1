param(
  [switch]$Build,
  [switch]$Git,
  [switch]$Quick,
  [switch]$VerboseOutput
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
Set-Location $repoRoot

function Assert-ExitZero([string]$StepName, [string[]]$CapturedOutput) {
  if ($LASTEXITCODE -ne 0) {
    if ($CapturedOutput -and $CapturedOutput.Count -gt 0) {
      $CapturedOutput | ForEach-Object { Write-Host $_ }
    }
    throw "$StepName failed with exit code $LASTEXITCODE"
  }
}

function Resolve-GitBinary {
  $gitCmd = Get-Command git -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
  if (-not $gitCmd) {
    $gitCmd = Get-ChildItem -Path "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -ExpandProperty FullName -First 1
  }
  return $gitCmd
}

function Write-VerifyStamp {
  $gitCmd = Resolve-GitBinary
  if (-not $gitCmd) { return }
  $statusLines = & $gitCmd -C $repoRoot status --porcelain -- src firestore.rules vite.config.ts eslint.config.mjs tsconfig.json package.json 2>$null
  $stampPath = Join-Path $repoRoot '.git\.verify-stamp'
  if (-not $statusLines -or $statusLines.Count -eq 0) {
    if (Test-Path $stampPath) { Remove-Item $stampPath -Force -ErrorAction SilentlyContinue }
    return
  }
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
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))
  $hash = ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  [System.IO.File]::WriteAllText($stampPath, $hash)
}

# [1/3] TypeScript Check
Write-Host "=== [1/3] TypeScript (tsc --noEmit) ==="
& "$repoRoot\node_modules\.bin\tsc.cmd" --noEmit
Assert-ExitZero "tsc --noEmit" @()
Write-Host "OK: 0 TypeScript errors"

# [2/3] Static Linting (Firestore Rules ESLint + src/ Oxlint)
Write-Host "=== [2/3] Linting (firestore.rules ESLint + src/ Oxlint) ==="
& "$repoRoot\node_modules\.bin\eslint.cmd" firestore.rules
Assert-ExitZero "eslint firestore.rules" @()
if ($VerboseOutput) {
  & "$repoRoot\node_modules\.bin\oxlint.cmd" -c .oxlintrc.json src
} else {
  & "$repoRoot\node_modules\.bin\oxlint.cmd" -c .oxlintrc.json --quiet src
}
Assert-ExitZero "oxlint src" @()
Write-Host "OK: 0 Firestore ESLint errors, 0 src Oxlint errors"

# [3/3] Automated Test Suites (tsx --test)
Write-Host "=== [3/3] Test Suites (tsx --test) ==="
$testFiles = @()
foreach ($dir in @('firestore.rules.test.ts', 'src')) {
  $target = Join-Path $repoRoot $dir
  if (Test-Path $target -PathType Leaf) {
    $testFiles += $dir
  } elseif (Test-Path $target -PathType Container) {
    $found = Get-ChildItem -Path $target -Recurse -Filter '*.test.ts' -File | ForEach-Object {
      $_.FullName.Substring($repoRoot.Length + 1)
    }
    $testFiles += $found
  }
}
$testFiles = $testFiles | Sort-Object
if ($testFiles.Count -eq 0) {
  throw "No *.test.ts files discovered."
}

if ($VerboseOutput) {
  Write-Host "Running $($testFiles.Count) test file(s): $($testFiles -join ', ')"
  & "$repoRoot\node_modules\.bin\tsx.cmd" --test @testFiles
  Assert-ExitZero "tsx --test" @()
} else {
  $prevPref = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $testOut = & "$repoRoot\node_modules\.bin\tsx.cmd" --test @testFiles 2>&1
  $testExit = $LASTEXITCODE
  $ErrorActionPreference = $prevPref
  if ($testExit -ne 0) {
    $testOut | ForEach-Object { Write-Host $_ }
    throw "tsx --test failed with exit code $testExit"
  }
  $summaryLines = $testOut | Where-Object { $_ -match '^ℹ (tests|pass|fail|duration_ms)' }
  Write-Host "Ran $($testFiles.Count) test file(s): $(($summaryLines | ForEach-Object { $_.ToString().Replace('ℹ ', '').Trim() }) -join ' | ')"
}

# Optional Build (skipped when -Quick is set unless -Build is also explicitly passed)
if ($Build -and -not $Quick) {
  Write-Host "=== [Build] Vite Production Build ==="
  if ($VerboseOutput) {
    & "$repoRoot\node_modules\.bin\vite.cmd" build
    Assert-ExitZero "vite build" @()
  } else {
    $prevPref = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $buildOut = & "$repoRoot\node_modules\.bin\vite.cmd" build 2>&1
    $buildExit = $LASTEXITCODE
    $ErrorActionPreference = $prevPref
    if ($buildExit -ne 0) {
      $buildOut | ForEach-Object { Write-Host $_ }
      throw "vite build failed with exit code $buildExit"
    }
    # Filter noisy @firebase/firestore BigInt [TOLERATED_TRANSFORM] blocks while keeping all real output & errors
    $suppressed = 0
    $skippingTolerated = $false
    foreach ($rawLine in $buildOut) {
      $line = $rawLine.ToString()
      if ($line -match '^\[TOLERATED_TRANSFORM\]') {
        $suppressed++
        $skippingTolerated = $true
        continue
      }
      if ($skippingTolerated) {
        if ($line -match '^\s*(╭|│|╰|\d+\s*│|$)') {
          continue
        }
        $skippingTolerated = $false
      }
      if ($line -match '^(✓|dist/|vite v|building|rendering|computing|\[!\]|error|ERROR|warn)') {
        Write-Host $line
      }
    }
    if ($suppressed -gt 0) {
      Write-Host "(Suppressed $suppressed benign legacy BigInt [TOLERATED_TRANSFORM] notices)"
    }
  }

  foreach ($required in @('dist\index.html', 'dist\_redirects')) {
    if (-not (Test-Path (Join-Path $repoRoot $required))) {
      throw "Expected build artifact missing: $required"
    }
  }
  Write-Host "Build artifacts verified: dist\index.html, dist\_redirects"
}

Write-VerifyStamp

if ($Git) {
  Write-Host "=== [Git] Repository Status ==="
  $gitCmd = Resolve-GitBinary
  if ($gitCmd) {
    & $gitCmd -C $repoRoot status -sb
    & $gitCmd -C $repoRoot log -n 2 --oneline
  } else {
    Write-Host "git binary not found on PATH or under GitHubDesktop."
  }
}

Write-Host "`nALL CHECKS PASSED."
