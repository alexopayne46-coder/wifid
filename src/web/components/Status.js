import { html, Component } from "../app.js";

export class Status extends Component {
  state = { apInfo: null };

  componentDidMount() {
    fetch("/api/ap-info")
      .then((res) => res.json())
      .then((data) => this.setState({ apInfo: data }))
      .catch(() => {});
  }

  render(_, { apInfo }) {
    return html`
      <div class="card">
        <h2>Status</h2>
        <div class="status">
          <div class="status-dot" />
          <span>AP Running</span>
        </div>
        ${apInfo && html`
          <div class="ap-info">
            <div>SSID: ${apInfo.ssid}</div>
            <div>Password: ${apInfo.password}</div>
            <div>Band: ${apInfo.band}</div>
            <div>Gateway: ${apInfo.gateway}</div>
            <div>BSSID: ${apInfo.bssid}</div>
            <div>Open: ${apInfo.open ? "Yes" : "No"}</div>
            ${apInfo.portal && html`<div class="portal-active">Portal: ACTIVE</div>`}
            ${apInfo.mesh && html`
              <div class="mesh-status ${apInfo.mesh.enabled ? "mesh-on" : "mesh-off"}">
                Mesh: ${apInfo.mesh.enabled ? "ON" : "OFF"}
                ${apInfo.mesh.enabled
                  ? " (" + apInfo.mesh.interfaces.join(", ") + ")"
                  : ""}
              </div>
            `}
          </div>
        `}
      </div>
    `;
  }
}
