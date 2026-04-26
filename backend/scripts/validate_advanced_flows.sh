#!/usr/bin/env bash
# Advanced backend flows that the simpler scripts don't cover:
#   - Pagination + ordering
#   - Auth lifecycle: refresh, invalid token, missing token
#   - Decimal precision on quantities/prices
#   - Schema validation negatives (bad unit_type, negative qty/price, empty items, etc.)
#   - Sequential SOs draining the same lot ("light concurrency")
#   - PO with two lots of the same product → FIFO order honored
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
USERNAME="qa_adv_$stamp"

blue "Setup"
curl -s -X POST "$BASE/api/auth/register/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"email\":\"$USERNAME@test.com\",\"password\":\"testpass123\"}" \
  > /dev/null
LOGIN=$(curl -s -X POST "$BASE/api/auth/login/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"testpass123\"}")
TOKEN=$(echo "$LOGIN" | jq -r .access)
REFRESH=$(echo "$LOGIN" | jq -r .refresh)
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || { red "could not login"; exit 2; }
AUTH="Authorization: Bearer $TOKEN"

# ---------------------------------------------------------------------------
blue "[1] Auth lifecycle"
# ---------------------------------------------------------------------------

# Missing header
CODE=$(http_code "$BASE/api/auth/me/")
assert_eq "$CODE" "401" "1.1 /me/ without Authorization → 401"

# Garbage token
CODE=$(http_code "$BASE/api/auth/me/" -H "Authorization: Bearer not.a.real.token")
assert_eq "$CODE" "401" "1.2 /me/ with malformed token → 401"

# Wrong password on login
CODE=$(http_code -X POST "$BASE/api/auth/login/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"wrong\"}")
assert_eq "$CODE" "401" "1.3 login with wrong password → 401"

# Refresh issues a new access token, and it actually works on a protected endpoint
NEW_ACCESS=$(curl -s -X POST "$BASE/api/auth/refresh/" -H "Content-Type: application/json" \
  -d "{\"refresh\":\"$REFRESH\"}" | jq -r .access)
assert_eq "$([[ -n "$NEW_ACCESS" && "$NEW_ACCESS" != "null" ]] && echo ok)" "ok" \
  "1.4 /refresh/ returns a new access token"

CODE=$(http_code "$BASE/api/auth/me/" -H "Authorization: Bearer $NEW_ACCESS")
assert_eq "$CODE" "200" "1.5 refreshed access token works on /me/"

# Refresh with garbage payload
CODE=$(http_code -X POST "$BASE/api/auth/refresh/" -H "Content-Type: application/json" \
  -d '{"refresh":"junk"}')
assert_eq "$CODE" "401" "1.6 /refresh/ with junk → 401"

# Re-register same username → 400
CODE=$(http_code -X POST "$BASE/api/auth/register/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"email\":\"x@x.com\",\"password\":\"testpass123\"}")
assert_eq "$CODE" "400" "1.7 register duplicate username → 400"

# Short password (<8 chars per RegisterSerializer)
CODE=$(http_code -X POST "$BASE/api/auth/register/" -H "Content-Type: application/json" \
  -d '{"username":"shortpw_user","password":"abc"}')
assert_eq "$CODE" "400" "1.8 register with short password → 400"

# ---------------------------------------------------------------------------
blue "[2] Pagination + ordering"
# ---------------------------------------------------------------------------
# Create 25 products quickly. Page size = 20 (settings).
for i in $(seq -w 1 25); do
  curl -s -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"name\":\"Item $i\",\"sku\":\"SKU-$i\",\"unit_type\":\"unit\"}" > /dev/null
done

PAGE1=$(curl -s "$BASE/api/products/" -H "$AUTH")
assert_eq "$(echo "$PAGE1" | jq -r .count)" "25" "2.1 count=25 on page 1"
assert_eq "$(echo "$PAGE1" | jq -r '.results | length')" "20" "2.2 page 1 has 20 results"
assert_eq "$(echo "$PAGE1" | jq -r '.next != null')" "true" "2.3 next link present on page 1"
assert_eq "$(echo "$PAGE1" | jq -r '.previous')" "null" "2.4 previous is null on page 1"

PAGE2=$(curl -s "$BASE/api/products/?page=2" -H "$AUTH")
assert_eq "$(echo "$PAGE2" | jq -r '.results | length')" "5" "2.5 page 2 has 5 results"
assert_eq "$(echo "$PAGE2" | jq -r '.next')" "null" "2.6 next is null on last page"

# Page out of range
CODE=$(http_code "$BASE/api/products/?page=99" -H "$AUTH")
assert_eq "$CODE" "404" "2.7 out-of-range page → 404"

# Ordering ascending by name
ASC_FIRST=$(curl -s "$BASE/api/products/?ordering=name" -H "$AUTH" | jq -r '.results[0].name')
assert_eq "$ASC_FIRST" "Item 01" "2.8 ?ordering=name → 'Item 01' first"

# Ordering descending by name
DESC_FIRST=$(curl -s "$BASE/api/products/?ordering=-name" -H "$AUTH" | jq -r '.results[0].name')
assert_eq "$DESC_FIRST" "Item 25" "2.9 ?ordering=-name → 'Item 25' first"

# Search narrows the result set
SEARCH=$(curl -s "$BASE/api/products/?search=SKU-12" -H "$AUTH")
assert_eq "$(echo "$SEARCH" | jq -r .count)" "1" "2.10 search by SKU returns exact match"

# ---------------------------------------------------------------------------
blue "[3] Schema validation negatives"
# ---------------------------------------------------------------------------

# 3.1 invalid unit_type
CODE=$(http_code -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Bad","sku":"BAD-1","unit_type":"banana"}')
assert_eq "$CODE" "400" "3.1 unit_type='banana' → 400"

# Pick one product to use as the target for negative PO/SO tests
TARGET_PID=$(curl -s "$BASE/api/products/?ordering=name" -H "$AUTH" | jq -r '.results[0].id')

# 3.2 PO with empty items
CODE=$(http_code -X POST "$BASE/api/purchase-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"items":[]}')
assert_eq "$CODE" "400" "3.2 PO with empty items → 400"

# 3.3 SO with empty items
CODE=$(http_code -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"items":[]}')
assert_eq "$CODE" "400" "3.3 SO with empty items → 400"

# 3.4 PO referencing non-existent product
CODE=$(http_code -X POST "$BASE/api/purchase-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"items":[{"product":999999,"quantity":"1","unit_price":"1.00"}]}')
assert_eq "$CODE" "400" "3.4 PO with unknown product → 400"

# 3.5 PO with non-numeric price
CODE=$(http_code -X POST "$BASE/api/purchase-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$TARGET_PID,\"quantity\":\"1\",\"unit_price\":\"abc\"}]}")
assert_eq "$CODE" "400" "3.5 PO with non-numeric unit_price → 400"

# 3.6 PO referencing another user's product → 400 (validate_items)
USER_OTHER="qa_other_$stamp"
curl -s -X POST "$BASE/api/auth/register/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER_OTHER\",\"email\":\"$USER_OTHER@test.com\",\"password\":\"testpass123\"}" \
  > /dev/null
T_OTHER=$(curl -s -X POST "$BASE/api/auth/login/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER_OTHER\",\"password\":\"testpass123\"}" | jq -r .access)
CODE=$(http_code -X POST "$BASE/api/purchase-orders/" \
  -H "Authorization: Bearer $T_OTHER" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$TARGET_PID,\"quantity\":\"1\",\"unit_price\":\"1.00\"}]}")
assert_eq "$CODE" "400" "3.6 PO referencing another user's product → 400"

# ---------------------------------------------------------------------------
blue "[4] Decimal precision through the pipeline"
# ---------------------------------------------------------------------------
# quantity 0.1234, unit_price 12.99 → total per item = 1.602966
# 5 items of that → total_cost = 8.01483
# Then sell at 50.00 each: revenue = 0.1234 * 50 = 6.17 per item, 5 items = 30.85
DEC_PROD=$(curl -s -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Saffron","sku":"SAF-1","unit_type":"g"}' | jq -r .id)

PO_DEC=$(curl -s -X POST "$BASE/api/purchase-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"items\":[
        {\"product\":$DEC_PROD,\"quantity\":\"0.1234\",\"unit_price\":\"12.99\"},
        {\"product\":$DEC_PROD,\"quantity\":\"0.1234\",\"unit_price\":\"12.99\"},
        {\"product\":$DEC_PROD,\"quantity\":\"0.1234\",\"unit_price\":\"12.99\"},
        {\"product\":$DEC_PROD,\"quantity\":\"0.1234\",\"unit_price\":\"12.99\"},
        {\"product\":$DEC_PROD,\"quantity\":\"0.1234\",\"unit_price\":\"12.99\"}
      ]}" | jq -r .id)
curl -s -X POST "$BASE/api/purchase-orders/$PO_DEC/confirm/" -H "$AUTH" > /dev/null

# Stock total available_quantity should be 5 * 0.1234 = 0.6170
SAF_STOCK=$(curl -s "$BASE/api/products/$DEC_PROD/" -H "$AUTH" | jq -r .current_stock)
assert_eq "$SAF_STOCK" "0.6170" "4.1 Saffron stock = 5 * 0.1234 = 0.6170"

# Sell 5 * 0.1234 at 50.00
SO_DEC=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"items\":[
        {\"product\":$DEC_PROD,\"quantity\":\"0.1234\",\"unit_price\":\"50.00\"},
        {\"product\":$DEC_PROD,\"quantity\":\"0.1234\",\"unit_price\":\"50.00\"},
        {\"product\":$DEC_PROD,\"quantity\":\"0.1234\",\"unit_price\":\"50.00\"},
        {\"product\":$DEC_PROD,\"quantity\":\"0.1234\",\"unit_price\":\"50.00\"},
        {\"product\":$DEC_PROD,\"quantity\":\"0.1234\",\"unit_price\":\"50.00\"}
      ]}" | jq -r .id)
curl -s -X POST "$BASE/api/sales-orders/$SO_DEC/confirm/" -H "$AUTH" > /dev/null

# Per-product financial endpoint
FIN=$(curl -s "$BASE/api/finance/products/$DEC_PROD/" -H "$AUTH")
# Cost  = 5 * 0.1234 * 12.99 = 8.014830 → rounded to 2dp = 8.01
# Rev   = 5 * 0.1234 * 50.00 = 30.850000 → rounded to 2dp = 30.85
# Stock = 0
assert_eq "$(echo "$FIN" | jq -r .total_purchase_cost)" "8.01"   "4.2 saffron cost rounded to 8.01"
assert_eq "$(echo "$FIN" | jq -r .total_sales_revenue)" "30.85"  "4.3 saffron revenue rounded to 30.85"
assert_eq "$(echo "$FIN" | jq -r .current_stock)"       "0.0000" "4.4 saffron stock fully consumed"

# ---------------------------------------------------------------------------
blue "[5] FIFO across two PO lots of the same product"
# ---------------------------------------------------------------------------
SUGAR=$(curl -s -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Sugar","sku":"SGR-1","unit_type":"kg"}' | jq -r .id)

# Single PO with two line items for the same product, different prices
PO_TWO=$(curl -s -X POST "$BASE/api/purchase-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"items\":[
        {\"product\":$SUGAR,\"quantity\":\"50\",\"unit_price\":\"1.00\"},
        {\"product\":$SUGAR,\"quantity\":\"50\",\"unit_price\":\"2.00\"}
      ]}" | jq -r .id)
curl -s -X POST "$BASE/api/purchase-orders/$PO_TWO/confirm/" -H "$AUTH" > /dev/null

# Sell 60: should drain the cheaper $1 lot first (created first within the same atomic block,
# preserved by SERIAL/auto-id ordering even when created_at is identical).
SO_TWO=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$SUGAR,\"quantity\":\"60\",\"unit_price\":\"5.00\"}]}" | jq -r .id)
curl -s -X POST "$BASE/api/sales-orders/$SO_TWO/confirm/" -H "$AUTH" > /dev/null

# Stock should be 0 in the $1 lot, 40 in the $2 lot
STOCKS=$(curl -s "$BASE/api/stocks/?product=$SUGAR" -H "$AUTH" \
  | jq -r '.results | sort_by(.unit_cost) | .[] | "\(.unit_cost):\(.available_quantity)"')
LINE1=$(echo "$STOCKS" | head -n 1)
LINE2=$(echo "$STOCKS" | tail -n 1)
assert_eq "$LINE1" "1.00:0.0000"  "5.1 cheaper lot fully drained (FIFO)"
assert_eq "$LINE2" "2.00:40.0000" "5.2 second lot has 40 left"

# ---------------------------------------------------------------------------
blue "[6] Sequential SOs draining the same lot"
# ---------------------------------------------------------------------------
# Sugar still has 40 available. Build two draft SOs of 30 each. Confirm the
# first → succeeds. Confirm the second → must fail because there are only 10 left.
SO_A=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$SUGAR,\"quantity\":\"30\",\"unit_price\":\"5.00\"}]}" | jq -r .id)
SO_B=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$SUGAR,\"quantity\":\"30\",\"unit_price\":\"5.00\"}]}" | jq -r .id)

CODE_A=$(http_code -X POST "$BASE/api/sales-orders/$SO_A/confirm/" -H "$AUTH")
assert_eq "$CODE_A" "200" "6.1 first SO (30 of 40) confirms"

CODE_B=$(http_code -X POST "$BASE/api/sales-orders/$SO_B/confirm/" -H "$AUTH")
assert_eq "$CODE_B" "400" "6.2 second SO (30 of remaining 10) rejected"

# Sugar should be at 10 remaining (40 - 30)
SUGAR_STOCK=$(curl -s "$BASE/api/products/$SUGAR/" -H "$AUTH" | jq -r .current_stock)
assert_eq "$SUGAR_STOCK" "10.0000" "6.3 Sugar stock=10 after the second confirm failed"

# ---------------------------------------------------------------------------
echo
if [[ $FAIL -eq 0 ]]; then
  green "All $PASS advanced-flow assertions passed."
  exit 0
else
  red "$FAIL failed / $PASS passed."
  exit 1
fi
