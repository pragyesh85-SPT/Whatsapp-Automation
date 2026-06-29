@echo off
REM Auto-start the Coaching OS. Run by the "CoachingOS" scheduled task at logon,
REM and usable manually (double-click) too.
set "PATH=%PATH%;%APPDATA%\npm"
cd /d "C:\Users\Pragyesh Jain\Downloads\Kapil Sir work flow"

REM Bring back whatever pm2 had saved (the coaching-os process).
call pm2 resurrect

REM If it isn't running for any reason, start it fresh from the ecosystem file.
call pm2 describe coaching-os >nul 2>&1
if errorlevel 1 call pm2 start ecosystem.config.js

REM Persist the list so the next boot resurrects it too.
call pm2 save
exit /b 0
