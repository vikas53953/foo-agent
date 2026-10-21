# Spec: 09-windows §9.3/§9.23 and 08-1 §4.1–§4.3 (previous release → current release with data and a running job).
# Every install target, data directory and Electron APPDATA/LOCALAPPDATA root is a child of RUNNER_TEMP. The harness
# refuses a missing release artifact and never reads or writes the user's %APPDATA%, %LOCALAPPDATA% or Windows Credential Manager.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PreviousInstaller,
  [Parameter(Mandatory = $true)][string]$CurrentInstaller,
  [Parameter(Mandatory = $true)][string]$Out,
  [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'
function Fail([string]$Message) { throw "BLOCKED: $Message" }
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Fail 'lane-e-upgrade requires Windows.' }
if (-not $env:RUNNER_TEMP) { Fail 'RUNNER_TEMP is required for isolated fixture paths.' }
foreach ($installer in @($PreviousInstaller, $CurrentInstaller)) {
  if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { Fail "release installer not found: $installer" }
}

function FullPath([string]$Path) { [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path) }
function Assert-Descendant([string]$Path, [string]$Root, [string]$Label) {
  $p = [IO.Path]::GetFullPath($Path).TrimEnd('\')
  $r = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  if (-not $p.StartsWith($r + '\', [StringComparison]::OrdinalIgnoreCase)) { Fail "$Label must be below RUNNER_TEMP; got $p" }
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
      if (-not $Process.WaitForExit(15000)) { $Process.Kill(); [void]$Process.WaitForExit(15000) }
    }
  } catch { Write-Warning "could not stop fixture process $($Process.Id): $($_.Exception.Message)" }
}
function Start-Release([string]$Exe, [string]$InstallDir, [string]$DataDir, [string]$LocalDir, [string]$OutDir) {
  New-Child $Exe '' @{
    FOO_TEST = '1'; FOO_DATA_DIR = $DataDir; FOO_LOCAL_DIR = $LocalDir; FOO_OUT_DIR = $OutDir; APPDATA = $electronAppData; LOCALAPPDATA = $electronLocalAppData
  } $InstallDir
}
function Wait-Profile([Diagnostics.Process]$Process, [string]$DataDir) {
  $db = Join-Path $DataDir 'data\foo.db'
  $settings = Join-Path $DataDir 'settings.json'
  $deadline = [DateTime]::UtcNow.AddSeconds(90)
  while ([DateTime]::UtcNow -lt $deadline -and (-not (Test-Path -LiteralPath $db -PathType Leaf) -or -not (Test-Path -LiteralPath $settings -PathType Leaf))) {
    if ($Process.HasExited) { throw "fixture app exited early with code $($Process.ExitCode)" }
    Start-Sleep -Milliseconds 250
  }
  if (-not (Test-Path -LiteralPath $db -PathType Leaf) -or -not (Test-Path -LiteralPath $settings -PathType Leaf)) {
    throw "timed out waiting for profile database/settings under $DataDir"
  }
}
function Row([Collections.Generic.List[object]]$Rows, [string]$Check, [string]$Result, [string]$Detail) {
  $Rows.Add([pscustomobject]@{ check = $Check; result = $Result; detail = $Detail })
  Write-Host "[$Result] $Check $Detail"
}

$runnerTemp = FullPath $env:RUNNER_TEMP
$root = Join-Path $runnerTemp "foo-lane-e-upgrade-$PID-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
$installDir = Join-Path $root 'install'
$dataDir = Join-Path $root 'data'
$localDir = Join-Path $root 'local'
$runtimeOut = Join-Path $root 'runtime-out'
$electronAppData = Join-Path $root 'electron-appdata'
$electronLocalAppData = Join-Path $root 'electron-localappdata'
$reportDir = [IO.Path]::GetFullPath($Out)
Assert-Descendant $root $runnerTemp 'fixture root'
Assert-Descendant $reportDir $runnerTemp 'report directory'
Assert-Descendant (FullPath $PreviousInstaller) $runnerTemp 'previous installer'
Assert-Descendant (FullPath $CurrentInstaller) $runnerTemp 'current installer'
New-Item -ItemType Directory -Force -Path $root, $installDir, $dataDir, $localDir, $runtimeOut, $electronAppData, $electronLocalAppData, $reportDir | Out-Null

$rows = [Collections.Generic.List[object]]::new()
$oldApp = $null
$newApp = $null
$seedOut = Join-Path $root 'seed'
$verifyOut = Join-Path $root 'verify'
New-Item -ItemType Directory -Force -Path $seedOut, $verifyOut | Out-Null

try {
  $oldInstall = Start-Process -FilePath (FullPath $PreviousInstaller) -ArgumentList @('/S', "/D=`"$installDir`"") -Wait -PassThru
  $exe = Join-Path $installDir 'foo.exe'
  $oldInstallResult = if ($oldInstall.ExitCode -eq 0) { 'pass' } else { 'fail' }
  $oldExeResult = if (Test-Path -LiteralPath $exe -PathType Leaf) { 'pass' } else { 'fail' }
  Row $rows 'previous release installer exits successfully' $oldInstallResult "exit=$($oldInstall.ExitCode)"
  Row $rows 'previous release fixture contains foo.exe' $oldExeResult $exe
  if ($oldInstall.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'previous release fixture install failed' }

  $oldApp = Start-Release $exe $installDir $dataDir $localDir $runtimeOut
  Wait-Profile $oldApp $dataDir
  Stop-Exact $oldApp
  $oldApp = $null
  Row $rows 'previous release first launch uses isolated data roots' 'pass' "data=$dataDir local=$localDir"

  $seedCommand = (Get-Command corepack.cmd -ErrorAction SilentlyContinue)
  if (-not $seedCommand) { Fail 'corepack.cmd is required to run the fixture database seed with the repository tsx runtime.' }
  & $seedCommand.Source pnpm exec tsx (Join-Path $PSScriptRoot 'lane-e-upgrade-seed.ts') --data $dataDir --out $seedOut
  if ($LASTEXITCODE -ne 0) { throw "upgrade fixture seed failed with exit $LASTEXITCODE" }
  Row $rows 'fixture creates two chats, memory, routine and working job' 'pass' (Join-Path $seedOut 'lane-e-upgrade-seed.json')

  $currentInstall = Start-Process -FilePath (FullPath $CurrentInstaller) -ArgumentList @('/S', "/D=`"$installDir`"") -Wait -PassThru
  $currentInstallResult = if ($currentInstall.ExitCode -eq 0) { 'pass' } else { 'fail' }
  Row $rows 'current release installs over the previous fixture' $currentInstallResult "exit=$($currentInstall.ExitCode)"
  if ($currentInstall.ExitCode -ne 0) { throw 'current release installer failed over fixture' }
  $newApp = Start-Release $exe $installDir $dataDir $localDir $runtimeOut
  Wait-Profile $newApp $dataDir
  Start-Sleep -Seconds 3
  Stop-Exact $newApp
  $newApp = $null

  & $seedCommand.Source pnpm exec tsx (Join-Path $PSScriptRoot 'lane-e-upgrade-verify.ts') --data $dataDir --seed $seedOut --out $verifyOut
  if ($LASTEXITCODE -ne 0) { throw "upgrade fixture verification failed with exit $LASTEXITCODE" }
  $verification = Join-Path $verifyOut 'lane-e-upgrade-verify.json'
  Row $rows 'chats, memory, routine and running job survive current release startup' 'pass' $verification

  $uninstaller = Join-Path $installDir 'Uninstall foo.exe'
  if (-not (Test-Path -LiteralPath $uninstaller -PathType Leaf)) { Row $rows 'current release fixture uninstaller is present' 'fail' $uninstaller }
  else {
    $un = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
    Start-Sleep -Milliseconds 500
    $unResult = if ($un.ExitCode -eq 0) { 'pass' } else { 'fail' }
    $exeRemovedResult = if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { 'pass' } else { 'fail' }
    $dataResult = if (Test-Path -LiteralPath (Join-Path $dataDir 'data\foo.db')) { 'pass' } else { 'blocked' }
    Row $rows 'current release fixture uninstall exits successfully' $unResult "exit=$($un.ExitCode)"
    Row $rows 'current release fixture uninstall removes foo.exe' $exeRemovedResult $exe
    Row $rows 'upgrade data remains under isolated profile after uninstall' $dataResult $dataDir
  }
}
catch {
  Row $rows 'upgrade harness execution' 'fail' $_.Exception.Message
}
finally {
  Stop-Exact $oldApp
  Stop-Exact $newApp
  $rows | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $reportDir 'lane-e-upgrade.json') -Encoding utf8
  $md = @('| Check | Result | Detail |', '|---|---|---|') + ($rows | ForEach-Object { "| $($_.check) | $($_.result) | $($_.detail -replace '\|', '/') |" })
  $md | Set-Content -LiteralPath (Join-Path $reportDir 'lane-e-upgrade.md') -Encoding utf8
  if (-not $KeepArtifacts -and (Test-Path -LiteralPath $root)) {
    Assert-Descendant $root $runnerTemp 'cleanup root'
    Remove-Item -LiteralPath $root -Recurse -Force
  }
}

if (@($rows | Where-Object result -eq 'fail').Count -gt 0) { exit 1 }
if (@($rows | Where-Object result -eq 'blocked').Count -gt 0) { exit 2 }
exit 0
