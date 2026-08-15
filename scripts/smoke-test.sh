#!/usr/bin/env bash
#
# End-to-end API test. Boots the server, exercises auth, scheduling, per-account
# isolation and static serving, then shuts down.
#
# Runs against whichever backend the environment selects, so the same script
# validates SQLite and Postgres:
#
#   npm run test:api                                   # sqlite
#   DATABASE_URL=postgres://... npm run test:api       # postgres
set -euo pipefail

BASE="http://127.0.0.1:${PORT:-3000}"
LOG=$(mktemp)

export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-3000}
export JWT_SECRET=${JWT_SECRET:-ci-only-secret-long-enough-to-pass-the-32-char-check}
export BCRYPT_ROUNDS=${BCRYPT_ROUNDS:-4}
export CRON_SECRET=${CRON_SECRET:-ci-cron-secret}

# Default to throwaway storage. Without this, running the suite locally would
# write test accounts into the real database and dial out on the real paired
# WhatsApp session.
SCRATCH=$(mktemp -d)
export DB_PATH=${DB_PATH:-$SCRATCH/smoke.db}
export WHATSAPP_AUTH_PATH=${WHATSAPP_AUTH_PATH:-$SCRATCH/whatsapp-auth}
echo "storage: ${DATABASE_URL:-$DB_PATH}"
echo "session: $WHATSAPP_AUTH_PATH"

node server/index.js >"$LOG" 2>&1 &
SERVER_PID=$!
cleanup() {
  kill $SERVER_PID 2>/dev/null || true
  # Give SQLite a moment to release the file before removing the scratch dir.
  sleep 1
  rm -rf "$SCRATCH" 2>/dev/null || true
}
trap cleanup EXIT

pass=0
fail=0

check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    echo "  PASS  $1"
    pass=$((pass + 1))
  else
    echo "  FAIL  $1 -- expected $2, got $3"
    fail=$((fail + 1))
  fi
}

code() { # code <method> <path> [json] [token]
  local args=(-s -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2")
  [ -n "${3:-}" ] && args+=(-H 'Content-Type: application/json' -d "$3")
  [ -n "${4:-}" ] && args+=(-H "Authorization: Bearer $4")
  curl "${args[@]}"
}

body() { # body <method> <path> [json] [token]
  local args=(-s -X "$1" "$BASE$2")
  [ -n "${3:-}" ] && args+=(-H 'Content-Type: application/json' -d "$3")
  [ -n "${4:-}" ] && args+=(-H "Authorization: Bearer $4")
  curl "${args[@]}"
}

echo "--- waiting for the server ---"
for _ in $(seq 1 45); do
  if curl -fsS "$BASE/api/health" >/dev/null 2>&1; then break; fi
  if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "server exited during startup:"; cat "$LOG"; exit 1
  fi
  sleep 1
done
curl -fsS "$BASE/api/health" >/dev/null || { cat "$LOG"; exit 1; }

echo "== health =="
check "health returns 200" 200 "$(code GET /api/health)"
echo "  backend: $(body GET /api/health)"

echo "== registration =="
EMAIL="ci$RANDOM@example.com"
CREDS="{\"name\":\"CI User\",\"email\":\"$EMAIL\",\"password\":\"correct-horse-battery\"}"
check "register returns 201" 201 "$(code POST /api/auth/register "$CREDS")"
REGISTERED=$(body POST /api/auth/register \
  "{\"name\":\"Token Holder\",\"email\":\"tok$RANDOM@example.com\",\"password\":\"correct-horse-battery\"}")
TOKEN=$(printf '%s' "$REGISTERED" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data?.token || ""')
if [ -z "$TOKEN" ]; then
  echo "  FAIL  could not obtain a token. Response was: $REGISTERED"
  cat "$LOG"
  exit 1
fi
check "register returned a token" "yes" "yes"
check "duplicate email rejected" 409 "$(code POST /api/auth/register "$CREDS")"
check "weak password rejected" 400 \
  "$(code POST /api/auth/register "{\"name\":\"X\",\"email\":\"w$RANDOM@example.com\",\"password\":\"short\"}")"

echo "== auth guards =="
check "stats without token is 401" 401 "$(code GET /api/messages/stats)"
check "pairing QR without token is 401" 401 "$(code GET /api/whatsapp/qr)"
check "garbage token is 401" 401 "$(code GET /api/messages/stats "" "garbage")"
check "stats with token is 200" 200 "$(code GET /api/messages/stats "" "$TOKEN")"
check "/auth/me with token is 200" 200 "$(code GET /api/auth/me "" "$TOKEN")"

echo "== login =="
check "login succeeds" 200 "$(code POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"correct-horse-battery\"}")"
check "wrong password is 401" 401 "$(code POST /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"nope-wrong-pass\"}")"
check "unknown email is 401" 401 "$(code POST /api/auth/login '{"email":"nobody@example.com","password":"whatever12345"}')"

echo "== scheduling =="
FUTURE=$(node -pe 'new Date(Date.now()+3600000).toISOString()')
PAST=$(node -pe 'new Date(Date.now()-3600000).toISOString()')
MSG="{\"phone\":\"9999999999\",\"message\":\"ci test\",\"scheduleTime\":\"$FUTURE\",\"repeatType\":\"None\"}"
CREATED=$(body POST /api/messages/schedule "$MSG" "$TOKEN")
check "schedule returns the row" "919999999999" \
  "$(printf '%s' "$CREATED" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.Phone')"
check "row has an id" "number" \
  "$(printf '%s' "$CREATED" | node -pe 'typeof JSON.parse(require("fs").readFileSync(0,"utf8")).data.Id')"
check "row is owned by the account" "number" \
  "$(printf '%s' "$CREATED" | node -pe 'typeof JSON.parse(require("fs").readFileSync(0,"utf8")).data.UserId')"
check "past schedule time rejected" 400 \
  "$(code POST /api/messages/schedule "{\"phone\":\"9999999999\",\"message\":\"no\",\"scheduleTime\":\"$PAST\",\"repeatType\":\"None\"}" "$TOKEN")"
check "list has one message" 1 \
  "$(body GET /api/messages/scheduled "" "$TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.length')"
check "stats total is 1" 1 \
  "$(body GET /api/messages/stats "" "$TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.total')"

echo "== update and delete =="
ID=$(printf '%s' "$CREATED" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.Id')
check "update returns 200" 200 \
  "$(code PUT "/api/messages/$ID" "{\"phone\":\"9888888888\",\"message\":\"edited\",\"scheduleTime\":\"$FUTURE\",\"repeatType\":\"Daily\"}" "$TOKEN")"
check "delete returns 200" 200 "$(code DELETE "/api/messages/$ID" "" "$TOKEN")"
check "deleting again is 404" 404 "$(code DELETE "/api/messages/$ID" "" "$TOKEN")"

echo "== per-account isolation =="
TOKEN2=$(body POST /api/auth/register "{\"name\":\"Other\",\"email\":\"o$RANDOM@example.com\",\"password\":\"another-good-password\"}" \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.token')
body POST /api/messages/schedule "$MSG" "$TOKEN" >/dev/null
check "second account sees no messages" 0 \
  "$(body GET /api/messages/scheduled "" "$TOKEN2" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.length')"
check "second account stats are zero" 0 \
  "$(body GET /api/messages/stats "" "$TOKEN2" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.total')"

echo "== cron trigger =="
check "cron without a secret is 401" 401 "$(code POST /api/cron/run)"
check "cron with a wrong secret is 401" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/cron/run" -H 'Authorization: Bearer wrong')"
check "cron with the right secret runs" 200 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/cron/run" -H "Authorization: Bearer $CRON_SECRET")"

echo "== keepalive =="
KEEP1=$(body GET /api/keepalive)
check "keepalive returns 200" 200 "$(code GET /api/keepalive)"
check "reports alive" "true" \
  "$(printf '%s' "$KEEP1" | node -pe 'String(JSON.parse(require("fs").readFileSync(0,"utf8")).data.alive)')"
check "records a heartbeat timestamp" "string" \
  "$(printf '%s' "$KEEP1" | node -pe 'typeof JSON.parse(require("fs").readFileSync(0,"utf8")).data.lastHeartbeat')"
# The first call above already wrote, so an immediate second call must be
# throttled - otherwise a public endpoint could be used to hammer the database.
check "second call is write-throttled" "false" \
  "$(body GET /api/keepalive | node -pe 'String(JSON.parse(require("fs").readFileSync(0,"utf8")).data.wroteHeartbeat)')"
check "state endpoint returns 200" 200 "$(code GET /api/keepalive/state)"
check "state includes the heartbeat key" "string" \
  "$(body GET /api/keepalive/state | node -pe 'typeof JSON.parse(require("fs").readFileSync(0,"utf8")).data.heartbeat')"

echo "== static client =="
if [ -f client/dist/index.html ]; then
  check "SPA shell served" 200 "$(code GET /)"
  check "manifest served" 200 "$(code GET /manifest.webmanifest)"
  check "service worker served" 200 "$(code GET /sw.js)"
  check "unknown page falls back to the SPA" 200 "$(code GET /some/spa/route)"
else
  echo "  SKIP  client/dist not built"
fi

echo "== api 404 =="
check "unknown api route is 404" 404 "$(code GET /api/does-not-exist)"

echo ""
echo "----------------------------------------"
echo "  PASSED: $pass    FAILED: $fail"
echo "----------------------------------------"

if [ "$fail" -gt 0 ]; then
  echo ""
  echo "--- server log ---"
  cat "$LOG"
  exit 1
fi
