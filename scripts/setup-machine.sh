#!/bin/bash
# One-time setup for a new machine.
# Installs required packages and loads kernel modules.
set -euo pipefail

# Colors matching the pino logger format (config.ts)
TIME_COLOR=$'\x1b[90m'
INFO_COLOR=$'\x1b[32m'
WARN_COLOR=$'\x1b[33m'
ERROR_COLOR=$'\x1b[31m'
SERVICE_COLOR=$'\x1b[36m'
RESET=$'\x1b[0m'

log_info() {
  local svc="$1"; shift
  local msg="$*"
  local ts
  ts=$(date +"%H:%M:%S.%6N")
  printf "${TIME_COLOR}${ts}${RESET} ${INFO_COLOR}<Information>${RESET} ${SERVICE_COLOR}${svc}${RESET}: ${msg}\n"
}

log_warn() {
  local svc="$1"; shift
  local msg="$*"
  local ts
  ts=$(date +"%H:%M:%S.%6N")
  printf "${TIME_COLOR}${ts}${RESET} ${WARN_COLOR}<Warn>${RESET} ${SERVICE_COLOR}${svc}${RESET}: ${msg}\n"
}

log_error() {
  local svc="$1"; shift
  local msg="$*"
  local ts
  ts=$(date +"%H:%M:%S.%6N")
  printf "${TIME_COLOR}${ts}${RESET} ${ERROR_COLOR}<Error>${RESET} ${SERVICE_COLOR}${svc}${RESET}: ${msg}\n"
}

log_info "setup" "wifid AP Portal — machine setup"

# --- Packages ---
log_info "setup" "[1/5] installing packages..."
if command -v pacman &>/dev/null; then
  sudo pacman -S --noconfirm ipset hostapd dnsmasq iptables iw rfkill
elif command -v apt &>/dev/null; then
  sudo apt update
  sudo apt install -y ipset hostapd dnsmasq iptables iproute2 iw rfkill
elif command -v dnf &>/dev/null; then
  sudo dnf install -y ipset hostapd dnsmasq iptables-services iw rfkill
fi
log_info "setup" "packages installed"

# --- Kernel modules ---
log_info "setup" "[2/5] loading kernel modules..."
sudo modprobe ip_set 2>/dev/null || true
sudo modprobe ip_set_hash_ip 2>/dev/null || true
sudo modprobe nf_conntrack 2>/dev/null || true
log_info "setup" "kernel modules loaded"

# --- Sysctl ---
log_info "setup" "[3/5] setting up hostapd control interface dir..."
sudo mkdir -p /var/run/hostapd
sudo chown root:root /var/run/hostapd
sudo chmod 755 /var/run/hostapd
log_info "setup" "hostapd control dir ready"

log_info "setup" "[4/5] installing hostapd notify script..."
sudo cp scripts/hostapd-notify.sh /usr/local/bin/hostapd-notify.sh
sudo chmod +x /usr/local/bin/hostapd-notify.sh
log_info "setup" "notify script installed"

log_info "setup" "[5/5] enabling forwarding..."
sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null
log_info "setup" "forwarding enabled"

log_info "setup" "setup complete!"
log_info "setup" "now run: sudo bun run src/ap.ts"
