#!/usr/bin/env bash
# Runs every backend validation script in sequence and reports an aggregate
# pass/fail count. Exit code != 0 if any script fails.
#
# Each child script is expected to print "All N ... passed." on success.
# We tee its output to a per-script log under /tmp so failures are easy to inspect.

set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${LOG_DIR:-/tmp/inventory-validation}"
mkdir -p "$LOG_DIR"

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
blue()  { printf "\n\033[1;36m%s\033[0m\n" "$*"; }
dim()   { printf "\033[2m%s\033[0m\n" "$*"; }

# Order from cheapest/most-fundamental to most expensive/integration-heavy.
SCRIPTS=(
  e2e_smoke.sh
  validate_user_journey.sh
  validate_edge_cases.sh
  validate_db_consistency.sh
  validate_advanced_flows.sh
)

declare -a RESULTS
TOTAL_PASS=0
FAILED=0
START_AT=$(date +%s)

for s in "${SCRIPTS[@]}"; do
  path="$SCRIPT_DIR/$s"
  log="$LOG_DIR/$s.log"
  if [[ ! -x "$path" && ! -f "$path" ]]; then
    red "  MISS  $s (not found, skipping)"
    RESULTS+=("$s|SKIP|0|n/a")
    continue
  fi

  blue "▶ $s"
  dim "  log: $log"

  t0=$(date +%s)
  set +e
  bash "$path" > "$log" 2>&1
  rc=$?
  set -e
  t1=$(date +%s)

  # The success line every script prints: "All <N> ... passed."
  count=$(grep -oE 'All [0-9]+ ' "$log" | tail -n 1 | grep -oE '[0-9]+' || true)
  count=${count:-0}

  if [[ $rc -eq 0 ]]; then
    green "  ✓ $s — $count assertions passed in $((t1 - t0))s"
    RESULTS+=("$s|PASS|$count|$((t1 - t0))s")
    TOTAL_PASS=$((TOTAL_PASS + count))
  else
    red   "  ✗ $s — exit $rc (see $log)"
    RESULTS+=("$s|FAIL|$count|$((t1 - t0))s")
    FAILED=$((FAILED + 1))
    # Show the failing lines inline for quick triage.
    fails=$(grep -E '\bFAIL\b' "$log" | head -n 10 || true)
    if [[ -n "$fails" ]]; then
      printf "    %s\n" "$fails" | sed 's/^/    /'
    else
      tail -n 20 "$log" | sed 's/^/    /'
    fi
  fi
done

END_AT=$(date +%s)

blue "Summary"
printf "%-32s %-6s %10s %8s\n" "script" "status" "asserts" "time"
printf "%-32s %-6s %10s %8s\n" "------" "------" "-------" "----"
for r in "${RESULTS[@]}"; do
  IFS='|' read -r name status count dur <<<"$r"
  if [[ "$status" == "PASS" ]]; then
    printf "\033[32m%-32s %-6s %10s %8s\033[0m\n" "$name" "$status" "$count" "$dur"
  elif [[ "$status" == "SKIP" ]]; then
    printf "\033[33m%-32s %-6s %10s %8s\033[0m\n" "$name" "$status" "$count" "$dur"
  else
    printf "\033[31m%-32s %-6s %10s %8s\033[0m\n" "$name" "$status" "$count" "$dur"
  fi
done

echo
if [[ $FAILED -eq 0 ]]; then
  green "All scripts green — $TOTAL_PASS assertions across ${#SCRIPTS[@]} scripts in $((END_AT - START_AT))s."
  exit 0
else
  red "$FAILED script(s) failed. See logs in $LOG_DIR."
  exit 1
fi
