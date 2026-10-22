# Spec: 10-2 §E.1 PERF-12 and 09-windows §9.2–§9.3 (first run on an isolated per-user install).
# This is a fixture-only harness. It never uses the current user's foo install or profile: the NSIS /D target,
# FOO_DATA_DIR/FOO_LOCAL_DIR and Electron APPDATA/LOCALAPPDATA are descendants of RUNNER_TEMP. The exact Welcome-card timing remains a UI check owned by
# PR97's Windows UI harness; this script proves that a clean fixture starts and creates its own data roots.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Installer,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$TimeoutSeconds = 90,
  [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) { throw "BLOCKED: $Message" }

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Fail 'lane-e-first-run requires Windows.' }
if (-not $env:RUNNER_TEMP) { Fail 'RUNNER_TEMP is required so fixture paths cannot fall back to a user profile.' }
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) { Fail "installer not found: $Installer" }

function FullPath([string]$Path) { [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path) }
function Assert-Descendant([string]$Path, [string]$Root, [string]$Label) {
  $p = [IO.Path]::GetFullPath($Path).TrimEnd('\')
  $r = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  if (-not $p.StartsWith($r + '\', [StringComparison]::OrdinalIgnoreCase)) {
    Fail "$Label must be below RUNNER_TEMP; got $p"
  }
}
function New-Child([string]$File, [string]$Arguments, [hashtable]$Environment, [string]$WorkingDirectory) {
  $si = [Diagnostics.ProcessStartInfo]::new()
  $si.FileName = $File
  $si.Arguments = $Arguments
  $si.WorkingDirectory = $WorkingDirectory
  $si.UseShellExecute = $false
  $si.CreateNoWindow = $true
  foreach ($entry in $Environment.GetEnumerator()) { $si.EnvironmentVariables[$entry.Key] = [string]$entry.Value }
  $p = [Diagnostics.Process]::new()
  $p.StartInfo = $si
  if (-not $p.Start()) { throw "could not start $File" }
  return $p
}
function Stop-Exact([Diagnostics.Process]$Process) {
  if ($null -eq $Process) { return }
  try {
    if (-not $Process.HasExited) {
      [void]$Process.CloseMainWindow()
      if (-not $Process.WaitForExit(15000)) {
        $Process.Kill()
        [void]$Process.WaitForExit(15000)
      }
    }
  } catch { Write-Warning "could not stop fixture process $($Process.Id): $($_.Exception.Message)" }
}
function Write-Results([object[]]$Rows, [string]$File) {
  $Rows | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $File -Encoding utf8
}
function Write-InstallDiagnostic([string]$Stage, [string]$InstallerPath, [string]$TargetDir, [string]$Root, [string]$File) {
  Assert-Descendant $TargetDir $Root 'diagnostic target'
  $installer = Get-Item -LiteralPath $InstallerPath -ErrorAction Stop
  $entries = @(Get-ChildItem -LiteralPath $TargetDir -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
  $entryText = if ($entries.Count -gt 0) { [string]::Join(';', [string[]]$entries) } else { '<empty>' }
  $diagnostic = [pscustomobject]@{
    stage = $Stage
    installer = $InstallerPath
    installerBytes = $installer.Length
    installerSha256 = (Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256).Hash
    target = $TargetDir
    targetEntries = $entryText
  }
  $diagnostic | ConvertTo-Json -Compress | Add-Content -LiteralPath $File -Encoding utf8
  Write-Host "[diag] $Stage installer=$InstallerPath bytes=$($installer.Length) sha256=$($diagnostic.installerSha256) target=$TargetDir entries=$entryText"
}

$runnerTemp = FullPath $env:RUNNER_TEMP
$stamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$fixtureRoot = Join-Path $runnerTemp "foo-lane-e-first-run-$PID-$stamp"
$installDir = Join-Path $fixtureRoot 'install'
$dataDir = Join-Path $fixtureRoot 'data'
$localDir = Join-Path $fixtureRoot 'local'
$outDir = Join-Path $fixtureRoot 'runtime-out'
$electronAppData = Join-Path $fixtureRoot 'electron-appdata'
$electronLocalAppData = Join-Path $fixtureRoot 'electron-localappdata'
$reportDir = [IO.Path]::GetFullPath($Out)
Assert-Descendant $fixtureRoot $runnerTemp 'fixture root'
Assert-Descendant $reportDir $runnerTemp 'report directory'
Assert-Descendant $Installer $runnerTemp 'installer'
New-Item -ItemType Directory -Force -Path $fixtureRoot, $reportDir | Out-Null

$rows = [Collections.Generic.List[object]]::new()
function Row([string]$Check, [string]$Result, [string]$Detail) {
  $rows.Add([pscustomobject]@{ check = $Check; result = $Result; detail = $Detail })
  Write-Host "[$Result] $Check $Detail"
}

$app = $null
try {
  New-Item -ItemType Directory -Force -Path $installDir, $dataDir, $localDir, $outDir, $electronAppData, $electronLocalAppData | Out-Null
  $installerPath = FullPath $Installer
  $diagnostics = Join-Path $reportDir 'lane-e-install-diagnostics.jsonl'
  Write-InstallDiagnostic 'before-install' $installerPath $installDir $fixtureRoot $diagnostics
  $install = Start-Process -FilePath $installerPath -ArgumentList @('/S', ('/D=' + $installDir)) -Wait -PassThru -WindowStyle Hidden
  Write-InstallDiagnostic 'after-install' $installerPath $installDir $fixtureRoot $diagnostics
  $exe = Join-Path $installDir 'foo.exe'
  $installResult = if ($install.ExitCode -eq 0) { 'pass' } else { 'fail' }
  $exeResult = if (Test-Path -LiteralPath $exe -PathType Leaf) { 'pass' } else { 'fail' }
  Row 'fixture installer exits successfully' $installResult "exit=$($install.ExitCode)"
  Row 'fixture install contains foo.exe' $exeResult $exe
  if ($install.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'fixture install did not produce foo.exe' }

  $envs = @{
    FOO_TEST = '1'
    FOO_DATA_DIR = $dataDir
    FOO_LOCAL_DIR = $localDir
    FOO_OUT_DIR = $outDir
    APPDATA = $electronAppData
    LOCALAPPDATA = $electronLocalAppData
  }
  $started = [Diagnostics.Stopwatch]::StartNew()
  $app = New-Child $exe '' $envs $installDir
  $db = Join-Path $dataDir 'data\foo.db'
  $settings = Join-Path $dataDir 'settings.json'
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline -and (-not (Test-Path -LiteralPath $db -PathType Leaf) -or -not (Test-Path -LiteralPath $settings -PathType Leaf))) {
    if ($app.HasExited) { throw "fixture app exited early with code $($app.ExitCode)" }
    Start-Sleep -Milliseconds 250
  }
  $started.Stop()
  $ready = (Test-Path -LiteralPath $db -PathType Leaf) -and (Test-Path -LiteralPath $settings -PathType Leaf)
  $readyResult = if ($ready) { 'pass' } else { 'fail' }
  Row 'clean fixture creates settings and SQLite data' $readyResult "elapsedMs=$($started.ElapsedMilliseconds)"
  Row 'PERF-12 Welcome card timing' 'blocked' 'exact Install tap → Welcome card requires PR97 Windows UI automation; file bootstrap is not UI proof'
  $profileResult = if ((Test-Path -LiteralPath $dataDir) -and (Test-Path -LiteralPath $localDir)) { 'pass' } else { 'fail' }
  Row 'fixture profile is outside the user foo profile' $profileResult "data=$dataDir local=$localDir"
  Stop-Exact $app
  $app = $null

  $uninstaller = Join-Path $installDir 'Uninstall foo.exe'
  if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) { Row 'fixture uninstaller is present' 'fail' $uninstaller }
  else {
    $un = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
    Start-Sleep -Milliseconds 500
    $unResult = if ($un.ExitCode -eq 0) { 'pass' } else { 'fail' }
    $exeRemovedResult = if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { 'pass' } else { 'fail' }
    $dataResult = if (Test-Path -LiteralPath $dataDir) { 'pass' } else { 'blocked' }
    Row 'fixture uninstall exits successfully' $unResult "exit=$($un.ExitCode)"
    Row 'fixture uninstall removes installed executable' $exeRemovedResult $exe
    Row 'fixture data remains under the isolated profile for inspection' $dataResult $dataDir
  }
}
catch {
  Row 'first-run harness execution' 'fail' $_.Exception.Message
}
finally {
  Stop-Exact $app
  $json = Join-Path $reportDir 'lane-e-first-run.json'
  Write-Results $rows $json
  $md = @('| Check | Result | Detail |', '|---|---|---|') + ($rows | ForEach-Object { "| $($_.check) | $($_.result) | $($_.detail -replace '\|', '/') |" })
  $md | Set-Content -LiteralPath (Join-Path $reportDir 'lane-e-first-run.md') -Encoding utf8
  if (-not $KeepArtifacts -and (Test-Path -LiteralPath $fixtureRoot)) {
    Assert-Descendant $fixtureRoot $runnerTemp 'cleanup root'
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
  }
}

if (@($rows | Where-Object result -eq 'fail').Count -gt 0) { exit 1 }
if (@($rows | Where-Object result -eq 'blocked').Count -gt 0) { exit 2 }
exit 0
