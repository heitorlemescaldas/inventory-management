#!/usr/bin/env bash
# Mirrors the frontend QA checklist (sections 3–8) against the backend API.
# Uses the exact same product names, SKUs, quantities and prices the frontend
# exercises so you can cross-check numbers between UI and API.
#
# Prereqs: backend on $BASE (default http://localhost:8000) + jq.
# Exit code 0 only if every assertion passes.

set -u
BASE="${BASE:-http://localhost:8000}"
PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
blue()  { printf "\n\033[36m%s\033[0m\n" "$*"; }

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

http_code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

stamp=$(date +%s)
USERNAME="qa_journey_$stamp"

blue "Setup: register + login as $USERNAME"
curl -s -X POST "$BASE/api/auth/register/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"email\":\"$USERNAME@test.com\",\"password\":\"testpass123\"}" \
  > /dev/null
TOKEN=$(curl -s -X POST "$BASE/api/auth/login/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"testpass123\"}" | jq -r .access)
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || { red "could not login"; exit 2; }
AUTH="Authorization: Bearer $TOKEN"

# ---------------------------------------------------------------------------
blue "[3] Products CRUD"
# ---------------------------------------------------------------------------

# 3.1 — empty state
COUNT=$(curl -s "$BASE/api/products/" -H "$AUTH" | jq -r .count)
assert_eq "$COUNT" "0" "3.1 fresh user has zero products"

# 3.2 — Apple
APPLE=$(curl -s -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Apple","sku":"APL-001","unit_type":"kg","description":"Red apple"}')
APPLE_ID=$(echo "$APPLE" | jq -r .id)
assert_eq "$(echo "$APPLE" | jq -r .name)"      "Apple"   "3.2 Apple created"
assert_eq "$(echo "$APPLE" | jq -r .unit_type)" "kg"      "3.2 Apple unit_type=kg"

# 3.3 — Bread
BREAD=$(curl -s -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Bread","sku":"BRD-001","unit_type":"unit","description":"Loaf"}')
BREAD_ID=$(echo "$BREAD" | jq -r .id)
assert_eq "$(echo "$BREAD" | jq -r .name)"      "Bread"   "3.3 Bread created"
assert_eq "$(echo "$BREAD" | jq -r .unit_type)" "unit"    "3.3 Bread unit_type=unit"

# 3.4 — empty body returns 400 with field errors
RESP=$(curl -s -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
HAS_NAME_ERR=$(echo "$RESP" | jq -r 'has("name")')
HAS_SKU_ERR=$(echo  "$RESP" | jq -r 'has("sku")')
assert_eq "$HAS_NAME_ERR" "true" "3.4 missing name → 'name' error"
assert_eq "$HAS_SKU_ERR"  "true" "3.4 missing sku → 'sku' error"

# 3.5 — duplicate SKU
CODE=$(http_code -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Apple Dup","sku":"APL-001","unit_type":"kg"}')
assert_eq "$CODE" "400" "3.5 duplicate SKU → 400"

# 3.6 — search "Appl" returns only Apple
SEARCH=$(curl -s "$BASE/api/products/?search=Appl" -H "$AUTH")
assert_eq "$(echo "$SEARCH" | jq -r .count)"               "1"      "3.6 search=Appl returns 1 row"
assert_eq "$(echo "$SEARCH" | jq -r '.results[0].name')"   "Apple"  "3.6 the row is Apple"

# ---------------------------------------------------------------------------
blue "[4] Manual stock entry"
# ---------------------------------------------------------------------------

# 4.1 — qty=2, unit_cost=1.50 for Apple
STOCK=$(curl -s -X POST "$BASE/api/stocks/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"product\":$APPLE_ID,\"quantity\":\"2\",\"unit_cost\":\"1.50\"}")
assert_eq "$(echo "$STOCK" | jq -r .source)"             "manual"   "4.1 manual stock source=manual"
assert_eq "$(echo "$STOCK" | jq -r .available_quantity)" "2.0000"   "4.1 available=2"

# 4.2 — Apple.current_stock is 2
APPLE_NOW=$(curl -s "$BASE/api/products/$APPLE_ID/" -H "$AUTH")
assert_eq "$(echo "$APPLE_NOW" | jq -r .current_stock)" "2.0000" "4.2 Apple current_stock=2.0000"

# ---------------------------------------------------------------------------
blue "[5] Purchase Order create + confirm"
# ---------------------------------------------------------------------------

# 5.3/5.5 — PO with Apple x10 @ 2.00 and Bread x5 @ 3.50 → total 37.50
PO=$(curl -s -X POST "$BASE/api/purchase-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"supplier\":\"Acme\",\"items\":[
        {\"product\":$APPLE_ID,\"quantity\":\"10\",\"unit_price\":\"2.00\"},
        {\"product\":$BREAD_ID,\"quantity\":\"5\",\"unit_price\":\"3.50\"}
      ]}")
PO_ID=$(echo "$PO" | jq -r .id)
assert_eq "$(echo "$PO" | jq -r .status)"     "draft"  "5.5 new PO status=draft"
assert_eq "$(echo "$PO" | jq -r .total_cost)" "37.50"  "5.3 PO total_cost=37.50"

# 5.7 — confirm
CONFIRMED=$(curl -s -X POST "$BASE/api/purchase-orders/$PO_ID/confirm/" -H "$AUTH")
assert_eq "$(echo "$CONFIRMED" | jq -r .status)" "confirmed" "5.7 PO confirmed"

# 5.8 — Apple current stock is 12 (10 from PO + 2 manual)
APPLE_AFTER_PO=$(curl -s "$BASE/api/products/$APPLE_ID/" -H "$AUTH")
assert_eq "$(echo "$APPLE_AFTER_PO" | jq -r .current_stock)" "12.0000" "5.8 Apple current_stock=12 (10+2)"

# Bread current stock is 5
BREAD_AFTER_PO=$(curl -s "$BASE/api/products/$BREAD_ID/" -H "$AUTH")
assert_eq "$(echo "$BREAD_AFTER_PO" | jq -r .current_stock)" "5.0000"  "5.8 Bread current_stock=5"

# ---------------------------------------------------------------------------
blue "[6] Sales Order — happy path"
# ---------------------------------------------------------------------------

# 6.1/6.2 — SO Apple x4 @ 5.00 and Bread x2 @ 6.00 → revenue 32.00
SO=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"customer\":\"John\",\"items\":[
        {\"product\":$APPLE_ID,\"quantity\":\"4\",\"unit_price\":\"5.00\"},
        {\"product\":$BREAD_ID,\"quantity\":\"2\",\"unit_price\":\"6.00\"}
      ]}")
SO_ID=$(echo "$SO" | jq -r .id)
assert_eq "$(echo "$SO" | jq -r .total_revenue)" "32.00" "6.1 SO total_revenue=32.00"

CONFIRMED_SO=$(curl -s -X POST "$BASE/api/sales-orders/$SO_ID/confirm/" -H "$AUTH")
assert_eq "$(echo "$CONFIRMED_SO" | jq -r .status)" "confirmed" "6.2 SO confirmed"

# 6.3 — Apple current_stock = 12 - 4 = 8
APPLE_AFTER_SO=$(curl -s "$BASE/api/products/$APPLE_ID/" -H "$AUTH")
assert_eq "$(echo "$APPLE_AFTER_SO" | jq -r .current_stock)" "8.0000" "6.3 Apple after SO=8"

# 6.4 — Sales History: at least one item with qty=4 and unit_price=5.00 for Apple
HAS_SALE=$(curl -s "$BASE/api/sales-orders/" -H "$AUTH" | jq --arg pid "$APPLE_ID" '
  [.results[].items[] | select(.product == ($pid | tonumber))
    | select(.quantity == "4.0000" and .unit_price == "5.00")] | length')
assert_eq "$HAS_SALE" "1" "6.4 Apple sales history has the qty=4 @ 5.00 line"

# ---------------------------------------------------------------------------
blue "[7] Sales Order — insufficient stock + cancel"
# ---------------------------------------------------------------------------

# 7.1 — create draft SO with 9999 Apples
BAD_SO=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"customer\":\"Greedy\",\"items\":[{\"product\":$APPLE_ID,\"quantity\":\"9999\",\"unit_price\":\"5.00\"}]}")
BAD_SO_ID=$(echo "$BAD_SO" | jq -r .id)
assert_eq "$(echo "$BAD_SO" | jq -r .status)" "draft" "7.1 oversized SO created as draft"

# 7.2 — confirm fails with 400 + readable error
CONFIRM_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/sales-orders/$BAD_SO_ID/confirm/" -H "$AUTH")
CONFIRM_CODE=$(echo "$CONFIRM_RESP" | tail -n 1)
CONFIRM_BODY=$(echo "$CONFIRM_RESP" | sed '$d')
assert_eq "$CONFIRM_CODE" "400" "7.2 confirm oversized SO → 400"
HAS_INSUFF=$(echo "$CONFIRM_BODY" | jq -r '.errors | map(test("Insufficient stock")) | any')
assert_eq "$HAS_INSUFF" "true" "7.2 error mentions 'Insufficient stock'"

# Status should still be draft
STILL_DRAFT=$(curl -s "$BASE/api/sales-orders/$BAD_SO_ID/" -H "$AUTH" | jq -r .status)
assert_eq "$STILL_DRAFT" "draft" "7.2 SO remains draft after failed confirm"

# 7.3 — cancel the SO
CANCEL_RESP=$(curl -s -X POST "$BASE/api/sales-orders/$BAD_SO_ID/cancel/" -H "$AUTH")
assert_eq "$(echo "$CANCEL_RESP" | jq -r .status)" "cancelled" "7.3 cancel oversized SO"

# ---------------------------------------------------------------------------
blue "[8] Dashboard"
# ---------------------------------------------------------------------------
# Confirmed totals only:
#   Cost    = 37.50  (PO Apple 10*2 + Bread 5*3.5 — manual stock NOT counted)
#   Revenue = 32.00  (SO Apple 4*5 + Bread 2*6)
#   Profit  = -5.50
DASH=$(curl -s "$BASE/api/finance/dashboard/" -H "$AUTH")
assert_eq "$(echo "$DASH" | jq -r .total_revenue)" "32.00"  "8.1 dashboard revenue=32"
assert_eq "$(echo "$DASH" | jq -r .total_cost)"    "37.50"  "8.1 dashboard cost=37.50"
assert_eq "$(echo "$DASH" | jq -r .total_profit)"  "-5.50"  "8.1 dashboard profit=-5.50"
# Margin = -5.50 / 37.50 * 100 ≈ -14.67
assert_eq "$(echo "$DASH" | jq -r .profit_margin)" "-14.67"     "8.1 dashboard margin=-14.67"

# 8.2 — products_summary has both products
SUMMARY_LEN=$(echo "$DASH" | jq -r '.products_summary | length')
assert_eq "$SUMMARY_LEN" "2" "8.2 products_summary has 2 rows"

APPLE_ROW=$(echo "$DASH" | jq -r --arg pid "$APPLE_ID" '
  .products_summary[] | select(.product_id == ($pid | tonumber))')
assert_eq "$(echo "$APPLE_ROW" | jq -r .total_purchased_quantity)" "10.0000"     "8.2 Apple purchased=10"
assert_eq "$(echo "$APPLE_ROW" | jq -r .total_sold_quantity)"      "4.0000"      "8.2 Apple sold=4"
assert_eq "$(echo "$APPLE_ROW" | jq -r .total_purchase_cost)"      "20.00"   "8.2 Apple cost=20"
assert_eq "$(echo "$APPLE_ROW" | jq -r .total_sales_revenue)"      "20.00"   "8.2 Apple revenue=20"

# ---------------------------------------------------------------------------
echo
if [[ $FAIL -eq 0 ]]; then
  green "All $PASS assertions passed. Backend mirrors the frontend journey 1:1."
  exit 0
else
  red "$FAIL failed / $PASS passed."
  exit 1
fi
