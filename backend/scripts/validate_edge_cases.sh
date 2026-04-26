#!/usr/bin/env bash
# Edge-case validation for the Inventory Management backend.
# Requires: server running on $BASE (default http://localhost:8000) + jq installed.
# Exits 0 if all assertions pass, non-zero on first failure.

set -u
BASE="${BASE:-http://localhost:8000}"
PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
blue()  { printf "\033[36m%s\033[0m\n" "$*"; }

assert_eq() {
  local actual="$1" expected="$2" label="$3"
  if [[ "$actual" == "$expected" ]]; then
    green "  PASS  $label  (got: $actual)"
    PASS=$((PASS + 1))
  else
    red   "  FAIL  $label  expected=$expected got=$actual"
    FAIL=$((FAIL + 1))
  fi
}

register_and_login() {
  local username="$1"
  curl -s -X POST "$BASE/api/auth/register/" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"email\":\"$username@test.com\",\"password\":\"testpass123\"}" \
    > /dev/null
  curl -s -X POST "$BASE/api/auth/login/" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$username\",\"password\":\"testpass123\"}" | jq -r .access
}

http_code() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

stamp=$(date +%s)
USER1="qa1_$stamp"
USER2="qa2_$stamp"

blue "Setting up two isolated users ($USER1, $USER2)..."
T1=$(register_and_login "$USER1")
T2=$(register_and_login "$USER2")
A1="Authorization: Bearer $T1"
A2="Authorization: Bearer $T2"
[[ -n "$T1" && "$T1" != "null" ]] || { red "could not get token for $USER1"; exit 2; }
[[ -n "$T2" && "$T2" != "null" ]] || { red "could not get token for $USER2"; exit 2; }

# ---------------------------------------------------------------------------
blue "\n[1] FIFO with two purchase lots"
# ---------------------------------------------------------------------------
PID=$(curl -s -X POST "$BASE/api/products/" -H "$A1" -H "Content-Type: application/json" \
  -d '{"name":"Sugar","sku":"SUG-1","unit_type":"kg"}' | jq -r .id)

# PO #1: 50 @ $1
PO1=$(curl -s -X POST "$BASE/api/purchase-orders/" -H "$A1" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$PID,\"quantity\":\"50\",\"unit_price\":\"1.00\"}]}" | jq -r .id)
curl -s -X POST "$BASE/api/purchase-orders/$PO1/confirm/" -H "$A1" > /dev/null
sleep 1  # ensure created_at ordering is strict

# PO #2: 50 @ $2
PO2=$(curl -s -X POST "$BASE/api/purchase-orders/" -H "$A1" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$PID,\"quantity\":\"50\",\"unit_price\":\"2.00\"}]}" | jq -r .id)
curl -s -X POST "$BASE/api/purchase-orders/$PO2/confirm/" -H "$A1" > /dev/null

# Sell 60 — should consume all of lot1 + 10 of lot2
SO1=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$A1" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$PID,\"quantity\":\"60\",\"unit_price\":\"5.00\"}]}" | jq -r .id)
curl -s -X POST "$BASE/api/sales-orders/$SO1/confirm/" -H "$A1" > /dev/null

# Stocks come back ordered by -created_at, so newest is first.
STOCKS=$(curl -s "$BASE/api/stocks/?product=$PID" -H "$A1")
NEW_LOT_AVAIL=$(echo "$STOCKS" | jq -r '.results[0].available_quantity')
OLD_LOT_AVAIL=$(echo "$STOCKS" | jq -r '.results[1].available_quantity')
NEW_LOT_COST=$(echo "$STOCKS" | jq -r '.results[0].unit_cost')
OLD_LOT_COST=$(echo "$STOCKS" | jq -r '.results[1].unit_cost')

assert_eq "$OLD_LOT_COST"  "1.00"      "older lot is the \$1 lot"
assert_eq "$OLD_LOT_AVAIL" "0.0000"    "older lot fully consumed (FIFO)"
assert_eq "$NEW_LOT_COST"  "2.00"      "newer lot is the \$2 lot"
assert_eq "$NEW_LOT_AVAIL" "40.0000"   "newer lot has 40 left after FIFO deduction"

# ---------------------------------------------------------------------------
blue "\n[2] Cross-user data isolation"
# ---------------------------------------------------------------------------
LIST_U2=$(curl -s "$BASE/api/products/" -H "$A2" | jq -r '.count')
assert_eq "$LIST_U2" "0" "user2 sees zero products from user1"

CODE=$(http_code "$BASE/api/products/$PID/" -H "$A2")
assert_eq "$CODE" "404" "user2 GET on user1's product → 404"

CODE=$(http_code -X POST "$BASE/api/purchase-orders/$PO1/confirm/" -H "$A2")
assert_eq "$CODE" "404" "user2 cannot confirm user1's PO"

# ---------------------------------------------------------------------------
blue "\n[3] Cancel/confirm state transitions"
# ---------------------------------------------------------------------------
# Cancel a draft SO works
SO_DRAFT=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$A1" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$PID,\"quantity\":\"1\",\"unit_price\":\"5.00\"}]}" | jq -r .id)
RESP=$(curl -s -X POST "$BASE/api/sales-orders/$SO_DRAFT/cancel/" -H "$A1" | jq -r .status)
assert_eq "$RESP" "cancelled" "cancel a DRAFT sales order → cancelled"

# Re-cancelling already cancelled → 400
CODE=$(http_code -X POST "$BASE/api/sales-orders/$SO_DRAFT/cancel/" -H "$A1")
assert_eq "$CODE" "400" "cancel an already-cancelled SO → 400"

# Confirm an already-confirmed PO → 400
CODE=$(http_code -X POST "$BASE/api/purchase-orders/$PO1/confirm/" -H "$A1")
assert_eq "$CODE" "400" "confirm an already-confirmed PO → 400"

# Cancel an already-confirmed PO → 400
CODE=$(http_code -X POST "$BASE/api/purchase-orders/$PO1/cancel/" -H "$A1")
assert_eq "$CODE" "400" "cancel an already-confirmed PO → 400"

# ---------------------------------------------------------------------------
blue "\n[4] Dashboard ignores cancelled/draft orders"
# ---------------------------------------------------------------------------
# Snapshot dashboard
BEFORE=$(curl -s "$BASE/api/finance/dashboard/" -H "$A1")
REV_BEFORE=$(echo "$BEFORE" | jq -r .total_revenue)
COST_BEFORE=$(echo "$BEFORE" | jq -r .total_cost)

# Create+cancel a PO (200@$5) — must NOT affect totals
PO_CANCEL=$(curl -s -X POST "$BASE/api/purchase-orders/" -H "$A1" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$PID,\"quantity\":\"200\",\"unit_price\":\"5.00\"}]}" | jq -r .id)
curl -s -X POST "$BASE/api/purchase-orders/$PO_CANCEL/cancel/" -H "$A1" > /dev/null

# Create a draft SO (no confirm) — must NOT affect totals
curl -s -X POST "$BASE/api/sales-orders/" -H "$A1" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$PID,\"quantity\":\"1\",\"unit_price\":\"999.00\"}]}" > /dev/null

AFTER=$(curl -s "$BASE/api/finance/dashboard/" -H "$A1")
REV_AFTER=$(echo "$AFTER" | jq -r .total_revenue)
COST_AFTER=$(echo "$AFTER" | jq -r .total_cost)

assert_eq "$REV_AFTER"  "$REV_BEFORE"  "total_revenue unchanged after cancelled PO + draft SO"
assert_eq "$COST_AFTER" "$COST_BEFORE" "total_cost unchanged after cancelled PO + draft SO"

# ---------------------------------------------------------------------------
blue "\n[5] Duplicate SKU per user"
# ---------------------------------------------------------------------------
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/products/" \
  -H "$A1" -H "Content-Type: application/json" \
  -d '{"name":"Sugar 2","sku":"SUG-1","unit_type":"kg"}')
assert_eq "$CODE" "400" "duplicate SKU for same user → 400"

# Same SKU under user2 should be allowed (data isolation)
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/products/" \
  -H "$A2" -H "Content-Type: application/json" \
  -d '{"name":"Sugar U2","sku":"SUG-1","unit_type":"kg"}')
assert_eq "$CODE" "201" "same SKU under different user → 201"

# ---------------------------------------------------------------------------
blue "\n[6] Sanity: dashboard math after FIFO sale"
# ---------------------------------------------------------------------------
# Sold 60 @ $5 = 300 revenue. Bought 50@$1 + 50@$2 = 150 cost. Profit = 150. Margin = 100%.
DASH=$(curl -s "$BASE/api/finance/dashboard/" -H "$A1")
assert_eq "$(echo "$DASH" | jq -r .total_revenue)" "300.00" "total_revenue = 300"
assert_eq "$(echo "$DASH" | jq -r .total_cost)"    "150.00" "total_cost = 150"
assert_eq "$(echo "$DASH" | jq -r .total_profit)"  "150.00" "total_profit = 150"
assert_eq "$(echo "$DASH" | jq -r .profit_margin)" "100.00"     "profit_margin = 100.00"

# ---------------------------------------------------------------------------
echo
if [[ $FAIL -eq 0 ]]; then
  green "All $PASS assertions passed."
  exit 0
else
  red "$FAIL failed / $PASS passed."
  exit 1
fi
