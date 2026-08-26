#!/bin/bash
# hostapd_notify.sh — called by hostapd_cli on station connect/disconnect events.
# Arguments: "$1" = interface, "$2" = event (e.g. "assoc", "disassoc", "deauth")
INTERFACE="$1"
EVENT="$2"

# You can customize this: send a webhook, log to a file, trigger a notification, etc.
echo "[hostapd-notify] event=$EVENT interface=$INTERFACE" >>/var/log/hostapd-notify.log

# Example: send a POST to a webhook on new associations
if [ "$EVENT" = "assoc" ]; then
  echo "$(date): New device associated on $INTERFACE" >>/var/log/hostapd-notify.log
fi
