#!/bin/sh
set -e

if [ "${1#-}" != "${1}" ] || [ -z "$(command -v "$1")" ] || { [ -f "$1" ] && ! [ -x "$1" ]; }; then
  set -- node "$@"
fi

"$@" &
wiki_pid="$!"

node /wiki/init.js &
init_pid="$!"

term_handler() {
  kill "$init_pid" 2>/dev/null || true
  kill "$wiki_pid" 2>/dev/null || true
}

trap term_handler TERM INT

wait "$init_pid" || {
  status="$?"
  kill "$wiki_pid" 2>/dev/null || true
  wait "$wiki_pid" 2>/dev/null || true
  exit "$status"
}

wait "$wiki_pid"
