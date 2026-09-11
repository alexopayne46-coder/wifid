import { html } from "../app.js";

export function Header({ apInfo, onToggleDrawer }) {
  const statusText = apInfo
    ? `SSID: ${apInfo.ssid} | Band: ${apInfo.band} | ${apInfo.portal ? "Portal: ACTIVE" : "Gateway: " + apInfo.gateway}`
    : "Loading...";

  return html`
    <div class="header">
      <div class="header-left">
        <button class="drawer-toggle" onClick=${onToggleDrawer}>
          <span class="drawer-toggle-icon">☰</span>
        </button>
        <h1>wifi.d</h1>
      </div>
      <div class="header-right">${statusText}</div>
    </div>
  `;
}
