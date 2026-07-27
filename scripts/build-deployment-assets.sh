#!/bin/sh
set -eu

version=${1:-}
output_dir=${2:-}

[ -n "$version" ] || {
  echo "usage: build-deployment-assets.sh <version> <output-directory>" >&2
  exit 1
}
[ -n "$output_dir" ] || {
  echo "usage: build-deployment-assets.sh <version> <output-directory>" >&2
  exit 1
}

case "$version" in
  *[!A-Za-z0-9._-]*|'')
    echo "invalid deployment version: $version" >&2
    exit 1
    ;;
esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(CDPATH= cd -- "$script_dir/.." && pwd)
archive_name="proxyhub-deploy-$version.tar.gz"
stage=$(mktemp -d)

cleanup() {
  rm -rf "$stage"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$output_dir"
install -m 0644 "$root/deploy/compose.yaml" "$stage/compose.yaml"
install -m 0600 "$root/.env.example" "$stage/.env.example"
install -m 0755 "$root/ops/proxyhub" "$stage/proxyhub"
printf '%s\n' "$version" >"$stage/VERSION"
cat >"$stage/compatibility.json" <<EOF
{
  "schema": 1,
  "proxyhub_version": "$version",
  "manager_min_version": "0.1.5",
  "compose_revision": 1,
  "environment_revision": 1,
  "substore_min_version": null,
  "substore_max_version_exclusive": null
}
EOF
install -m 0755 "$root/install.sh" "$output_dir/install.sh"

TZ=UTC tar \
  --sort=name \
  --mtime='UTC 1970-01-01' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  -C "$stage" \
  -czf "$output_dir/$archive_name" \
  .env.example VERSION compatibility.json compose.yaml proxyhub

(
  cd "$output_dir"
  sha256sum "$archive_name" install.sh >SHA256SUMS
)

printf '%s\n' "$output_dir/$archive_name"
