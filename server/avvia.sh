#!/bin/sh
# =====================================================================
#  avvia.sh - avvia il server di amministrazione su Linux e macOS.
#  Non fa altro. Con un altra porta:  SB_PORTA=4174 ./server/avvia.sh
#  Con --guarda il sito si rigenera a ogni modifica.
# =====================================================================
exec node "$(dirname "$0")/server.js" "$@"
