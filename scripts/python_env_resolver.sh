#!/usr/bin/env bash
# Resolve a suitable Python interpreter and matching offline wheelhouse for this repo.
# Usage (source it):
#   source scripts/python_env_resolver.sh
# Exports:
#   PY_BIN     -> absolute path to chosen python interpreter
#   PY_MM      -> py<maj><min>, e.g., py311, py39
#   WHEELHOUSE -> $ROOT_DIR/vendor/python/$PY_MM/wheels

set -euo pipefail

# If already resolved in the environment, do nothing
if [ -n "${PY_BIN:-}" ] && [ -n "${PY_MM:-}" ] && [ -n "${WHEELHOUSE:-}" ]; then
  return 0 2>/dev/null || exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor/python"

# Discover available wheelhouses (portable; no dependency on python3)
available_wheel_mm=()
if [ -d "$VENDOR_DIR" ]; then
  while IFS= read -r -d '' d; do
    mm="$(basename "$(dirname "$d")")"
    if ls -A "$d" >/dev/null 2>&1; then
      available_wheel_mm+=("$mm")
    fi
  done < <(find "$VENDOR_DIR" -mindepth 2 -maxdepth 2 -type d -name wheels -print0 2>/dev/null || true)
fi

# Helper to get MAJMIN string for a python binary
py_mm_of() {
  local bin="$1"
  "$bin" - <<'PY'
import sys
print("py%u%u" % (sys.version_info[0], sys.version_info[1]))
PY
}

# Collect candidates in priority order
candidates=()
# Prefer explicit PYTHON if provided
if [ -n "${PYTHON:-}" ] && [ -x "$PYTHON" ]; then
  candidates+=("$PYTHON")
fi
# Typical unix paths
if command -v python3 >/dev/null 2>&1; then candidates+=("$(command -v python3)"); fi
if command -v python  >/dev/null 2>&1; then candidates+=("$(command -v python)");  fi
# Versioned binaries
for v in 3.13 3.12 3.11 3.10 3.9; do
  if command -v "python$v" >/dev/null 2>&1; then candidates+=("$(command -v "python$v")"); fi
  vv=${v/./}
  if command -v "python${vv}" >/dev/null 2>&1; then candidates+=("$(command -v "python${vv}")"); fi
done
# Windows 'py' launcher support -> resolve real interpreter path(s)
if command -v py >/dev/null 2>&1; then
  for v in 3.13 3.12 3; do
    p=$(py -$v -c 'import sys; print(sys.executable)' 2>/dev/null || true)
    if [ -n "$p" ] && [ -x "$p" ]; then candidates+=("$p"); fi
  done
fi
# De-duplicate candidates while preserving order
if [ "${#candidates[@]}" -gt 0 ]; then
  uniq_candidates=()
  for c in "${candidates[@]}"; do
    seen=0
    for u in "${uniq_candidates[@]:-}"; do
      [ "$u" = "$c" ] && seen=1 && break
    done
    [ $seen -eq 0 ] && uniq_candidates+=("$c")
  done
  candidates=("${uniq_candidates[@]}")
fi

choose_python_and_wheels() {
  local bin mm wh avail
  # First pass: exact match to available wheelhouses
  for bin in "${candidates[@]}"; do
    if ! mm="$(py_mm_of "$bin" 2>/dev/null)"; then continue; fi
    for avail in "${available_wheel_mm[@]:-}"; do
      if [ "$mm" = "$avail" ]; then
        wh="$VENDOR_DIR/$mm/wheels"
        if [ -d "$wh" ] && ls -A "$wh" >/dev/null 2>&1; then
          PY_BIN="$bin"; PY_MM="$mm"; WHEELHOUSE="$wh"; return 0
        fi
      fi
    done
  done
  # Optional second pass: if only py311 wheels exist, try to use a py311 interpreter if present
  if printf '%s
' "${available_wheel_mm[@]:-}" | grep -q '^py311$'; then
    for bin in "${candidates[@]}"; do
      if [ "$(py_mm_of "$bin" 2>/dev/null || true)" = "py311" ]; then
        wh="$VENDOR_DIR/py311/wheels"
        if [ -d "$wh" ] && ls -A "$wh" >/dev/null 2>&1; then
          PY_BIN="$bin"; PY_MM="py311"; WHEELHOUSE="$wh"; return 0
        fi
      fi
    done
  fi
  return 1
}

if choose_python_and_wheels; then
  export PY_BIN PY_MM WHEELHOUSE
  echo "[python_env_resolver] Using: $($PY_BIN -V 2>&1) ($PY_BIN) with wheels: $WHEELHOUSE" >&2
  return 0 2>/dev/null || exit 0
fi

# Could not resolve a matching python/wheelhouse
# Print a helpful message and fail
chosen="${candidates[0]:-}"
if [ -n "$chosen" ]; then
  ver="$($chosen -V 2>&1 || true)"
  echo "ERROR: Could not find a Python interpreter with a matching wheelhouse." >&2
  echo "Detected candidate: $ver ($chosen)." >&2
else
  echo "ERROR: No Python interpreter found in PATH." >&2
fi
if [ "${#available_wheel_mm[@]}" -gt 0 ]; then
  echo "Available wheelhouses: ${available_wheel_mm[*]} under $VENDOR_DIR" >&2
else
  echo "No wheelhouses were found under $VENDOR_DIR." >&2
fi
cat >&2 <<'MSG'
Resolution options:
- Install Python 3.11 locally (recommended for current wheelhouse), OR
- Provide matching wheels under vendor/python/py<maj><min>/wheels (e.g., py313 for Python 3.13).
If you have pyenv:
  pyenv install 3.11.9
  pyenv local 3.11.9
Then re-run the deploy script.
MSG
exit 1
