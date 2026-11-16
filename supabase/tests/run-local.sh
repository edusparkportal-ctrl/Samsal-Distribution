#!/usr/bin/env bash
# Runs migrations, the RLS suite, then migrations + seed + seed tests on SCRATCH databases.
# Requires a local PostgreSQL where you can create databases and the stub file supabase/tests/stubs.sql.
#   DATABASE_URL=postgres://postgres@localhost:5432/postgres ./supabase/tests/run-local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?set DATABASE_URL to a SUPERUSER connection to a scratch server}"
P="psql $DATABASE_URL -v ON_ERROR_STOP=1 -q"
reset() { $P -f supabase/tests/stubs.sql >/dev/null 2>&1; for f in supabase/migrations/*.sql; do $P -f "$f"; done; }
echo "== migrations + RLS suite"; reset
RLS_OUT=$($P -f supabase/tests/rls.test.sql 2>&1) || { echo "$RLS_OUT" | grep -E "ERROR|FAIL|RLS TESTS" ; echo "RLS SUITE FAILED"; exit 1; }
echo "$RLS_OUT" | grep -E "^ *[0-9]+ *\| *[0-9]+ *$|passed|FAIL" || true
echo "== migrations + seed (twice) + seed tests"; reset; $P -f supabase/seed.sql; $P -f supabase/seed.sql; $P -f supabase/tests/seed.test.sql
echo "ALL DATABASE TESTS PASSED"
