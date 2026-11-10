@echo off
setlocal DisableDelayedExpansion
title CyberAI Master - Desktop Shortcut

rem Read paths from the environment rather than interpolating them into code.
rem This supports spaces, ampersands, apostrophes, exclamation marks and Unicode.
set "CYBERAI_LAB_DIR=%~dp0"

if not exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
  echo Windows PowerShell is unavailable. Open Cybersecurity_AI_Lab.html directly.
  pause
  exit /b 1
)

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; try { $labDir=[IO.Path]::GetFullPath($env:CYBERAI_LAB_DIR); $htmlPath=Join-Path $labDir 'Cybersecurity_AI_Lab.html'; $iconPath=Join-Path $labDir 'assets\cyberai-master.ico'; if (-not (Test-Path -LiteralPath $htmlPath -PathType Leaf)) { throw 'The lab HTML is missing. Extract the complete ZIP before creating the shortcut.' }; if (-not (Test-Path -LiteralPath $iconPath -PathType Leaf)) { throw 'The desktop icon is missing. Extract the complete ZIP, including its assets folder.' }; $desktop=[Environment]::GetFolderPath('Desktop'); if ([string]::IsNullOrWhiteSpace($desktop) -or -not (Test-Path -LiteralPath $desktop -PathType Container)) { throw 'Your Windows Desktop folder could not be located.' }; $shell=New-Object -ComObject WScript.Shell; $shortcutPath=$null; for ($number=1; $number -le 100; $number++) { $name=if ($number -eq 1) { 'CyberAI Master.lnk' } else { 'CyberAI Master ('+$number+').lnk' }; $candidate=Join-Path $desktop $name; if (-not (Test-Path -LiteralPath $candidate)) { $shortcutPath=$candidate; break }; $sameTarget=$false; try { $existing=$shell.CreateShortcut($candidate); if (-not [string]::IsNullOrWhiteSpace($existing.TargetPath)) { $sameTarget=[string]::Equals([IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($existing.TargetPath)),$htmlPath,[StringComparison]::OrdinalIgnoreCase) } } catch { $sameTarget=$false }; if ($sameTarget) { $shortcutPath=$candidate; break } }; if ($null -eq $shortcutPath) { throw 'No unused shortcut name was found. Rename an existing CyberAI Master shortcut and try again.' }; $shortcut=$shell.CreateShortcut($shortcutPath); $shortcut.TargetPath=$htmlPath; $shortcut.Arguments=''; $shortcut.WorkingDirectory=$labDir; $shortcut.IconLocation=$iconPath+',0'; $shortcut.Description='CyberAI Master - offline cybersecurity prompt and loop practice'; $shortcut.WindowStyle=1; $shortcut.Save(); if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { throw 'Windows did not save the shortcut.' }; Write-Host ('Desktop shortcut ready: '+$shortcutPath); Write-Host 'Double-click the CyberAI Master desktop icon to open the lab.'; Write-Host 'Keep this extracted folder in place. Recreate the shortcut after moving it.'; exit 0 } catch { Write-Host ('Could not create the shortcut: '+$_.Exception.Message); Write-Host 'You can still open Cybersecurity_AI_Lab.html directly.'; exit 1 }"

set "CYBERAI_SHORTCUT_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %CYBERAI_SHORTCUT_EXIT%
