# Spec: 09-windows §9.2–§9.9 and §9.18/§9.23 (Lane E Windows evidence aggregation).
# PR97 owns the packaged install/window/Credential Manager/AUMID checks. This entrypoint consumes those results instead of
# re-running them, adds isolated first-run and 04f01dd→current upgrade fixtures, and turns PR97's explicit tray/toast gaps
# into blocked rows. It never invokes PR97's hardcoded user-profile install path.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Pr97Results,
  [string]$Pr97BuildSha,
  [string]$Pr97EvidenceUrl,
  [string]$Installer,
  [string]$PreviousInstaller,
  [string]$CurrentInstaller,
  [string]$PreviousBuildSha = '04f01dd',
  [string]$CurrentBuildSha,
  [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'
function Fail([string]$Message) { throw "BLOCKED: $Message" }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Fail 'lane-e-windows requires Windows.' }
if (-not $env:RUNNER_TEMP) { Fail 'RUNNER_TEMP is required for safe fixture paths.' }
function FullPath([string]$Path) { [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path) }
function Assert-Descendant([string]$Path, [string]$Root, [string]$Label) {
  $p = [IO.Path]::GetFullPath($Path).TrimEnd('\')
  $r = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  if (-not $p.StartsWith($r + '\', [StringComparison]::OrdinalIgnoreCase)) { Fail "$Label must be below RUNNER_TEMP; got $p" }
}
function Row([Collections.Generic.List[object]]$Rows, [string]$Check, [string]$Result, [string]$Detail) {
  $Rows.Add([pscustomobject]@{ check = $Check; result = $Result; detail = $Detail })
  Write-Host "[$Result] $Check $Detail"
}

$runnerTemp = FullPath $env:RUNNER_TEMP
$reportDir = [IO.Path]::GetFullPath($Out)
Assert-Descendant $reportDir $runnerTemp 'report directory'
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$rows = [Collections.Generic.List[object]]::new()

try {
  if (-not $Pr97Results) {
    Row $rows 'PR97 packaged install/window/keychain result set' 'blocked' 'pass -Pr97Results pointing at PR97 run-checks results.json; no duplicate run is performed'
  } elseif (-not (Test-Path -LiteralPath $Pr97Results -PathType Leaf)) {
    Row $rows 'PR97 packaged install/window/keychain result set' 'blocked' "result file not found: $Pr97Results"
  } else {
    Assert-Descendant (FullPath $Pr97Results) $runnerTemp 'PR97 result file'
    $source = Get-Content -Raw -LiteralPath $Pr97Results | ConvertFrom-Json
    $sourceBuildSha = [string]$Pr97BuildSha
    $sourceEvidenceUrl = [string]$Pr97EvidenceUrl
    if ($source -isnot [array]) {
      if (-not $sourceBuildSha -and $source.PSObject.Properties.Name -contains 'buildSha') { $sourceBuildSha = [string]$source.buildSha }
      if (-not $sourceEvidenceUrl -and $source.PSObject.Properties.Name -contains 'evidenceUrl') { $sourceEvidenceUrl = [string]$source.evidenceUrl }
    }
    $provenance = (-not [string]::IsNullOrWhiteSpace($sourceBuildSha)) -and (-not [string]::IsNullOrWhiteSpace($sourceEvidenceUrl))
    $provenanceDetail = if ($provenance) { "buildSha=$sourceBuildSha evidence=$sourceEvidenceUrl" } else { 'source result lacks current build SHA and run/log evidence URL' }
    $wanted = @{
      'silent install (/S) exits 0' = 'install';
      'installed per user under %LOCALAPPDATA%\Programs\foo' = 'install';
      'Apps & features entry under HKCU (no admin)' = 'install';
      'Start menu shortcut' = 'install';
      'foo:// links registered for this user' = 'install';
      'silent uninstall removes foo.exe' = 'uninstall';
      'silent uninstall removes the Apps & features entry' = 'uninstall';
      'silent uninstall removes the Start menu shortcut' = 'uninstall';
      'uninstaller present' = 'uninstall';
      'Credential Manager: foo writes a secret and reads it back' = 'keychain';
      'Credential Manager: Windows lists the entry (cmdkey)' = 'keychain';
      'Credential Manager: foo deletes it and it is gone' = 'keychain';
      'tray icon' = 'tray';
      'foo''s own toasts' = 'notifications';
      'a toast under foo''s AUMID is accepted by Windows' = 'notifications';
    }
    $handled = @{}
    foreach ($name in $wanted.Keys) {
      $handled[$name] = $true
      $row = @($source | Where-Object { $_.check -eq $name }) | Select-Object -First 1
      if (-not $row) { Row $rows "PR97 $($wanted[$name]): $name" 'blocked' 'source result is absent; no inference from other checks' }
      elseif ($row.status -eq 'pass' -and $provenance) { Row $rows "PR97 $($wanted[$name]): $name" 'pass' "consumed from PR97 results.json; $provenanceDetail" }
      elseif ($row.status -eq 'pass') { Row $rows "PR97 $($wanted[$name]): $name" 'blocked' "unverified PR97 pass; $provenanceDetail" }
      elseif ($row.status -eq 'gap') { Row $rows "PR97 $($wanted[$name]): $name" 'blocked' "PR97 explicitly reports an unbuilt product feature: $($row.detail)" }
      else { Row $rows "PR97 $($wanted[$name]): $name" 'fail' "consumed from PR97 results.json: $($row.detail)" }
    }
    foreach ($row in @($source)) {
      $name = [string]$row.check
      if ($handled.ContainsKey($name)) { continue }
      $result = if ($row.status -eq 'pass' -and $provenance) { 'pass' } elseif ($row.status -eq 'pass' -or $row.status -eq 'gap') { 'blocked' } else { 'fail' }
      $detail = if ($row.status -eq 'pass') { "consumed from PR97 results.json; $provenanceDetail" } else { "consumed from PR97 results.json: $($row.detail)" }
      Row $rows "PR97 delegated: $name" $result $detail
    }
  }

  $currentArtifact = if ($CurrentInstaller) { $CurrentInstaller } else { $Installer }
  if (-not $currentArtifact) {
    Row $rows 'isolated clean-profile first run' 'blocked' 'provide -Installer under RUNNER_TEMP; no install is attempted without a fixture artifact'
  } elseif (-not (Test-Path -LiteralPath $currentArtifact -PathType Leaf)) {
    Row $rows 'isolated clean-profile first run' 'blocked' "installer not found: $currentArtifact"
  } else {
    Assert-Descendant (FullPath $currentArtifact) $runnerTemp 'current installer'
    $firstOut = Join-Path $reportDir 'first-run'
    New-Item -ItemType Directory -Force -Path $firstOut | Out-Null
    & (Join-Path $PSScriptRoot 'lane-e-first-run.ps1') -Installer (FullPath $currentArtifact) -Out $firstOut -KeepArtifacts:$KeepArtifacts
    $code = $LASTEXITCODE
    if (Test-Path -LiteralPath (Join-Path $firstOut 'lane-e-first-run.json')) {
      $first = Get-Content -Raw -LiteralPath (Join-Path $firstOut 'lane-e-first-run.json') | ConvertFrom-Json
      foreach ($item in @($first)) { Row $rows "first-run: $($item.check)" $item.result $item.detail }
    } else { Row $rows 'isolated clean-profile first run' 'blocked' "first-run harness did not emit results (exit $code)" }
  }

  if (-not $PreviousInstaller -or -not $currentArtifact) {
    Row $rows '04f01dd old-build to current-build upgrade fixture' 'blocked' 'provide -PreviousInstaller, -CurrentInstaller and explicit build SHA metadata; no upgrade is attempted without both artifacts'
  } elseif (-not (Test-Path -LiteralPath $PreviousInstaller -PathType Leaf)) {
    Row $rows '04f01dd old-build to current-build upgrade fixture' 'blocked' "old-build installer not found: $PreviousInstaller"
  } elseif (-not (Test-Path -LiteralPath $currentArtifact -PathType Leaf)) {
    Row $rows '04f01dd old-build to current-build upgrade fixture' 'blocked' "current-build installer not found: $currentArtifact"
  } elseif (-not $CurrentBuildSha) {
    Row $rows '04f01dd old-build to current-build upgrade fixture' 'blocked' 'current build SHA metadata is required; no upgrade is attempted without provenance'
  } else {
    Assert-Descendant (FullPath $PreviousInstaller) $runnerTemp 'old-build installer'
    Assert-Descendant (FullPath $currentArtifact) $runnerTemp 'current-build installer'
    $upgradeOut = Join-Path $reportDir 'upgrade'
    New-Item -ItemType Directory -Force -Path $upgradeOut | Out-Null
    & (Join-Path $PSScriptRoot 'lane-e-upgrade.ps1') -PreviousInstaller (FullPath $PreviousInstaller) -CurrentInstaller (FullPath $currentArtifact) -PreviousBuildSha $PreviousBuildSha -CurrentBuildSha $CurrentBuildSha -Out $upgradeOut -KeepArtifacts:$KeepArtifacts
    $upgradeCode = $LASTEXITCODE
    $upgradeResults = Join-Path $upgradeOut 'lane-e-upgrade.json'
    if (Test-Path -LiteralPath $upgradeResults) {
      $upgrade = Get-Content -Raw -LiteralPath $upgradeResults | ConvertFrom-Json
      foreach ($item in @($upgrade)) { Row $rows "upgrade: $($item.check)" $item.result $item.detail }
    } else { Row $rows '04f01dd old-build to current-build upgrade fixture' 'blocked' "upgrade harness did not emit results (exit $upgradeCode)" }
  }
}
catch { Row $rows 'Windows lane prerequisite and aggregation' 'blocked' $_.Exception.Message }
finally {
  $rows | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir 'lane-e-windows.json') -Encoding utf8
  $md = @('| Check | Result | Detail |', '|---|---|---|') + ($rows | ForEach-Object { "| $($_.check) | $($_.result) | $($_.detail -replace '\|', '/') |" })
  $md | Set-Content -LiteralPath (Join-Path $reportDir 'lane-e-windows.md') -Encoding utf8
}

if (@($rows | Where-Object result -eq 'fail').Count -gt 0) { exit 1 }
if (@($rows | Where-Object result -eq 'blocked').Count -gt 0) { exit 2 }
exit 0
