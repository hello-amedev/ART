@echo off
REM 配布 zip 生成のワンクリックラッパー。
REM ダブルクリックするか、コマンドプロンプトでこのファイルを実行する。
REM 内部で build-dist.ps1 を PowerShell で呼び、結果を pause で表示。

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-dist.ps1"
pause
