import { html, Component, apiCall } from "../app.js";

export class Status extends Component {
  state = { apInfo: null, sys: null };

  componentDidMount() {
    this.loadData();
    this._interval = setInterval(() => this.loadData(), 5000);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  async loadData() {
    const [apInfoData, sysData] = await Promise.all([
      apiCall("apInfo"),
      apiCall("systemInfo"),
    ]);
    this.setState({ apInfo: apInfoData.result, sys: sysData.result });
  }

  render(_, { apInfo, sys }) {
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

      ${sys && html`
        <div class="card">
          <h2>System</h2>
          <table class="settings-table">
            <tbody>
              <tr><td>Board</td><td>${sys.board}</td></tr>
              <tr><td>CPU</td><td>${sys.cpu}</td></tr>
              <tr><td>CPU Freq</td><td>${sys.cpuFreqMhz}</td></tr>
              <tr><td>CPU Temp</td><td>${sys.cpuTempC}</td></tr>
              <tr><td>RAM</td><td>${sys.ramUsedMb} / ${sys.ramTotalMb} (${sys.ramPercent})</td></tr>
              <tr><td>Uptime</td><td>${sys.uptime}</td></tr>
            </tbody>
          </table>
        </div>
      `}
    `;
  }
}
