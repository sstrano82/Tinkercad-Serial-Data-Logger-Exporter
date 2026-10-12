@echo off
setlocal

set "ROOT=%~dp0"
set "DIST=%ROOT%dist"

if exist "%DIST%" rmdir /s /q "%DIST%"
if errorlevel 1 exit /b 1

mkdir "%DIST%\src\content" "%DIST%\src\popup" "%DIST%\icons"
if errorlevel 1 exit /b 1

copy /Y "%ROOT%manifest.json" "%DIST%\" >nul || exit /b 1
copy /Y "%ROOT%LICENSE" "%DIST%\" >nul || exit /b 1
copy /Y "%ROOT%PRIVACY.md" "%DIST%\" >nul || exit /b 1
copy /Y "%ROOT%README.md" "%DIST%\" >nul || exit /b 1
copy /Y "%ROOT%src\content\content.js" "%DIST%\src\content\" >nul || exit /b 1
copy /Y "%ROOT%src\content\content.css" "%DIST%\src\content\" >nul || exit /b 1
copy /Y "%ROOT%src\popup\popup.html" "%DIST%\src\popup\" >nul || exit /b 1
copy /Y "%ROOT%src\popup\popup.js" "%DIST%\src\popup\" >nul || exit /b 1
copy /Y "%ROOT%src\popup\popup.css" "%DIST%\src\popup\" >nul || exit /b 1
copy /Y "%ROOT%icons\icon16.png" "%DIST%\icons\" >nul || exit /b 1
copy /Y "%ROOT%icons\icon48.png" "%DIST%\icons\" >nul || exit /b 1
copy /Y "%ROOT%icons\icon128.png" "%DIST%\icons\" >nul || exit /b 1
copy /Y "%ROOT%icons\icon300.png" "%DIST%\icons\" >nul || exit /b 1

echo Build completata in: "%DIST%"
