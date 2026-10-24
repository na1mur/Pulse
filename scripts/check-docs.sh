#!/usr/bin/env bash
# Consistency checks for the planning docs. Exits non-zero on any problem.
#   - docs/REBUILD_SPEC.md: every referenced ID is defined, no ID is defined twice
#   - docs/product/PRD.md: every user story the spec cites exists, and the spec cites every story
#   - docs/AGENTIC_SETUP.md: every referenced item ID exists, every cited commit exists
set -euo pipefail
cd "$(dirname "$0")/.."

spec=docs/REBUILD_SPEC.md
prd=docs/product/PRD.md
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

# User stories are defined in the PRD as "**US-x.y " paragraphs. Every story the spec cites must
# exist, and every story must be cited by the spec (directly or inside a range like US-4.3..US-4.7).
grep -oE '^\*\*US-[0-9]+\.[0-9]+ ' "$prd" | sed 's/^\*\*//; s/ $//' > "$tmp/us-def-all"
sort -u "$tmp/us-def-all" > "$tmp/us-def"
dupes=$(sort "$tmp/us-def-all" | uniq -d)
if [ -n "$dupes" ]; then echo "prd: user story defined more than once:"; echo "$dupes"; fail=1; fi
{
  grep -oE '\bUS-[0-9]+\.[0-9]+\b' "$spec" || true
  { grep -oE '\bUS-[0-9]+\.[0-9]+\.\.US-[0-9]+\.[0-9]+\b' "$spec" || true; } | while IFS= read -r range; do
    if [[ ! $range =~ ^US-([0-9]+)\.([0-9]+)\.\.US-([0-9]+)\.([0-9]+)$ ]] ||
      [ "${BASH_REMATCH[1]}" != "${BASH_REMATCH[3]}" ] || [ "${BASH_REMATCH[2]}" -gt "${BASH_REMATCH[4]}" ]; then
      echo "BAD-RANGE:$range"
      continue
    fi
    for n in $(seq "${BASH_REMATCH[2]}" "${BASH_REMATCH[4]}"); do echo "US-${BASH_REMATCH[1]}.$n"; done
  done
} | sort -u > "$tmp/us-ref-all"
bad=$(grep '^BAD-RANGE:' "$tmp/us-ref-all" | sed 's/^BAD-RANGE://' || true)
if [ -n "$bad" ]; then echo "spec: user-story ranges must stay in one epic and go upwards:"; echo "$bad"; fail=1; fi
grep -v '^BAD-RANGE:' "$tmp/us-ref-all" > "$tmp/us-ref" || true
undefined=$(comm -13 "$tmp/us-def" "$tmp/us-ref")
if [ -n "$undefined" ]; then echo "spec: cites user stories missing from the PRD:"; echo "$undefined"; fail=1; fi
uncited=$(comm -23 "$tmp/us-def" "$tmp/us-ref")
if [ -n "$uncited" ]; then echo "spec: user stories the spec never cites:"; echo "$uncited"; fail=1; fi

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
