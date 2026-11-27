$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$outFile = Join-Path $PSScriptRoot '..\references\symbol-index.md'

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# Gen Z Events — Auto-Generated Symbol & Line Index')
$lines.Add('')
$lines.Add('Regenerate via `powershell -ExecutionPolicy Bypass -File .agents/skills/gen-z-events-dev/scripts/gen-index.ps1`.')
$lines.Add('Read this map first to jump straight to exact `StartLine-EndLine` ranges without reading entire files.')
$lines.Add('')

# 1. Firestore rules collections & helper functions
$rulesPath = Join-Path $repoRoot 'firestore.rules'
if (Test-Path $rulesPath) {
  $rulesContent = Get-Content $rulesPath
  $lines.Add("## firestore.rules ($($rulesContent.Count) lines)")
  $rulesMatches = @()
  for ($i = 0; $i -lt $rulesContent.Count; $i++) {
    $line = $rulesContent[$i]
    if ($line -match '^\s*(function\s+([a-zA-Z0-9_]+)\s*\(|match\s+(/[a-zA-Z0-9_{}/]+)\s*\{)') {
      if ($Matches[2]) {
        $rulesMatches += "$($Matches[2]):L$($i + 1)"
      } elseif ($Matches[3] -and $Matches[3] -ne '/databases/{database}/documents') {
        $rulesMatches += "match $($Matches[3]):L$($i + 1)"
      }
    }
  }
  $lines.Add(($rulesMatches -join ', '))
  $lines.Add('')
}

# 2. All production TypeScript/TSX modules under src/
$srcRoot = Join-Path $repoRoot 'src'
$files = Get-ChildItem -Path $srcRoot -Recurse -File | Where-Object {
  ($_.Extension -eq '.ts' -or $_.Extension -eq '.tsx') -and -not $_.Name.EndsWith('.test.ts')
} | Sort-Object FullName

$lines.Add('## Source Modules (`src/`)')
$lines.Add('')
$lines.Add('| File | Lines | Exports (`Symbol:Line`) |')
$lines.Add('| :--- | ---: | :--- |')

foreach ($file in $files) {
  $rel = $file.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
  $content = Get-Content $file.FullName
  $lineCount = $content.Count
  $exports = New-Object System.Collections.Generic.List[string]

  for ($i = 0; $i -lt $lineCount; $i++) {
    $l = $content[$i]
    if ($l -match '^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|enum|interface|type)\s+([A-Za-z0-9_]+)') {
      $exports.Add("$($Matches[1]):L$($i + 1)")
    } elseif ($l -match '^export\s+\*\s+from\s+[''"]([^''"]+)[''"]') {
      $exports.Add("re-export $($Matches[1]):L$($i + 1)")
    } elseif ($l -match '^export\s+\{([^}]+)\}\s+from\s+[''"]([^''"]+)[''"]') {
      $names = ($Matches[1] -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) -join ', '
      $exports.Add("re-export {$names}:L$($i + 1)")
    }
  }

  $exportSummary = if ($exports.Count -gt 0) { $exports -join ', ' } else { '*(module)*' }
  $lines.Add("| ``$rel`` | $lineCount | $exportSummary |")
}

# 3. Test Suites Summary
$testFiles = @()
if (Test-Path (Join-Path $repoRoot 'firestore.rules.test.ts')) {
  $testFiles += Get-Item (Join-Path $repoRoot 'firestore.rules.test.ts')
}
$testFiles += Get-ChildItem -Path $srcRoot -Recurse -Filter '*.test.ts' -File | Sort-Object FullName
if (Test-Path (Join-Path $repoRoot 'tests')) {
  $testFiles += Get-ChildItem -Path (Join-Path $repoRoot 'tests') -Recurse -Filter '*.test.ts' -File | Sort-Object FullName
}

$lines.Add('')
$lines.Add('## Test Suites')
$lines.Add('')
$lines.Add('| Test File | Lines |')
$lines.Add('| :--- | ---: |')
foreach ($tf in $testFiles) {
  $rel = $tf.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
  $lc = (Get-Content $tf.FullName | Measure-Object -Line).Lines
  $lines.Add("| ``$rel`` | $lc |")
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($outFile, $lines, $utf8NoBom)
Write-Host "Generated symbol index: $outFile ($($files.Count) source modules, $($testFiles.Count) test suites)"
