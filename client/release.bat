@echo off
if "%1"=="" ( cmd /k "%~f0" run & exit )
cd /d "E:\VDX Connect\VDX\client"

echo ================================
echo   VDX Connect Release Tool
echo ================================
echo.

set /p VERSION_CHANGED=Did you update "version" in client\package.json? (y/n): 
if /i "%VERSION_CHANGED%" neq "y" (
  echo Please update the version in package.json first.
  pause & exit /b
)

set /p COMMIT_MSG=Enter commit message: 
set /p TAG=Enter version tag (e.g. v1.0.1): 
set CSC_IDENTITY_AUTO_DISCOVERY=false

echo.
echo [1/4] Committing and pushing to GitHub...
git add .
git status --porcelain | findstr /r "." >nul 2>&1
if %errorlevel% equ 0 (
  git commit -m "%COMMIT_MSG%"
  if %errorlevel% neq 0 ( echo ERROR: git commit failed & pause & exit /b )
) else (
  echo Nothing to commit, skipping...
)
git push
if %errorlevel% neq 0 ( echo ERROR: git push failed & pause & exit /b )

echo.
echo [2/4] Tagging %TAG%...
git rev-parse %TAG% >nul 2>&1
if %errorlevel% equ 0 (
  echo Tag already exists, deleting and re-creating...
  git tag -d %TAG%
  git push origin :refs/tags/%TAG% 2>nul
)
git tag %TAG%
if %errorlevel% neq 0 ( echo ERROR: git tag failed & pause & exit /b )
git push origin %TAG%
if %errorlevel% neq 0 ( echo ERROR: git push tag failed & pause & exit /b )

echo.
echo [3/4] Building and publishing to GitHub Releases (UMBRELLACORP007/VDX-Releases)...
echo       This needs a GH_TOKEN with write access to that repo in THIS
echo       shell's environment (different from the read-only one baked
echo       into device-config.js for end-user machines).
if "%GH_TOKEN%"=="" (
  echo ERROR: GH_TOKEN is not set in this terminal. Run:
  echo   set GH_TOKEN=your_write_scoped_token_here
  echo then re-run this script.
  pause & exit /b
)
call npm run publish:win
if %errorlevel% neq 0 ( echo ERROR: build/publish failed & pause & exit /b )

echo.
echo [4/4] Done.
echo ================================
echo   SUCCESS! %TAG% is live on UMBRELLACORP007/VDX-Releases.
echo   electron-updater will pick it up on next launch of older clients.
echo ================================
pause
