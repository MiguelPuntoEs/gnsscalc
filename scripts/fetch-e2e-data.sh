#!/usr/bin/env bash
# Downloads full 1-day GNSS data from BKG (no auth required) for e2e tests.
# Source: https://igs.bkg.bund.de — IGS/BKG GNSS Data Center
#
# Uses a fixed date (2024 DOY 001 = Jan 1 2024) for reproducibility.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../test-fixtures"
BASE="https://igs.bkg.bund.de/root_ftp/IGS"

mkdir -p "$DATA_DIR"

download() {
  local url="$1" out="$2"
  if [[ -f "$out" ]]; then
    echo "  ✓ $(basename "$out") already exists, skipping"
    return
  fi
  echo "  ↓ $(basename "$out")"
  curl -fSL --retry 3 --retry-delay 5 "$url" -o "$out.tmp"
  mv "$out.tmp" "$out"
}

echo "Fetching e2e test data from BKG…"
echo ""

# ── ABMF (Guadeloupe) — RINEX 3 CRX, full day, 30s ──────────
echo "[1/3] ABMF observation (CRX 3, 2024/001)"
download "$BASE/obs/2024/001/ABMF00GLP_R_20240010000_01D_30S_MO.crx.gz" "$DATA_DIR/ABMF.crx.gz"
if [[ -f "$DATA_DIR/ABMF.crx.gz" && ! -f "$DATA_DIR/ABMF.crx" ]]; then
  gunzip -k "$DATA_DIR/ABMF.crx.gz"
fi
echo ""

# ── ALBH (Victoria, Canada) — RINEX 3 CRX, full day, 30s ────
echo "[2/3] ALBH observation (CRX 3, 2024/001)"
download "$BASE/obs/2024/001/ALBH00CAN_R_20240010000_01D_30S_MO.crx.gz" "$DATA_DIR/ALBH.crx.gz"
if [[ -f "$DATA_DIR/ALBH.crx.gz" && ! -f "$DATA_DIR/ALBH.crx" ]]; then
  gunzip -k "$DATA_DIR/ALBH.crx.gz"
fi
echo ""

# ── BRDC — mixed navigation, full day ────────────────────────
echo "[3/3] BRDC navigation (RINEX 3, 2024/001)"
download "$BASE/BRDC/2024/001/BRDC00IGS_R_20240010000_01D_MN.rnx.gz" "$DATA_DIR/BRDC.nav.gz"
if [[ -f "$DATA_DIR/BRDC.nav.gz" && ! -f "$DATA_DIR/BRDC.nav" ]]; then
  gunzip -k "$DATA_DIR/BRDC.nav.gz"
fi
echo ""

echo "Done. Files in $DATA_DIR:"
ls -lh "$DATA_DIR"/*.crx "$DATA_DIR"/*.nav 2>/dev/null || true
