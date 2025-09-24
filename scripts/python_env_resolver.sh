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

# Discover available wheelhouses (portable on macOS bash 3.2)
available_wheel_mm=()
if [ -d "$VENDOR_DIR" ]; then
  # Use Python to safely enumerate wheelhouses even with spaces in paths
  while IFS= read -r mm; do
    [ -n "$mm" ] && available_wheel_mm+=("$mm")
  done < <("${PYTHON:-python3}" - "$VENDOR_DIR" <<'PY'
import os, sys
root = sys.argv[1]
seen = set()
for dirpath, dirnames, filenames in os.walk(root):
    base = os.path.basename(dirpath)
    if base == 'wheels':
        mm = os.path.basename(os.path.dirname(dirpath))
        # ensure non-empty wheelhouse
        try:
            if any(os.scandir(dirpath)):
                seen.add(mm)
        except FileNotFoundError:
            pass
for mm in sorted(seen):
    print(mm)
PY
  )
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
# 1) Respect explicit override
if [ -n "${PYTHON:-}" ] && command -v "$PYTHON" >/dev/null 2>&1; then
  candidates+=("$(command -v "$PYTHON")")
fi
# 2) Windows py launcher (prefer exact 3.11 if present)
if command -v py >/dev/null 2>&1; then
  py311=$(py -3.11 -c 'import sys;print(sys.executable)' 2>/dev/null || true)
  if [ -n "$py311" ] && [ -x "$py311" ]; then candidates+=("$py311"); fi
  pyx=$(py -c 'import sys;print(sys.executable)' 2>/dev/null || true)
  if [ -n "$pyx" ] && [ -x "$pyx" ]; then candidates+=("$pyx"); fi
fi
# 3) Common unix-ish names
if command -v python3 >/dev/null 2>&1; then candidates+=("$(command -v python3)"); fi
if command -v python >/dev/null 2>&1;  then candidates+=("$(command -v python)");  fi
# 4) Versioned binaries
for v in 3.13 3.12 3.11 3.10 3.9; do
  if command -v "python$v" >/dev/null 2>&1; then candidates+=("$(command -v "python$v")"); fi
  vv=${v/./}
  if command -v "python${vv}" >/dev/null 2>&1; then candidates+=("$(command -v "python${vv}")"); fi
done

# De-duplicate candidates while preserving order (portable)
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
  echo "[python_env_resolver] Host platform: $("$PY_BIN" -c 'import platform;print(platform.system(), platform.machine())')" >&2
  # Print a brief wheel tag summary to help spot platform mismatches
  if [ -d "$WHEELHOUSE" ]; then
    sample=$(ls -1 "$WHEELHOUSE" | head -5 | paste -sd ', ' -)
    echo "[python_env_resolver] Sample wheels: ${sample}" >&2
  fi
  return 0 2>/dev/null || exit 0
fi

# Could not resolve a matching python/wheelhouse
# Print a helpful message and fail
chosen="${candidates[0]:-}"
if [ -n "$chosen" ]; then
  ver="$($chosen -V 2>&1 || true)"
  echo "ERROR: Could not find a Python interpreter with a matching wheelhouse (py<maj><min>)." >&2
  echo "Detected candidate: $ver ($chosen)." >&2
else
  echo "ERROR: No Python interpreter found in PATH." >&2
fi
if [ "${#available_wheel_mm[@]}" -gt 0 ]; then
  echo "Available wheelhouses: ${available_wheel_mm[*]} under $VENDOR_DIR" >&2
else
  echo "No wheelhouses were found under $VENDOR_DIR." >&2
fi
# Platform hint
if [ -d "$VENDOR_DIR/py311/wheels" ]; then
  if ls -1 "$VENDOR_DIR/py311/wheels" | grep -qi 'macosx'; then
    echo "Hint: Your wheelhouse appears macOS-specific (macosx tags). For Linux CloudPC, bake manylinux wheels." >&2
  fi
fi
cat >&2 <<'MSG'
Resolution options:
- Install a Python matching the available wheelhouse (e.g., 3.11 for py311), and
- Ensure the wheelhouse contains wheels for your OS/arch (e.g., manylinux_x86_64 for Linux, macosx_* for macOS).
To bake Linux (x86_64) wheels from Mac using Docker (internet required on Mac):
  docker run --rm -v "$PWD":/work -w /work quay.io/pypa/manylinux2014_x86_64 \
    /opt/python/cp311-cp311/bin/python scripts/bake_wheels.py
Commit vendor/python/py311/wheels and pull on CloudPC, then re-run.
MSG
exit 1
