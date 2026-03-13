#!/usr/bin/env bash
# Downloads full 1-day GNSS data for e2e tests.
# Sources:
#   - https://igs.bkg.bund.de — IGS/BKG GNSS Data Center (obs + nav, 2024/001)
#   - ftp://gssc.esa.int — ESA GSSC (nav multi-version, 2026/001)
#
# Uses fixed dates for reproducibility.

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

# ── Navigation files in RINEX 2, 3, and 4 (2026/001) ────────
# Same day, same GPS satellites — used for cross-version validation.
# RINEX 2 from ESA (BKG doesn't carry legacy v2 files).
# RINEX 3 & 4 from BKG.
BKG26="$BASE/BRDC/2026/001"
ESA="ftp://gssc.esa.int/gnss/data/daily/2026/brdc"

echo "[4/8] BRDC navigation (RINEX 2 GPS, 2026/001)"
download "$ESA/brdc0010.26n.gz" "$DATA_DIR/brdc_v2.nav.gz"
if [[ -f "$DATA_DIR/brdc_v2.nav.gz" && ! -f "$DATA_DIR/brdc_v2.nav" ]]; then
  gunzip -k "$DATA_DIR/brdc_v2.nav.gz"
fi
echo ""

echo "[5/8] BRDC navigation (RINEX 2 GLONASS, 2026/001)"
download "$ESA/brdc0010.26g.gz" "$DATA_DIR/brdc_v2_glo.nav.gz"
if [[ -f "$DATA_DIR/brdc_v2_glo.nav.gz" && ! -f "$DATA_DIR/brdc_v2_glo.nav" ]]; then
  gunzip -k "$DATA_DIR/brdc_v2_glo.nav.gz"
fi
echo ""

echo "[6/8] BRDC navigation (RINEX 3 IGS mixed, 2026/001)"
download "$BKG26/BRDC00IGS_R_20260010000_01D_MN.rnx.gz" "$DATA_DIR/brdc_v3_igs.nav.gz"
if [[ -f "$DATA_DIR/brdc_v3_igs.nav.gz" && ! -f "$DATA_DIR/brdc_v3_igs.nav" ]]; then
  gunzip -k "$DATA_DIR/brdc_v3_igs.nav.gz"
fi
echo ""

echo "[7/8] BRDC navigation (RINEX 3 DLR mixed, 2026/001)"
if ! download "$BKG26/BRDM00DLR_S_20260010000_01D_MN.rnx.gz" "$DATA_DIR/brdc_v3_dlr.nav.gz"; then
  echo "  ⚠ DLR v3 nav not available, skipping (tests will be skipped)"
fi
if [[ -f "$DATA_DIR/brdc_v3_dlr.nav.gz" && ! -f "$DATA_DIR/brdc_v3_dlr.nav" ]]; then
  gunzip -k "$DATA_DIR/brdc_v3_dlr.nav.gz"
fi
echo ""

echo "[8/8] BRD4 navigation (RINEX 4 DLR mixed, 2026/001)"
if ! download "$BKG26/BRD400DLR_S_20260010000_01D_MN.rnx.gz" "$DATA_DIR/brdc_v4_dlr.nav.gz"; then
  echo "  ⚠ DLR v4 nav not available, skipping (tests will be skipped)"
fi
if [[ -f "$DATA_DIR/brdc_v4_dlr.nav.gz" && ! -f "$DATA_DIR/brdc_v4_dlr.nav" ]]; then
  gunzip -k "$DATA_DIR/brdc_v4_dlr.nav.gz"
fi
echo ""

echo "Done. Files in $DATA_DIR:"
ls -lh "$DATA_DIR"/*.crx "$DATA_DIR"/*.nav 2>/dev/null || true
