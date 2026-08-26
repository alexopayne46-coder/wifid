#!/bin/bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

HOSTAPD_SRC="/etc/hostapd/hostapd.conf"
DNSMASQ_SRC="/etc/dnsmasq-ap.conf"

if [ -f "$HOSTAPD_SRC" ]; then
  cp "$HOSTAPD_SRC" templates/hostapd.conf
  echo "Copied $HOSTAPD_SRC -> templates/hostapd.conf"
else
  echo "Warning: $HOSTAPD_SRC not found — keeping existing template"
fi

if [ -f "$DNSMASQ_SRC" ]; then
  cp "$DNSMASQ_SRC" templates/dnsmasq-ap.conf
  echo "Copied $DNSMASQ_SRC -> templates/dnsmasq-ap.conf"
else
  echo "Warning: $DNSMASQ_SRC not found — keeping existing template"
fi

git add templates/hostapd.conf templates/dnsmasq-ap.conf
