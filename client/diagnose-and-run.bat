@echo off
setlocal
echo ============================================
echo VDX Connect - Diagnostic Launcher
echo ============================================
echo.

echo [1] Current directory:
cd
echo.

echo [2] Node version:
node -v
if errorlevel 1 (
    echo ERROR: node is not found on PATH. Install Node.js and reopen this window.
    goto :end
)
echo.

echo [3] npm version:
call npm -v
echo.

echo [4] Checking node_modules\electron exists...
if not exist "node_modules\electron\dist\electron.exe" (
    echo ERROR: electron.exe not found. Running npm install now...
    call npm install
) else (
    echo OK - found node_modules\electron\dist\electron.exe
)
echo.

echo [5] Checking PowerShell is reachable (used for the UAC relaunch)...
powershell.exe -NoProfile -Command "Write-Host 'PowerShell OK, version:' $PSVersionTable.PSVersion"
if errorlevel 1 (
    echo ERROR: powershell.exe failed to run. This is likely why elevation silently fails.
)
echo.

echo [6] Checking PowerShell execution policy (a restrictive policy can silently block Start-Process)...
powershell.exe -NoProfile -Command "Get-ExecutionPolicy -List"
echo.

echo [7] Checking whether this window is already elevated...
net session >nul 2>&1
if errorlevel 1 (
    echo NOT elevated - app will attempt to relaunch itself as Administrator.
) else (
    echo Already elevated.
)
echo.

echo ============================================
echo [8] Launching app directly (bypassing npm wrapper) with full console output.
echo     Watch for [elevate] lines below - they will tell us exactly what
echo     happens. This window will stay open after the app closes/crashes.
echo ============================================
echo.

set ELECTRON_ENABLE_LOGGING=1
"node_modules\electron\dist\electron.exe" . 
echo.
echo ============================================
echo Electron process exited with code %errorlevel%
echo Copy everything above (from "Diagnostic Launcher" down) and send it back.
echo ============================================

:end
pause
