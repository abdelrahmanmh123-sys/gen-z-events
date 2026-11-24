@echo off
title Push Gen Z Events to GitHub
echo ==============================================
echo Pushing Gen Z Events to GitHub Repository...
echo ==============================================
echo.

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git command line tool was not found in system PATH.
    echo.
    echo To push using GitHub Desktop or GitHub Web:
    echo 1. You can drag this folder directly into GitHub Desktop.
    echo 2. Or upload the updated files / gen-z-events-production.zip on github.com.
    echo.
    pause
    exit /b 1
)

if not exist ".git" (
    echo Initializing Git repository...
    git init
    git branch -M main
)

echo Staging all updated production files...
git add .

echo Committing updates...
git commit -m "feat: complete international release - multi-scan QR, tier management, and error fixes"

echo Pushing to GitHub...
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo ==============================================
    echo [SUCCESS] Pushed to GitHub successfully!
    echo Vercel will now deploy your changes automatically.
    echo ==============================================
) else (
    echo.
    echo [NOTICE] Push needs remote repository URL or authentication.
    echo If this is the first push, run:
    echo   git remote add origin ^<YOUR_GITHUB_REPO_URL^>
    echo   git push -u origin main
)

echo.
pause
