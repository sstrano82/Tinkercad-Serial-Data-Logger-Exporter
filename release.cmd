@echo off
setlocal

set "TYPE=%~1"
if "%TYPE%"=="" set "TYPE=patch"

node "%~dp0release.js" %TYPE%

