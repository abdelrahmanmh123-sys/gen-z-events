param(
  [switch]$Build,
  [switch]$Git
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')
Set-Location $repoRoot

function Assert-ExitZero([string]$StepName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$StepName failed with exit code $LASTEXITCODE"
  }
}

Write-Host "=== [1/3] TypeScript Check (tsc --noEmit) ==="
& "$repoRoot\node_modules\.bin\tsc.cmd" --noEmit
Assert-ExitZero "tsc --noEmit"

Write-Host "`n=== [2/3] Firestore Security Rules ESLint ==="
& "$repoRoot\node_modules\.bin\eslint.cmd" firestore.rules
Assert-ExitZero "eslint firestore.rules"

Write-Host "`n=== [3/3] Automated Test Suites (tsx --test) ==="
$testFiles = @()
foreach ($dir in @('firestore.rules.test.ts', 'src')) {
  $target = Join-Path $repoRoot $dir
  if (Test-Path $target -PathType Leaf) {
    $testFiles += $dir
  } elseif (Test-Path $target -PathType Container) {
    $found = Get-ChildItem -Path $target -Recurse -Filter '*.test.ts' -File | ForEach-Object {
      $_.FullName.Substring($repoRoot.Path.Length + 1)
    }
    $testFiles += $found
  }
}
$testFiles = $testFiles | Sort-Object
if ($testFiles.Count -eq 0) {
  throw "No *.test.ts files discovered."
}
Write-Host "Running $($testFiles.Count) test file(s): $($testFiles -join ', ')"
& "$repoRoot\node_modules\.bin\tsx.cmd" --test @testFiles
Assert-ExitZero "tsx --test"

if ($Build) {
  Write-Host "`n=== [Build] Vite Production Build ==="
  & "$repoRoot\node_modules\.bin\vite.cmd" build
  Assert-ExitZero "vite build"

  foreach ($required in @('dist\index.html', 'dist\_redirects')) {
    if (-not (Test-Path (Join-Path $repoRoot $required))) {
      throw "Expected build artifact missing: $required"
    }
  }
  Write-Host "Build artifacts verified: dist\index.html, dist\_redirects"
}

if ($Git) {
  Write-Host "`n=== [Git] Repository Status ==="
  $gitCmd = Get-Command git -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
  if (-not $gitCmd) {
    $gitCmd = Get-ChildItem -Path "$env:LOCALAPPDATA\GitHubDesktop\app-*\resources\app\git\cmd\git.exe" -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -ExpandProperty FullName -First 1
  }
  if ($gitCmd) {
    & $gitCmd -C $repoRoot status -sb
    & $gitCmd -C $repoRoot log -n 2 --oneline
  } else {
    Write-Host "git binary not found on PATH or under GitHubDesktop."
  }
}

Write-Host "`nALL CHECKS PASSED."
