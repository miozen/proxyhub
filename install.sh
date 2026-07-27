#!/bin/sh
set -eu

REPOSITORY=miozen/proxyhub
CHANNEL=stable
RELEASE_VERSION=
REF=
PROXYHUB_IMAGE=
SUBSTORE_VERSION=
PORT=3000
SUBSTORE_VERSION_EXPLICIT=false
PORT_EXPLICIT=false
ASSUME_YES=false
REPLACE=false
INTERACTIVE=false
DOCKER_MISSING=false
HOST_TOOLS_MISSING=false

DEPLOY_DIR=/opt/proxyhub
CONFIG_DIR=/etc/proxyhub
ENV_FILE=$CONFIG_DIR/proxyhub.env
DATA_DIR=/var/lib/proxyhub
LOG_DIR=/var/log/proxyhub
CLI_PATH=/usr/local/bin/proxyhub
INSTALLATION_STATE=$DATA_DIR/state/installation

die() {
  echo "proxyhub installer: $*" >&2
  exit 1
}

if [ -t 0 ] && [ -t 1 ]; then
  INTERACTIVE=true
fi

marker() {
  level=$1
  shift
  printf '[%s] %s\n' "$level" "$*"
}

read_answer() {
  prompt=$1
  printf '%s' "$prompt"
  IFS= read -r REPLY || return 1
}

validate_port() {
  candidate=$1
  case "$candidate" in ''|*[!0-9]*) return 1 ;; esac
  [ "$candidate" -ge 1 ] && [ "$candidate" -le 65535 ]
}

ask_port() {
  [ "$PORT_EXPLICIT" = false ] || return 0
  [ "$INTERACTIVE" = true ] || return 0
  while :; do
    read_answer "ProxyHub host port [3000]: " || die "installation cancelled"
    candidate=${REPLY:-3000}
    if validate_port "$candidate"; then
      PORT=$candidate
      return
    fi
    marker WARN "enter a port between 1 and 65535"
  done
}

valid_version() {
  [ -n "$1" ] &&
    printf '%s\n' "$1" |
      LC_ALL=C grep -Eq '^[A-Za-z0-9._-]+$'
}

usage() {
  cat <<'EOF'
Usage: install.sh [options]

  --channel stable|dev
  --version <release-version>
  --ref <commit-sha>
  --image <ProxyHub-image>
  --substore-version <version>
  --port <1-65535>
  --replace
  --yes
  -h, --help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --channel) CHANNEL=${2:-}; shift 2 ;;
    --version) RELEASE_VERSION=${2:-}; shift 2 ;;
    --ref) REF=${2:-}; shift 2 ;;
    --image) PROXYHUB_IMAGE=${2:-}; shift 2 ;;
    --substore-version) SUBSTORE_VERSION=${2:-}; SUBSTORE_VERSION_EXPLICIT=true; shift 2 ;;
    --port) PORT=${2:-}; PORT_EXPLICIT=true; shift 2 ;;
    --replace) REPLACE=true; shift ;;
    --yes) ASSUME_YES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "run this installer as root"
case "$CHANNEL" in stable|dev) ;; *) die "channel must be stable or dev" ;; esac
case "$PORT" in ''|*[!0-9]*) die "port must be an integer" ;; esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "port must be between 1 and 65535"
if [ "$SUBSTORE_VERSION_EXPLICIT" = true ]; then
  valid_version "$SUBSTORE_VERSION" || die "invalid Sub-Store version"
fi

[ -r /etc/os-release ] || die "unsupported host: missing /etc/os-release"
. /etc/os-release
case "${ID:-}" in
  alpine) HOST_OS=alpine ;;
  debian) HOST_OS=debian ;;
  ubuntu) HOST_OS=ubuntu ;;
  *) die "supported systems: Alpine, Debian and Ubuntu" ;;
esac

case "$(uname -m)" in
  x86_64|amd64) HOST_ARCH=amd64 ;;
  aarch64|arm64) HOST_ARCH=arm64 ;;
  *) die "supported architectures: amd64 and arm64" ;;
esac

tmp_dir=$(mktemp -d)
INSTALL_COMPLETE=false
CLEAN_INSTALL=false
cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ] && [ "$CLEAN_INSTALL" = true ] &&
    [ "$INSTALL_COMPLETE" = false ]; then
    if command -v docker >/dev/null 2>&1 &&
      [ -f "$DEPLOY_DIR/compose.yaml" ] && [ -f "$ENV_FILE" ]; then
      docker compose \
        --project-directory "$DEPLOY_DIR" \
        --env-file "$ENV_FILE" \
        -f "$DEPLOY_DIR/compose.yaml" \
        down --volumes --remove-orphans >/dev/null 2>&1 || true
    fi
    if [ -L "$CLI_PATH" ] &&
      [ "$(readlink "$CLI_PATH")" = "$DEPLOY_DIR/proxyhub" ]; then
      rm -f "$CLI_PATH"
    fi
    rm -f \
      "$DEPLOY_DIR/compose.yaml" \
      "$DEPLOY_DIR/.env.example" \
      "$DEPLOY_DIR/proxyhub" \
      "$DEPLOY_DIR/VERSION" \
      "$DEPLOY_DIR/compatibility.json" \
      "$ENV_FILE"
    rmdir "$DATA_DIR/backups" "$DATA_DIR/state" "$DATA_DIR" \
      "$LOG_DIR" "$CONFIG_DIR" "$DEPLOY_DIR" 2>/dev/null || true
    echo "Clean installation failed; newly created ProxyHub files were removed." >&2
  fi
  rm -rf "$tmp_dir"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

download() {
  url=$1 output=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --connect-timeout 15 "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$output" "$url"
  else
    die "curl or wget is required"
  fi
}

confirm() {
  [ "$ASSUME_YES" = true ] && return 0
  [ "$INTERACTIVE" = true ] ||
    die "confirmation required in non-interactive mode; rerun with --yes"
  read_answer "$1 [y/N] " || return 1
  case "$REPLY" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

confirm_clean_install() {
  [ "$ASSUME_YES" = true ] && return 0
  [ "$INTERACTIVE" = true ] ||
    die "clean installation confirmation required; rerun with --yes"
  read_answer "Continue with this clean installation? [Y/n] " || return 1
  case "$REPLY" in ''|y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

latest_release() {
  metadata=$tmp_dir/latest.json
  download "https://api.github.com/repos/$REPOSITORY/releases/latest" "$metadata"
  sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' "$metadata" | head -1
}

validate_archive() {
  archive=$1
  tar -tzf "$archive" | sort >"$tmp_dir/contents"
  printf '%s\n' .env.example VERSION compatibility.json compose.yaml proxyhub |
    sort >"$tmp_dir/expected"
  diff -u "$tmp_dir/expected" "$tmp_dir/contents" >/dev/null ||
    die "deployment archive contains unexpected files"
}

validate_compatibility_manifest() {
  manifest=$1 expected_version=$2
  schema=$(sed -n \
    's/.*"schema":[[:space:]]*\([0-9][0-9]*\).*/\1/p' \
    "$manifest" | head -1)
  manifest_version=$(sed -n \
    's/.*"proxyhub_version":[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$manifest" | head -1)
  [ "$schema" = 1 ] || die "unsupported deployment manifest schema"
  [ "$manifest_version" = "$expected_version" ] ||
    die "deployment manifest version mismatch"
}

prepare_stable_assets() {
  if [ -n "$RELEASE_VERSION" ]; then
    case "$RELEASE_VERSION" in
      v*) RELEASE_TAG=$RELEASE_VERSION ;;
      *) RELEASE_TAG=v$RELEASE_VERSION ;;
    esac
  else
    RELEASE_TAG=$(latest_release)
  fi
  [ -n "$RELEASE_TAG" ] || die "could not discover the latest release"
  valid_version "$RELEASE_TAG" || die "invalid release version"
  RELEASE_VERSION=${RELEASE_TAG#v}

  archive_name=proxyhub-deploy-$RELEASE_VERSION.tar.gz
  release_base=https://github.com/$REPOSITORY/releases/download/$RELEASE_TAG
  download "$release_base/$archive_name" "$tmp_dir/$archive_name"
  download "$release_base/SHA256SUMS" "$tmp_dir/SHA256SUMS"
  grep "[[:space:]]$archive_name\$" "$tmp_dir/SHA256SUMS" >"$tmp_dir/archive.sha256" ||
    die "archive checksum is missing"
  (
    cd "$tmp_dir"
    sha256sum -c archive.sha256
  )
  validate_archive "$tmp_dir/$archive_name"
  mkdir "$tmp_dir/deployment"
  tar -xzf "$tmp_dir/$archive_name" -C "$tmp_dir/deployment"
  validate_compatibility_manifest \
    "$tmp_dir/deployment/compatibility.json" "$RELEASE_VERSION"
  [ -n "$PROXYHUB_IMAGE" ] ||
    PROXYHUB_IMAGE=ghcr.io/miozen/proxyhub:$RELEASE_TAG
}

prepare_dev_assets() {
  [ -n "$REF" ] || die "--ref is required for the dev channel"
  case "$REF" in
    *[!0-9a-fA-F]*|'') die "--ref must be a commit SHA" ;;
  esac
  [ "${#REF}" -ge 7 ] && [ "${#REF}" -le 40 ] ||
    die "--ref must contain 7 to 40 hexadecimal characters"
  [ -n "$PROXYHUB_IMAGE" ] || die "--image is required for the dev channel"
  case "$PROXYHUB_IMAGE" in
    ghcr.io/miozen/proxyhub:dev-*) ;;
    *) die "dev image must be ghcr.io/miozen/proxyhub:dev-<sha>" ;;
  esac

  source_archive=$tmp_dir/source.tar.gz
  source_dir=$tmp_dir/source
  mkdir "$source_dir"
  download "https://github.com/$REPOSITORY/archive/$REF.tar.gz" "$source_archive"
  tar -xzf "$source_archive" -C "$source_dir"
  source_root=$(find "$source_dir" -mindepth 1 -maxdepth 1 -type d | head -1)
  [ -n "$source_root" ] || die "invalid GitHub source archive"
  mkdir "$tmp_dir/deployment"
  install -m 0644 "$source_root/deploy/compose.yaml" "$tmp_dir/deployment/compose.yaml"
  install -m 0600 "$source_root/.env.example" "$tmp_dir/deployment/.env.example"
  install -m 0755 "$source_root/ops/proxyhub" "$tmp_dir/deployment/proxyhub"
  printf '%s\n' "dev-$REF" >"$tmp_dir/deployment/VERSION"
  cat >"$tmp_dir/deployment/compatibility.json" <<EOF
{
  "schema": 1,
  "proxyhub_version": "dev-$REF",
  "manager_min_version": "0.1.5",
  "compose_revision": 1,
  "environment_revision": 1,
  "substore_min_version": null,
  "substore_max_version_exclusive": null
}
EOF
  validate_compatibility_manifest \
    "$tmp_dir/deployment/compatibility.json" "dev-$REF"
}

detect_docker() {
  if command -v docker >/dev/null 2>&1 &&
    docker compose version >/dev/null 2>&1; then
    return
  fi
  DOCKER_MISSING=true
}

install_docker() {
  # An already-satisfied dependency is a successful no-op under set -e.
  [ "$DOCKER_MISSING" = true ] || return 0
  confirm "Docker with Compose is missing. Install it now?" ||
    die "Docker Compose v2 is required"
  case "$HOST_OS" in
    alpine)
      apk add docker docker-cli-compose openssl curl tar
      rc-update add docker default
      service docker start
      ;;
    debian|ubuntu)
      apt-get update
      if ! DEBIAN_FRONTEND=noninteractive apt-get install -y \
        docker.io docker-compose-v2; then
        if ! DEBIAN_FRONTEND=noninteractive apt-get install -y \
          docker.io docker-compose-plugin; then
          DEBIAN_FRONTEND=noninteractive apt-get install -y \
            docker.io docker-compose
        fi
      fi
      systemctl enable --now docker
      ;;
  esac
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 installation failed"
}

detect_host_tools() {
  missing=false
  for command_name in awk diff find install openssl sha256sum tar; do
    command -v "$command_name" >/dev/null 2>&1 || missing=true
  done
  if ! command -v curl >/dev/null 2>&1 &&
    ! command -v wget >/dev/null 2>&1; then
    missing=true
  fi
  [ "$missing" = false ] && return
  HOST_TOOLS_MISSING=true
}

install_host_tools() {
  [ "$HOST_TOOLS_MISSING" = true ] || return 0
  confirm "Required host utilities are missing. Install them now?" ||
    die "required host utilities are missing"
  case "$HOST_OS" in
    alpine)
      apk add ca-certificates coreutils curl diffutils findutils openssl tar
      ;;
    debian|ubuntu)
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y \
        ca-certificates coreutils curl diffutils findutils openssl tar
      ;;
  esac
}

port_is_listening() {
  if command -v ss >/dev/null 2>&1; then
    socket_table=$(ss -ltn)
  elif command -v netstat >/dev/null 2>&1; then
    socket_table=$(netstat -ltn)
  else
    return 1
  fi

  printf '%s\n' "$socket_table" | awk -v port="$PORT" '
    NR > 1 {
      count=split($4, parts, ":")
      if (parts[count] == port) found=1
    }
    END { exit(found ? 0 : 1) }
  '
}

resolve_available_port() {
  while port_is_listening; do
    if [ "$INTERACTIVE" != true ]; then
      die "port $PORT is already in use; rerun with --port <available-port> --yes"
    fi
    marker WARN "port $PORT is already in use"
    read_answer "Choose another host port: " || die "installation cancelled"
    if validate_port "$REPLY"; then
      PORT=$REPLY
      PORT_EXPLICIT=true
    else
      marker WARN "enter a port between 1 and 65535"
    fi
  done
}

show_preflight() {
  marker OK "supported host: $HOST_OS/$HOST_ARCH"
  if [ "$HOST_TOOLS_MISSING" = true ]; then
    marker WARN "required host utilities must be installed"
  else
    marker OK "required host utilities are available"
  fi
  if [ "$DOCKER_MISSING" = true ]; then
    marker WARN "Docker with Compose must be installed"
  else
    marker OK "Docker with Compose is available"
  fi
}

show_install_summary() {
  echo
  echo "Resolved installation"
  echo "  Host: $HOST_OS/$HOST_ARCH"
  echo "  Public URL: http://127.0.0.1:$PORT/"
  echo "  ProxyHub release: ${RELEASE_TAG:-dev-$REF}"
  echo "  ProxyHub image: $PROXYHUB_IMAGE"
  echo "  Sub-Store selector: ${SUBSTORE_VERSION:-latest}"
  echo "  Sub-Store image: $SUBSTORE_IMAGE"
  echo "  Containers: proxyhub-proxyhub-1, proxyhub-sub-store-1"
  echo "  Network: proxyhub_internal"
  echo "  Volumes: proxyhub-data, proxyhub-substore-data"
  echo "  Configuration: $CONFIG_DIR"
  echo "  Data and state: $DATA_DIR"
  echo "  Backups: $DATA_DIR/backups"
  echo "  Logs: $LOG_DIR"
  if [ "$HOST_TOOLS_MISSING" = true ] || [ "$DOCKER_MISSING" = true ]; then
    echo "  Host packages: installation approved during preflight"
  else
    echo "  Host packages: no changes required"
  fi
  echo
}

write_installation_state() {
  state_dir=$(dirname "$INSTALLATION_STATE")
  mkdir -p "$state_dir"
  state_temp=$INSTALLATION_STATE.tmp.$$
  umask 077
  {
    echo "schema=1"
    echo "result=installed"
    echo "installed_at=$(date -u +%Y%m%dT%H%M%SZ)"
    echo "host_os=$HOST_OS"
    echo "host_arch=$HOST_ARCH"
    echo "port=$PORT"
    echo "proxyhub_image=$PROXYHUB_IMAGE"
    echo "substore_image=$SUBSTORE_IMAGE"
  } >"$state_temp"
  chmod 600 "$state_temp"
  mv "$state_temp" "$INSTALLATION_STATE"
}

set_env() {
  key=$1 value=$2 file=$3 temp=$3.tmp
  awk -v key="$key" -v value="$value" '
    BEGIN { found=0 }
    $0 ~ ("^" key "=") { print key "=" value; found=1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$file" >"$temp"
  mv "$temp" "$file"
}

resolve_substore_image() {
  if [ "$SUBSTORE_VERSION_EXPLICIT" = true ]; then
    candidate=xream/sub-store:$SUBSTORE_VERSION
  else
    candidate=xream/sub-store:latest
  fi
  docker pull "$candidate" >&2
  resolved=$(docker image inspect "$candidate" \
    --format '{{range .RepoDigests}}{{println .}}{{end}}' |
    sed -n '\|^xream/sub-store@sha256:|p' |
    head -1)
  [ -n "$resolved" ] ||
    die "could not resolve immutable Sub-Store digest"
  image_os=$(docker image inspect "$candidate" --format '{{.Os}}')
  image_arch=$(docker image inspect "$candidate" --format '{{.Architecture}}')
  [ "$image_os" = linux ] && [ "$image_arch" = "$HOST_ARCH" ] ||
    die "Sub-Store image does not support linux/$HOST_ARCH"
  printf '%s\n' "$resolved"
}

resolve_proxyhub_image() {
  candidate=$PROXYHUB_IMAGE
  docker pull "$candidate" >&2
  resolved=$(docker image inspect "$candidate" \
    --format '{{range .RepoDigests}}{{println .}}{{end}}' |
    sed -n '\|^ghcr.io/miozen/proxyhub@sha256:|p' |
    head -1)
  [ -n "$resolved" ] ||
    die "could not resolve immutable ProxyHub digest"
  image_os=$(docker image inspect "$candidate" --format '{{.Os}}')
  image_arch=$(docker image inspect "$candidate" --format '{{.Architecture}}')
  [ "$image_os" = linux ] && [ "$image_arch" = "$HOST_ARCH" ] ||
    die "ProxyHub image does not support linux/$HOST_ARCH"
  printf '%s\n' "$resolved"
}

managed_state_exists() {
  [ -e "$DEPLOY_DIR" ] || [ -e "$CONFIG_DIR" ] ||
    [ -e "$DATA_DIR" ] || [ -e "$LOG_DIR" ] ||
    [ -e "$CLI_PATH" ] || [ -L "$CLI_PATH" ] ||
    docker container inspect proxyhub-proxyhub-1 >/dev/null 2>&1 ||
    docker container inspect proxyhub-sub-store-1 >/dev/null 2>&1 ||
    docker network inspect proxyhub_internal >/dev/null 2>&1 ||
    docker volume inspect proxyhub-data >/dev/null 2>&1 ||
    docker volume inspect proxyhub-substore-data >/dev/null 2>&1
}

show_deletion_targets() {
  echo "Permanent replacement targets:"
  echo "  $DEPLOY_DIR"
  echo "  $CONFIG_DIR"
  echo "  $DATA_DIR"
  echo "  $LOG_DIR"
  echo "  $CLI_PATH"
  echo "  Containers: proxyhub-proxyhub-1, proxyhub-sub-store-1"
  echo "  Network: proxyhub_internal"
  echo "  Volumes: proxyhub-data, proxyhub-substore-data"
}

confirm_replacement() {
  show_deletion_targets
  if [ "${PROXYHUB_REPLACE_CONFIRM:-}" != "DELETE" ]; then
    [ -t 0 ] ||
      die "set PROXYHUB_REPLACE_CONFIRM=DELETE with --replace"
    printf 'Type DELETE to replace the existing installation: '
    read -r answer
    [ "$answer" = "DELETE" ] || die "replacement cancelled"
  fi
}

validate_managed_targets() {
  if [ -L "$CLI_PATH" ]; then
    [ "$(readlink "$CLI_PATH")" = "$DEPLOY_DIR/proxyhub" ] ||
      die "refusing replacement: unexpected CLI link at $CLI_PATH"
  elif [ -e "$CLI_PATH" ]; then
    die "refusing replacement: unexpected CLI target at $CLI_PATH"
  fi
}

remove_managed_state() {
  if [ -f "$DEPLOY_DIR/compose.yaml" ] && [ -f "$ENV_FILE" ]; then
    docker compose \
      --project-directory "$DEPLOY_DIR" \
      --env-file "$ENV_FILE" \
      -f "$DEPLOY_DIR/compose.yaml" \
      down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  docker rm -f proxyhub-proxyhub-1 proxyhub-sub-store-1 >/dev/null 2>&1 || true
  docker network rm proxyhub_internal >/dev/null 2>&1 || true
  docker volume rm proxyhub-data proxyhub-substore-data >/dev/null 2>&1 || true
  if [ -L "$CLI_PATH" ] &&
    [ "$(readlink "$CLI_PATH")" = "$DEPLOY_DIR/proxyhub" ]; then
    rm -f "$CLI_PATH"
  fi
  rm -rf "$DEPLOY_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"
}

detect_host_tools
detect_docker
show_preflight
ask_port
install_host_tools
install_docker

if [ "$CHANNEL" = stable ]; then
  prepare_stable_assets
else
  prepare_dev_assets
fi
marker OK "deployment assets resolved and verified"

command -v openssl >/dev/null 2>&1 || die "openssl is required"
docker info >/dev/null 2>&1 || die "Docker daemon is not running"
marker OK "Docker daemon is running"

existing_install=false
managed_state_exists && existing_install=true
if [ "$existing_install" = true ]; then
  marker WARN "existing managed state detected"
else
  marker OK "no existing managed state detected"
fi

case "$PORT" in ''|*[!0-9]*) die "configured port must be an integer" ;; esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] ||
  die "configured port must be between 1 and 65535"

available_kb=$(df -Pk / | awk 'NR == 2 { print $4 }')
[ "${available_kb:-0}" -ge 524288 ] || die "at least 512 MiB of free disk space is required"
marker OK "at least 512 MiB of disk space is available"

echo "Host: $HOST_OS/$HOST_ARCH"
echo "ProxyHub image: $PROXYHUB_IMAGE"

PROXYHUB_IMAGE=$(resolve_proxyhub_image)
marker OK "ProxyHub image resolved for linux/$HOST_ARCH"
SUBSTORE_IMAGE=$(resolve_substore_image)
marker OK "Sub-Store image resolved for linux/$HOST_ARCH"
echo "Sub-Store image: $SUBSTORE_IMAGE"

if [ "$existing_install" = true ]; then
  [ "$REPLACE" = true ] ||
    die "ProxyHub is already installed; use update or rerun with --replace"
  validate_managed_targets
elif [ "$REPLACE" = true ]; then
  die "--replace requires an existing ProxyHub installation"
fi

[ "$existing_install" = true ] || resolve_available_port
[ "$existing_install" = true ] ||
  marker OK "host port $PORT is available"
show_install_summary
if [ "$existing_install" = true ]; then
  confirm_replacement
  remove_managed_state
else
  confirm_clean_install || die "installation cancelled"
fi
CLEAN_INSTALL=true

mkdir -p "$DEPLOY_DIR" "$CONFIG_DIR" "$DATA_DIR/backups" "$DATA_DIR/state" "$LOG_DIR"
install -m 0644 "$tmp_dir/deployment/compose.yaml" "$DEPLOY_DIR/compose.yaml"
install -m 0600 "$tmp_dir/deployment/.env.example" "$DEPLOY_DIR/.env.example"
install -m 0755 "$tmp_dir/deployment/proxyhub" "$DEPLOY_DIR/proxyhub"
install -m 0644 "$tmp_dir/deployment/VERSION" "$DEPLOY_DIR/VERSION"
install -m 0644 "$tmp_dir/deployment/compatibility.json" \
  "$DEPLOY_DIR/compatibility.json"

install -m 0600 "$tmp_dir/deployment/.env.example" "$ENV_FILE"
set_env SESSION_SECRET "$(openssl rand -hex 32)" "$ENV_FILE"
set_env DATA_ENCRYPTION_KEY "$(openssl rand -hex 32)" "$ENV_FILE"
set_env PORT "$PORT" "$ENV_FILE"
set_env PROXYHUB_IMAGE "$PROXYHUB_IMAGE" "$ENV_FILE"
set_env SUBSTORE_IMAGE "$SUBSTORE_IMAGE" "$ENV_FILE"
chmod 600 "$ENV_FILE"
ln -sf "$DEPLOY_DIR/proxyhub" "$CLI_PATH"

"$CLI_PATH" install
write_installation_state
INSTALL_COMPLETE=true

echo "ProxyHub installation completed."
echo "URL: http://127.0.0.1:$PORT/"
echo "CLI: proxyhub status"
