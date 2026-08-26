#!/bin/bash
# One-time setup for a new machine.
# Installs required packages and loads kernel modules.
set -euo pipefail

echo "=== wifid AP Portal — machine setup ==="

# --- Packages ---
echo "[1/3] installing packages..."
if command -v pacman &>/dev/null; then
  sudo pacman -S --noconfirm ipset hostapd dnsmasq iptables iw rfkill
elif command -v apt &>/dev/null; then
  sudo apt update
  sudo apt install -y ipset hostapd dnsmasq iptables iproute2 iw rfkill
elif command -v dnf &>/dev/null; then
  sudo dnf install -y ipset hostapd dnsmasq iptables-services iw rfkill
fi
echo "  packages installed."

# --- Kernel modules ---
echo "[2/3] loading kernel modules..."
sudo modprobe ip_set 2>/dev/null || true
sudo modprobe ip_set_hash_ip 2>/dev/null || true
sudo modprobe nf_conntrack 2>/dev/null || true
echo "  kernel modules loaded."

# --- Sysctl ---
echo "[3/3] enabling forwarding..."
sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null
echo "  forwarding enabled."

echo ""
echo "=== Setup complete! ==="
echo "Now you can run: sudo bun run src/ap.ts"
