param(
  [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$releaseDir = Join-Path $root "release"
$appDir = Join-Path $releaseDir "win-unpacked"
$zipPath = Join-Path $releaseDir "CBMap-$Version-Windows-x64.zip"
$installerPath = Join-Path $releaseDir "CBMap Setup $Version Windows x64.exe"
$stagingDir = Join-Path $releaseDir "iexpress-staging"
$sedPath = Join-Path $releaseDir "cbmap-iexpress.sed"

if (-not (Test-Path (Join-Path $appDir "CBMap.exe"))) {
  throw "Missing packaged app: $appDir. Run electron-builder until release/win-unpacked is created."
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $appDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

if (Test-Path $stagingDir) {
  Remove-Item -LiteralPath $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
Copy-Item -LiteralPath $zipPath -Destination $stagingDir

$installCmd = @'
@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
exit /b %ERRORLEVEL%
'@
Set-Content -LiteralPath (Join-Path $stagingDir "install.cmd") -Value $installCmd -Encoding ASCII

$installPs1 = @"
`$ErrorActionPreference = "Stop"
`$sourceZip = Join-Path `$PSScriptRoot "CBMap-$Version-Windows-x64.zip"
`$installDir = Join-Path `$env:LOCALAPPDATA "Programs\CBMap"
`$startMenuDir = Join-Path `$env:APPDATA "Microsoft\Windows\Start Menu\Programs\CBMap"
`$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "CBMap.lnk"
`$startShortcut = Join-Path `$startMenuDir "CBMap.lnk"

if (Test-Path `$installDir) {
  Remove-Item -LiteralPath `$installDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path `$installDir | Out-Null
Expand-Archive -LiteralPath `$sourceZip -DestinationPath `$installDir -Force

New-Item -ItemType Directory -Force -Path `$startMenuDir | Out-Null
`$target = Join-Path `$installDir "CBMap.exe"
`$shell = New-Object -ComObject WScript.Shell
foreach (`$shortcutPath in @(`$desktopShortcut, `$startShortcut)) {
  `$shortcut = `$shell.CreateShortcut(`$shortcutPath)
  `$shortcut.TargetPath = `$target
  `$shortcut.WorkingDirectory = `$installDir
  `$shortcut.IconLocation = "`$target,0"
  `$shortcut.Save()
}

Start-Process -FilePath `$target
"@
Set-Content -LiteralPath (Join-Path $stagingDir "install.ps1") -Value $installPs1 -Encoding UTF8

$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=1
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=%InstallPrompt%
DisplayLicense=%DisplayLicense%
FinishMessage=%FinishMessage%
TargetName=%TargetName%
FriendlyName=%FriendlyName%
AppLaunched=%AppLaunched%
PostInstallCmd=%PostInstallCmd%
AdminQuietInstCmd=%AdminQuietInstCmd%
UserQuietInstCmd=%UserQuietInstCmd%
SourceFiles=SourceFiles

[Strings]
InstallPrompt=
DisplayLicense=
FinishMessage=CBMap installation completed.
TargetName=$installerPath
FriendlyName=CBMap
AppLaunched=install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=install.cmd
UserQuietInstCmd=install.cmd
FILE0=CBMap-$Version-Windows-x64.zip
FILE1=install.cmd
FILE2=install.ps1

[SourceFiles]
SourceFiles0=$stagingDir

[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
"@
Set-Content -LiteralPath $sedPath -Value $sed -Encoding ASCII

if (Test-Path $installerPath) {
  Remove-Item -LiteralPath $installerPath -Force
}

& "$env:WINDIR\System32\iexpress.exe" /N /Q $sedPath

for ($i = 0; $i -lt 30 -and -not (Test-Path $installerPath); $i++) {
  Start-Sleep -Seconds 1
}

if (-not (Test-Path $installerPath) -and (Test-Path (Join-Path $releaseDir "~CBMap Setup $Version Windows x64.DDF"))) {
  & "$env:WINDIR\System32\makecab.exe" /F (Join-Path $releaseDir "~CBMap Setup $Version Windows x64.DDF")
  for ($i = 0; $i -lt 30 -and -not (Test-Path $installerPath); $i++) {
    Start-Sleep -Seconds 1
  }
}

if (-not (Test-Path $installerPath)) {
  throw "IExpress did not create installer: $installerPath"
}

Get-Item $installerPath
