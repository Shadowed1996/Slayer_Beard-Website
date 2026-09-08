@echo off
rem =====================================================================
rem  avvia.cmd - avvia il server di amministrazione su Windows.
rem  Non fa altro: nessuna installazione, nessun controllo esoterico.
rem  La tabella codici 65001 serve solo perche gli accenti dei messaggi
rem  si leggano anche nel prompt classico.
rem
rem  Con --guarda il sito si rigenera a ogni modifica:
rem      avvia.cmd --guarda
rem =====================================================================
chcp 65001 >nul
node "%~dp0server.js" %*
if errorlevel 1 pause
