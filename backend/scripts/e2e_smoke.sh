#!/usr/bin/env bash
# End-to-end smoke test for the Inventory Management API.
# Walks the happy path used by the frontend: register -> login -> create products
# -> purchase order (create + confirm) -> sales order (create + confirm)
# -> dashboard + product financial -> error path (insufficient stock) -> cancel.
#
# Requires: server running on $BASE (default http://localhost:8000) + jq.
# Exits 0 if all assertions pass, non-zero on first failure.

set -u
BASE="${BASE:-http://localhost:8000}"
PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
blue()  { printf "\033[36m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }

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

assert_num_eq() {
  local actual="$1" expected="$2" label="$3"
  if awk "BEGIN{exit !(($actual)==($expected))}"; then
    green "  PASS  $label  (got: $actual)"
    PASS=$((PASS + 1))
  else
    red   "  FAIL  $label  expected=$expected got=$actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_nonempty() {
  local actual="$1" label="$2"
  if [[ -n "$actual" && "$actual" != "null" ]]; then
    green "  PASS  $label  (got: $actual)"
    PASS=$((PASS + 1))
  else
    red   "  FAIL  $label  value was empty/null"
    FAIL=$((FAIL + 1))
  fi
}

http_code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }

stamp=$(date +%s)
USER="smoke_$stamp"

blue "==> Registering user $USER and logging in"
REG_CODE=$(http_code -X POST "$BASE/api/auth/register/" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"email\":\"$USER@test.com\",\"password\":\"testpass123\"}")
assert_eq "$REG_CODE" "201" "register returns 201"

TOKEN=$(curl -s -X POST "$BASE/api/auth/login/" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"testpass123\"}" | jq -r .access)
assert_nonempty "$TOKEN" "login returned access token"
AUTH="Authorization: Bearer $TOKEN"

ME=$(curl -s -H "$AUTH" "$BASE/api/auth/me/" | jq -r .username)
assert_eq "$ME" "$USER" "/auth/me returns logged-in user"

blue "==> Creating two products"
P1=$(curl -s -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"Apple $stamp\",\"sku\":\"APL-$stamp\",\"unit_type\":\"kg\",\"description\":\"Red apple\"}")
P1_ID=$(echo "$P1" | jq -r .id)
assert_nonempty "$P1_ID" "product 1 created"

P2=$(curl -s -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"name\":\"Bread $stamp\",\"sku\":\"BRD-$stamp\",\"unit_type\":\"unit\",\"description\":\"Loaf\"}")
P2_ID=$(echo "$P2" | jq -r .id)
assert_nonempty "$P2_ID" "product 2 created"

LIST_COUNT=$(curl -s -H "$AUTH" "$BASE/api/products/" | jq '.count // (.results|length) // length')
assert_num_eq "$LIST_COUNT >= 2" "1" "products list has at least 2 entries"

blue "==> Creating a purchase order (10 kg apple @ \$2.00, 5 units bread @ \$3.50)"
PO=$(curl -s -X POST "$BASE/api/purchase-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"supplier\":\"Acme Foods\",
    \"notes\":\"smoke test\",
    \"items\":[
      {\"product\":$P1_ID,\"quantity\":\"10\",\"unit_price\":\"2.00\"},
      {\"product\":$P2_ID,\"quantity\":\"5\",\"unit_price\":\"3.50\"}
    ]
  }")
PO_ID=$(echo "$PO" | jq -r .id)
PO_STATUS=$(echo "$PO" | jq -r .status)
assert_nonempty "$PO_ID" "purchase order created"
assert_eq "$PO_STATUS" "draft" "new PO is draft"

blue "==> Confirming the purchase order (should create stock entries)"
CONFIRM_PO=$(curl -s -X POST "$BASE/api/purchase-orders/$PO_ID/confirm/" -H "$AUTH")
assert_eq "$(echo "$CONFIRM_PO" | jq -r .status)" "confirmed" "PO is now confirmed"

STOCK_P1=$(curl -s -H "$AUTH" "$BASE/api/stocks/?product=$P1_ID")
P1_AVAIL=$(echo "$STOCK_P1" | jq '[.results // .][0] | map(.available_quantity|tonumber) | add')
assert_num_eq "$P1_AVAIL" "10" "apple available stock = 10"

STOCK_P2=$(curl -s -H "$AUTH" "$BASE/api/stocks/?product=$P2_ID")
P2_AVAIL=$(echo "$STOCK_P2" | jq '[.results // .][0] | map(.available_quantity|tonumber) | add')
assert_num_eq "$P2_AVAIL" "5" "bread available stock = 5"

blue "==> Creating a sales order (4 kg apple @ \$5.00, 2 units bread @ \$6.00)"
SO=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"customer\":\"John Doe\",
    \"notes\":\"smoke test\",
    \"items\":[
      {\"product\":$P1_ID,\"quantity\":\"4\",\"unit_price\":\"5.00\"},
      {\"product\":$P2_ID,\"quantity\":\"2\",\"unit_price\":\"6.00\"}
    ]
  }")
SO_ID=$(echo "$SO" | jq -r .id)
assert_nonempty "$SO_ID" "sales order created"

blue "==> Confirming the sales order (should deduct stock)"
CONFIRM_SO=$(curl -s -X POST "$BASE/api/sales-orders/$SO_ID/confirm/" -H "$AUTH")
assert_eq "$(echo "$CONFIRM_SO" | jq -r .status)" "confirmed" "SO is now confirmed"

P1_AVAIL_AFTER=$(curl -s -H "$AUTH" "$BASE/api/stocks/?product=$P1_ID" \
  | jq '[.results // .][0] | map(.available_quantity|tonumber) | add')
assert_num_eq "$P1_AVAIL_AFTER" "6" "apple available stock dropped to 6 (10 - 4)"

P2_AVAIL_AFTER=$(curl -s -H "$AUTH" "$BASE/api/stocks/?product=$P2_ID" \
  | jq '[.results // .][0] | map(.available_quantity|tonumber) | add')
assert_num_eq "$P2_AVAIL_AFTER" "3" "bread available stock dropped to 3 (5 - 2)"

blue "==> Checking dashboard financial aggregates"
DASH=$(curl -s -H "$AUTH" "$BASE/api/finance/dashboard/")
REV=$(echo "$DASH" | jq -r .total_revenue)
COST=$(echo "$DASH" | jq -r .total_cost)
PROFIT=$(echo "$DASH" | jq -r .total_profit)
# Backend semantics:
#   total_revenue = sum of confirmed sales = 4*5 + 2*6 = 32
#   total_cost    = sum of confirmed purchases = 10*2 + 5*3.50 = 37.50
#   total_profit  = total_revenue - total_cost = -5.50
assert_num_eq "$REV" "32" "dashboard total_revenue = 32"
assert_num_eq "$COST" "37.5" "dashboard total_cost = 37.50"
assert_num_eq "$PROFIT" "-5.5" "dashboard total_profit = -5.50"
# Sanity: profit must equal revenue - cost regardless of definition
assert_num_eq "$PROFIT" "$REV - $COST" "profit == revenue - cost (consistency)"

blue "==> Checking product financial endpoint for apple"
PFIN=$(curl -s -H "$AUTH" "$BASE/api/finance/products/$P1_ID/")
assert_num_eq "$(echo "$PFIN" | jq -r .total_purchased_quantity)" "10" "apple purchased qty = 10"
assert_num_eq "$(echo "$PFIN" | jq -r .total_sold_quantity)" "4" "apple sold qty = 4"
assert_num_eq "$(echo "$PFIN" | jq -r .total_sales_revenue)" "20" "apple revenue = 20"

blue "==> Error path: sales order with insufficient stock should fail to confirm"
SO_BAD=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{
    \"customer\":\"Greedy\",
    \"items\":[{\"product\":$P1_ID,\"quantity\":\"9999\",\"unit_price\":\"5.00\"}]
  }")
SO_BAD_ID=$(echo "$SO_BAD" | jq -r .id)
assert_nonempty "$SO_BAD_ID" "draft SO with huge quantity created"

CONFIRM_BAD=$(http_code -X POST "$BASE/api/sales-orders/$SO_BAD_ID/confirm/" -H "$AUTH")
if [[ "$CONFIRM_BAD" == "400" || "$CONFIRM_BAD" == "409" || "$CONFIRM_BAD" == "422" ]]; then
  green "  PASS  insufficient-stock confirm rejected (got: $CONFIRM_BAD)"
  PASS=$((PASS + 1))
else
  red   "  FAIL  insufficient-stock confirm should be 4xx, got $CONFIRM_BAD"
  FAIL=$((FAIL + 1))
fi

blue "==> Cancelling the bad SO"
CANCEL_CODE=$(http_code -X POST "$BASE/api/sales-orders/$SO_BAD_ID/cancel/" -H "$AUTH")
assert_eq "$CANCEL_CODE" "200" "cancel SO returns 200"
SO_BAD_STATUS=$(curl -s -H "$AUTH" "$BASE/api/sales-orders/$SO_BAD_ID/" | jq -r .status)
assert_eq "$SO_BAD_STATUS" "cancelled" "bad SO is now cancelled"

blue "==> Cancelling a fresh draft PO"
PO2=$(curl -s -X POST "$BASE/api/purchase-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"supplier\":\"Tmp\",\"items\":[{\"product\":$P1_ID,\"quantity\":\"1\",\"unit_price\":\"1\"}]}")
PO2_ID=$(echo "$PO2" | jq -r .id)
CANCEL_PO=$(http_code -X POST "$BASE/api/purchase-orders/$PO2_ID/cancel/" -H "$AUTH")
assert_eq "$CANCEL_PO" "200" "cancel PO returns 200"

echo
if [[ $FAIL -eq 0 ]]; then
  green "All $PASS assertions passed."
  exit 0
else
  yellow "Summary: PASS=$PASS  FAIL=$FAIL"
  exit 1
fi
