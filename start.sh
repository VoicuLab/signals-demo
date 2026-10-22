#!/usr/bin/env bash
set -euo pipefail
task_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 -m http.server 8770 --bind 127.0.0.1 --directory "$task_directory/dist"
