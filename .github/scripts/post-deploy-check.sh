#!/usr/bin/env bash
# Post-deploy header and CSP check, run by deploy-worker.yml against the deployed URL (web-and-area-pages task 5, R9, W4).
# Usage: URL=https://... .github/scripts/post-deploy-check.sh
# A page passes when every <script> and <style> element is either
#   - inline and carries nonce="<the nonce in the CSP header>", or
#   - a same-origin script (src starting with a single "/"), covered by 'self'.
# Stylesheets are <link rel=stylesheet href="/...">, same-origin only.
set -euo pipefail
: "${URL:?URL is required}"
UA='outage-deploy-check/1.0 (github actions)'
TMP="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
fail() { echo "::error title=Post-deploy check failed::$1"; exit 1; }

# /judge and /app are 301s to /app/simulate (ADR 0029, ADR 0049): they are checked as redirects below, and the page itself here.
for path in / /app/simulate /install /privacy; do
  h=$(curl -sS -D - -o "$TMP/body" -A "$UA" "$URL$path" | tr -d '\r')
  echo "$h" | grep -qi '^cache-control: public, max-age=[0-9]*, s-maxage=[0-9]*' || fail "$path has no public cache-control"
  csp_nonce=$(echo "$h" | grep -i '^content-security-policy:' | grep -o "script-src 'nonce-[^']*'" | sed "s/script-src 'nonce-//;s/'$//" || true)
  [ -n "$csp_nonce" ] || fail "$path CSP has no script nonce"
  if grep -q '__OUTAGE_NONCE__' "$TMP/body"; then fail "nonce placeholder leaked on $path"; fi
  # Opening tags of script and style elements, one per line.
  tags=$(tr '\n' ' ' < "$TMP/body" | grep -oiE '<(script|style)[^>]*>' || true)
  while IFS= read -r tag; do
    [ -n "$tag" ] || continue
    if echo "$tag" | grep -qiE '(^|[[:space:]])src="'; then
      echo "$tag" | grep -qiE 'src="/[^/"]' || fail "$path has a script that is not same-origin: $tag"
    else
      echo "$tag" | grep -qF "nonce=\"$csp_nonce\"" || fail "$path has an inline element without the CSP nonce: $tag"
    fi
  done <<< "$tags"
  links=$(tr '\n' ' ' < "$TMP/body" | grep -oiE '<link[^>]*rel="?stylesheet[^>]*>' || true)
  while IFS= read -r link; do
    [ -n "$link" ] || continue
    echo "$link" | grep -qiE 'href="/[^/"]' || fail "$path has a stylesheet that is not same-origin: $link"
  done <<< "$links"
  echo "$h" | grep -qi '^x-content-type-options: nosniff' || fail "$path lacks nosniff"
  echo "Post-deploy check ok: $path"
done

for path in /app /judge; do
  r=$(curl -sS -o /dev/null -A "$UA" -w '%{http_code} %{redirect_url}' "$URL$path")
  [ "$r" = "301 $URL/app/simulate" ] || fail "$path should be a 301 to /app/simulate, got: $r"
  echo "Post-deploy check ok: $path redirects to /app/simulate"
done

# Scripts keep fixed names, so they must be revalidated on every load or a phone could run an old app.js (no hashed URLs).
for path in /js/map.js /js/app.js; do
  h=$(curl -sS -D - -o /dev/null -A "$UA" "$URL$path" | tr -d '\r')
  echo "$h" | grep -qi '^cache-control: .*no-cache' || fail "$path is not served with Cache-Control: no-cache"
  echo "Post-deploy check ok: $path revalidates"
done

nonce_of() { curl -sS -A "$UA" -D - -o /dev/null "$URL/" | grep -i '^content-security' | grep -o "nonce-[^']*" | head -1; }
a=$(nonce_of)
b=$(nonce_of)
[ -n "$a" ] && [ "$a" != "$b" ] || fail "nonce repeated across requests"
echo "Nonce changes per response."
