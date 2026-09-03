@echo off
REM Launch Minecraft with optimized JVM flags.
REM
REM Usage:
REM   launch_optimized.bat "C:\path\to\MinecraftLauncher.exe" [launcher-args...]
REM
REM JVM flags are auto-detected from system RAM (see generate_jvm_flags.py).
REM This wrapper only sets JAVA_TOOL_OPTIONS and then starts the given
REM launcher — it does not replace your existing launcher or profile setup.
REM Most users are better served by pasting the flags from
REM generate_jvm_flags.py directly into their launcher's JVM Arguments
REM field instead of using this wrapper.

setlocal enabledelayedexpansion

if "%~1"=="" (
    echo Usage: %~nx0 "C:\path\to\MinecraftLauncher.exe" [launcher-args...]
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
set "LAUNCHER=%~1"
shift

for /f "delims=" %%F in ('python "%SCRIPT_DIR%generate_jvm_flags.py" 2^>nul') do set "LAST_LINE=%%F"
set "FLAGS=%LAST_LINE%"

if "%FLAGS%"=="" (
    echo Failed to generate JVM flags
    exit /b 1
)

echo Using JVM flags: %FLAGS%
set "JAVA_TOOL_OPTIONS=%FLAGS%"

start "" "%LAUNCHER%" %*
