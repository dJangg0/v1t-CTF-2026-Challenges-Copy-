#!/bin/sh
cd /chal || exit 1
echo "[acroform] Send exploit.js, end with EOF (Ctrl-D)."
TMP="$(mktemp /tmp/exploit.XXXXXX.js)"
trap 'rm -f "$TMP"' EXIT
head -c 65536 > "$TMP"
exec timeout 30 ./d8 "$TMP" 2>&1
