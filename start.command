#!/bin/bash
# Career Matrix — start it and open it.
#
# Double-click this file (macOS: if it refuses, right-click → Open, once). It installs the
# dependencies on the first run, starts the local server, and opens the app in your browser.
#
# Nothing you type into the app leaves this computer: your profile, applications, portfolio
# and images live in this browser's own storage. See the README.

cd "$(dirname "$0")" || exit 1

PORT=3000
URL="http://localhost:$PORT"

# `open` is macOS, `xdg-open` is most Linux desktops: one of them, or just print the address.
open_url() {
  if command -v open >/dev/null 2>&1; then
    open "$1" 2>/dev/null || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1 || true
  else
    echo "Open $1 in your browser."
  fi
}

if ! command -v npm >/dev/null 2>&1; then
  echo
  echo "npm was not found, so there is nothing to start the app with."
  echo "Install Node.js 20 or newer from https://nodejs.org, then double-click this again."
  echo
  read -r -p "Press return to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo
  echo "First run: installing the dependencies. A few minutes, and it needs internet."
  echo
  npm install || {
    echo
    echo "The install failed — check the messages above, then try again."
    read -r -p "Press return to close."
    exit 1
  }
fi

# Something already serving that port is almost always this app, left running.
if command -v lsof >/dev/null 2>&1 && lsof -i ":$PORT" >/dev/null 2>&1; then
  echo "Career Matrix is already running — opening it."
  open_url "$URL"
  exit 0
fi

echo
echo "Starting Career Matrix. The app will open in your browser in a few seconds."
echo "Leave this window open while you use it, and close it to stop the server."
echo

# Open the browser once the server answers, without blocking the server itself.
(
  for _ in $(seq 1 90); do
    if curl -sf -o /dev/null "$URL"; then
      open_url "$URL"
      exit 0
    fi
    sleep 1
  done
) &

npm run dev
