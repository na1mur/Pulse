#!/usr/bin/env bash
# Consistency checks for the planning docs. Exits non-zero on any problem.
#   - docs/REBUILD_SPEC.md: every referenced ID is defined, no ID is defined twice
#   - docs/AGENTIC_SETUP.md: every referenced item ID exists, every cited commit exists
set -euo pipefail
cd "$(dirname "$0")/.."

spec=docs/REBUILD_SPEC.md
setup=docs/AGENTIC_SETUP.md
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

id_re='R-[0-9]+|D-[0-9]+|T[0-9]+\.[0-9]+|WS[0-9]+|(AUTH|TIM|LOG|TAG|GOAL|INS|SYNC|NOTIF|DESK|MOB|SET|OPS|X|ACT|CRED)-[0-9]+'

# A spec ID is defined when it is the first cell of a table row.
grep -oE "^\| ($id_re) " "$spec" | sed 's/^| //; s/ $//' > "$tmp/spec-def-all"
sort -u "$tmp/spec-def-all" > "$tmp/spec-def"
grep -oE "\b($id_re)\b" "$spec" | sort -u > "$tmp/spec-ref"

undefined=$(comm -13 "$tmp/spec-def" "$tmp/spec-ref")
if [ -n "$undefined" ]; then echo "spec: referenced but not defined:"; echo "$undefined"; fail=1; fi

dupes=$(sort "$tmp/spec-def-all" | uniq -d)
if [ -n "$dupes" ]; then echo "spec: defined more than once:"; echo "$dupes"; fail=1; fi

# A setup item is defined as **A<n>.<m> at the start of a checklist entry.
grep -oE '\*\*A[0-9]+\.[0-9]+' "$setup" | tr -d '*' | sort -u > "$tmp/setup-def"
grep -oE '\bA[0-9]+\.[0-9]+\b' "$setup" | sort -u > "$tmp/setup-ref"
undefined=$(comm -13 "$tmp/setup-def" "$tmp/setup-ref")
if [ -n "$undefined" ]; then echo "setup: referenced but not defined:"; echo "$undefined"; fail=1; fi

for hash in $(grep -oE '`[0-9a-f]{7,40}`' "$setup" | tr -d '`' | sort -u); do
  if ! git cat-file -e "$hash^{commit}" 2>/dev/null; then echo "setup: unknown commit $hash"; fail=1; fi
done

[ "$fail" -eq 0 ] && echo "docs OK"
exit "$fail"
