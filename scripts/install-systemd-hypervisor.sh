#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BUN_BIN="$(command -v bun || echo /usr/bin/bun)"
SUDO_BIN="$(command -v sudo || echo /usr/bin/sudo)"

echo "[*] Project dir: $PROJECT_DIR"
echo "[*] Bun binary: $BUN_BIN"
echo "[*] Sudo binary: $SUDO_BIN"

if [ ! -x "$BUN_BIN" ]; then
  echo "[!] bun not found at $BUN_BIN"
  exit 1
fi

SERVICE_NAME="ap-hypervisor"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "[*] Creating systemd service: $SERVICE_FILE"

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=AP Hypervisor (bun run src/hypervisor.ts)
After=network.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
ExecStart=${BUN_BIN} run ${PROJECT_DIR}/src/hypervisor.ts
Restart=always
RestartSec=3
Environment=AP_MONITOR_IFACE_FAIL_AND_RESTART=true
KillMode=process
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
EOF

echo "[*] Reloading systemd..."
sudo systemctl daemon-reload

echo "[*] Enabling ${SERVICE_NAME}..."
sudo systemctl enable "${SERVICE_NAME}.service"

echo "[*] Starting ${SERVICE_NAME}..."
sudo systemctl restart "${SERVICE_NAME}.service"

echo "[*] Status:"
sudo systemctl status "${SERVICE_NAME}.service" --no-pager || true

echo ""
echo "[+] Done. The hypervisor will now start automatically on boot."
echo "[+] Logs: journalctl -u ${SERVICE_NAME} -f"
echo "[+] Stop: sudo systemctl stop ${SERVICE_NAME}"
echo "[+] Disable: sudo systemctl disable ${SERVICE_NAME}"
