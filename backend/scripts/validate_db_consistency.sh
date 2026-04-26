#!/usr/bin/env bash
# Cross-checks the API responses against the actual rows in Postgres.
# Catches bugs that the API would hide (forgotten created_by filters,
# serializers that mask fields, aggregation drift, etc.).
#
# Prereqs:
#   - backend on $BASE (default http://localhost:8000)
#   - docker compose project up at $COMPOSE_DIR (default = repo root)
#   - jq installed
# Exits 0 only if every assertion passes.

set -u
BASE="${BASE:-http://localhost:8000}"
COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
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

# Run a single SQL query, returning the trimmed scalar result.
# Surfaces psql errors (stderr -> stderr) so silent SQL bugs don't masquerade
# as empty assertion outputs.
psql_q() {
  local sql="$1"
  ( cd "$COMPOSE_DIR" && \
    docker compose exec -T db psql -U postgres -d inventory_db -tAc "$sql" \
      2> >(grep -v 'attribute .version. is obsolete' >&2) \
  ) | tr -d '[:space:]'
}

stamp=$(date +%s)
USERNAME="qa_db_$stamp"

blue "Setup: register/login as $USERNAME"
curl -s -X POST "$BASE/api/auth/register/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"email\":\"$USERNAME@test.com\",\"password\":\"testpass123\"}" \
  > /dev/null
TOKEN=$(curl -s -X POST "$BASE/api/auth/login/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"testpass123\"}" | jq -r .access)
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || { red "could not login"; exit 2; }
AUTH="Authorization: Bearer $TOKEN"

UID_DB=$(psql_q "SELECT id FROM auth_user WHERE username='$USERNAME'")
[[ -n "$UID_DB" ]] || { red "user not in DB"; exit 2; }
echo "  user_id=$UID_DB"

# ---------------------------------------------------------------------------
blue "[1] Product create: API row matches DB row"
# ---------------------------------------------------------------------------
PROD=$(curl -s -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Apple","sku":"APL-001","unit_type":"kg","description":"Red apple"}')
PID=$(echo "$PROD" | jq -r .id)

# DB row exists with correct created_by_id
DB_OWNER=$(psql_q "SELECT created_by_id FROM products_product WHERE id=$PID")
assert_eq "$DB_OWNER" "$UID_DB" "1.1 product.created_by_id is the requesting user"

DB_NAME=$(psql_q "SELECT name FROM products_product WHERE id=$PID")
assert_eq "$DB_NAME" "Apple" "1.2 product.name persisted"

DB_SKU=$(psql_q "SELECT sku FROM products_product WHERE id=$PID")
assert_eq "$DB_SKU" "APL-001" "1.3 product.sku persisted"

DB_UNIT=$(psql_q "SELECT unit_type FROM products_product WHERE id=$PID")
assert_eq "$DB_UNIT" "kg" "1.4 product.unit_type persisted"

# ---------------------------------------------------------------------------
blue "[2] Manual stock create: every field round-trips"
# ---------------------------------------------------------------------------
STOCK=$(curl -s -X POST "$BASE/api/stocks/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"product\":$PID,\"quantity\":\"3\",\"unit_cost\":\"1.50\"}")
SID=$(echo "$STOCK" | jq -r .id)

DB_QTY=$(psql_q "SELECT quantity FROM products_stock WHERE id=$SID")
DB_AVAIL=$(psql_q "SELECT available_quantity FROM products_stock WHERE id=$SID")
DB_COST=$(psql_q "SELECT unit_cost FROM products_stock WHERE id=$SID")
DB_SRC=$(psql_q "SELECT source FROM products_stock WHERE id=$SID")
DB_POI=$(psql_q "SELECT COALESCE(purchase_order_item_id::text,'NULL') FROM products_stock WHERE id=$SID")
assert_eq "$DB_QTY"   "3.0000"   "2.1 manual stock quantity persisted"
assert_eq "$DB_AVAIL" "3.0000"   "2.2 manual stock available_quantity = quantity"
assert_eq "$DB_COST"  "1.50"     "2.3 manual stock unit_cost persisted"
assert_eq "$DB_SRC"   "manual"   "2.4 manual stock source=manual"
assert_eq "$DB_POI"   "NULL"     "2.5 manual stock has no purchase_order_item link"

# ---------------------------------------------------------------------------
blue "[3] PO confirm creates Stock rows linked to PO items"
# ---------------------------------------------------------------------------
BREAD=$(curl -s -X POST "$BASE/api/products/" -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Bread","sku":"BRD-001","unit_type":"unit"}' | jq -r .id)

PO=$(curl -s -X POST "$BASE/api/purchase-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"supplier\":\"Acme\",\"items\":[
        {\"product\":$PID,\"quantity\":\"10\",\"unit_price\":\"2.00\"},
        {\"product\":$BREAD,\"quantity\":\"5\",\"unit_price\":\"3.50\"}
      ]}")
PO_ID=$(echo "$PO" | jq -r .id)

# Before confirm: 0 stock rows linked to this PO's items
LINKED_BEFORE=$(psql_q "SELECT count(*) FROM products_stock s
                        JOIN purchases_purchaseorderitem i ON s.purchase_order_item_id = i.id
                        WHERE i.purchase_order_id = $PO_ID")
assert_eq "$LINKED_BEFORE" "0" "3.1 no stock rows linked before PO confirm"

curl -s -X POST "$BASE/api/purchase-orders/$PO_ID/confirm/" -H "$AUTH" > /dev/null

# After confirm: 2 stock rows, source='purchase_order', linked, owned by user
LINKED_AFTER=$(psql_q "SELECT count(*) FROM products_stock s
                       JOIN purchases_purchaseorderitem i ON s.purchase_order_item_id = i.id
                       WHERE i.purchase_order_id = $PO_ID")
assert_eq "$LINKED_AFTER" "2" "3.2 2 stock rows linked after PO confirm"

PO_SRC=$(psql_q "SELECT count(*) FROM products_stock s
                 JOIN purchases_purchaseorderitem i ON s.purchase_order_item_id = i.id
                 WHERE i.purchase_order_id = $PO_ID AND s.source <> 'purchase_order'")
assert_eq "$PO_SRC" "0" "3.3 every PO-derived stock row has source='purchase_order'"

PO_OWNER=$(psql_q "SELECT count(*) FROM products_stock s
                   JOIN purchases_purchaseorderitem i ON s.purchase_order_item_id = i.id
                   WHERE i.purchase_order_id = $PO_ID AND s.created_by_id <> $UID_DB")
assert_eq "$PO_OWNER" "0" "3.4 every PO-derived stock row owned by requesting user"

# Stock from confirmed PO matches PO item exactly
APPLE_PO_STOCK_QTY=$(psql_q "SELECT s.quantity FROM products_stock s
                              JOIN purchases_purchaseorderitem i ON s.purchase_order_item_id = i.id
                              WHERE i.purchase_order_id=$PO_ID AND i.product_id=$PID")
APPLE_PO_STOCK_COST=$(psql_q "SELECT s.unit_cost FROM products_stock s
                              JOIN purchases_purchaseorderitem i ON s.purchase_order_item_id = i.id
                              WHERE i.purchase_order_id=$PO_ID AND i.product_id=$PID")
assert_eq "$APPLE_PO_STOCK_QTY"  "10.0000" "3.5 Apple PO stock quantity = item quantity"
assert_eq "$APPLE_PO_STOCK_COST" "2.00"    "3.6 Apple PO stock unit_cost = item unit_price"

# PO status persisted
PO_STATUS_DB=$(psql_q "SELECT status FROM purchases_purchaseorder WHERE id=$PO_ID")
assert_eq "$PO_STATUS_DB" "confirmed" "3.7 PO status persisted as confirmed"

# ---------------------------------------------------------------------------
blue "[4] SO confirm decrements available_quantity (does not delete rows)"
# ---------------------------------------------------------------------------
# Snapshot available + total stock rows for Apple before sale
APPLE_AVAIL_BEFORE=$(psql_q "SELECT COALESCE(SUM(available_quantity),0) FROM products_stock
                              WHERE product_id=$PID AND created_by_id=$UID_DB")
APPLE_ROWS_BEFORE=$(psql_q "SELECT count(*) FROM products_stock
                             WHERE product_id=$PID AND created_by_id=$UID_DB")
assert_eq "$APPLE_AVAIL_BEFORE" "13.0000" "4.1 Apple available before SO = 10 PO + 3 manual"

# Sell 5 apples
SO=$(curl -s -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"customer\":\"Buyer\",\"items\":[{\"product\":$PID,\"quantity\":\"5\",\"unit_price\":\"7.00\"}]}")
SO_ID=$(echo "$SO" | jq -r .id)
curl -s -X POST "$BASE/api/sales-orders/$SO_ID/confirm/" -H "$AUTH" > /dev/null

APPLE_AVAIL_AFTER=$(psql_q "SELECT COALESCE(SUM(available_quantity),0) FROM products_stock
                             WHERE product_id=$PID AND created_by_id=$UID_DB")
APPLE_ROWS_AFTER=$(psql_q "SELECT count(*) FROM products_stock
                            WHERE product_id=$PID AND created_by_id=$UID_DB")
APPLE_QTY_AFTER=$(psql_q "SELECT COALESCE(SUM(quantity),0) FROM products_stock
                           WHERE product_id=$PID AND created_by_id=$UID_DB")

assert_eq "$APPLE_AVAIL_AFTER" "8.0000"  "4.2 Apple available after SO = 13 - 5"
assert_eq "$APPLE_ROWS_AFTER"  "$APPLE_ROWS_BEFORE" "4.3 SO confirm did NOT delete stock rows"
assert_eq "$APPLE_QTY_AFTER"   "13.0000" "4.4 SO confirm did NOT change original quantity column"

# FIFO check at row level: manual stock (oldest) should be fully consumed (0),
# and the PO-derived stock should hold the remaining 8.
MANUAL_AVAIL=$(psql_q "SELECT available_quantity FROM products_stock
                        WHERE id=$SID")
PO_AVAIL=$(psql_q "SELECT available_quantity FROM products_stock s
                    JOIN purchases_purchaseorderitem i ON s.purchase_order_item_id=i.id
                    WHERE i.purchase_order_id=$PO_ID AND i.product_id=$PID")
assert_eq "$MANUAL_AVAIL" "0.0000" "4.5 FIFO: oldest (manual) row drained first"
assert_eq "$PO_AVAIL"     "8.0000" "4.6 FIFO: newer (PO) row holds remainder"

# ---------------------------------------------------------------------------
blue "[5] Dashboard math == raw SQL aggregation"
# ---------------------------------------------------------------------------
# API
DASH=$(curl -s "$BASE/api/finance/dashboard/" -H "$AUTH")
API_REVENUE=$(echo "$DASH" | jq -r .total_revenue)
API_COST=$(echo "$DASH" | jq -r .total_cost)

# SQL: confirmed only, scoped by user
SQL_REVENUE=$(psql_q "
  SELECT COALESCE(ROUND(SUM(soi.quantity * soi.unit_price), 2), 0)
  FROM sales_salesorderitem soi
  JOIN sales_salesorder so ON soi.sales_order_id = so.id
  WHERE so.created_by_id = $UID_DB AND so.status = 'confirmed'")
SQL_COST=$(psql_q "
  SELECT COALESCE(ROUND(SUM(poi.quantity * poi.unit_price), 2), 0)
  FROM purchases_purchaseorderitem poi
  JOIN purchases_purchaseorder po ON poi.purchase_order_id = po.id
  WHERE po.created_by_id = $UID_DB AND po.status = 'confirmed'")

# Both numbers come out at 2 decimal places (quantized in finance/utils.py)
assert_eq "$API_REVENUE" "$SQL_REVENUE" "5.1 dashboard revenue == SUM(SO items) where status=confirmed"
assert_eq "$API_COST"    "$SQL_COST"    "5.2 dashboard cost == SUM(PO items) where status=confirmed"

# Cancelled / draft must not influence totals — create one of each and re-check
PO_CANCEL=$(curl -s -X POST "$BASE/api/purchase-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$PID,\"quantity\":\"100\",\"unit_price\":\"99.00\"}]}" | jq -r .id)
curl -s -X POST "$BASE/api/purchase-orders/$PO_CANCEL/cancel/" -H "$AUTH" > /dev/null

curl -s -X POST "$BASE/api/sales-orders/" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"product\":$PID,\"quantity\":\"1\",\"unit_price\":\"999.00\"}]}" > /dev/null

DASH2=$(curl -s "$BASE/api/finance/dashboard/" -H "$AUTH")
assert_eq "$(echo "$DASH2" | jq -r .total_cost)"    "$API_COST"    "5.3 cancelled PO did not change total_cost"
assert_eq "$(echo "$DASH2" | jq -r .total_revenue)" "$API_REVENUE" "5.4 draft SO did not change total_revenue"

# ---------------------------------------------------------------------------
blue "[6] current_stock from API == SUM(available_quantity) in DB"
# ---------------------------------------------------------------------------
API_CURRENT=$(curl -s "$BASE/api/products/$PID/" -H "$AUTH" | jq -r .current_stock)
DB_CURRENT=$(psql_q "SELECT COALESCE(SUM(available_quantity),0) FROM products_stock
                      WHERE product_id=$PID AND created_by_id=$UID_DB")
assert_eq "$API_CURRENT" "$DB_CURRENT" "6.1 product.current_stock matches DB SUM"

# ---------------------------------------------------------------------------
blue "[7] Cross-user isolation at the DB level"
# ---------------------------------------------------------------------------
USER2="qa_db_other_$stamp"
curl -s -X POST "$BASE/api/auth/register/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER2\",\"email\":\"$USER2@test.com\",\"password\":\"testpass123\"}" > /dev/null
T2=$(curl -s -X POST "$BASE/api/auth/login/" -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER2\",\"password\":\"testpass123\"}" | jq -r .access)

# user2 hits /api/products/ → must see only its own
USER2_API_COUNT=$(curl -s "$BASE/api/products/" -H "Authorization: Bearer $T2" | jq -r .count)
USER2_DB_COUNT=$(psql_q "SELECT count(*) FROM products_product
                          WHERE created_by_id=(SELECT id FROM auth_user WHERE username='$USER2')")
assert_eq "$USER2_API_COUNT" "0"             "7.1 user2 API products count=0"
assert_eq "$USER2_API_COUNT" "$USER2_DB_COUNT" "7.2 API count == DB count for user2"

# user1 still sees its own intact
USER1_API_COUNT=$(curl -s "$BASE/api/products/" -H "$AUTH" | jq -r .count)
USER1_DB_COUNT=$(psql_q "SELECT count(*) FROM products_product WHERE created_by_id=$UID_DB")
assert_eq "$USER1_API_COUNT" "$USER1_DB_COUNT" "7.3 user1 API products count == DB count"

# ---------------------------------------------------------------------------
echo
if [[ $FAIL -eq 0 ]]; then
  green "All $PASS DB-consistency assertions passed."
  exit 0
else
  red "$FAIL failed / $PASS passed."
  exit 1
fi
