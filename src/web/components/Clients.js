import { html, Component, apiCall } from "../app.js";

export class Clients extends Component {
  state = { clients: [], leases: [], loading: true };

  componentDidMount() {
    this.loadData();
    this._interval = setInterval(() => this.loadData(), 5000);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  loadData() {
    Promise.all([
      apiCall("clients"),
      apiCall("clientsActive"),
      apiCall("dhcpLeases"),
    ])
      .then(([clientsData, activeData, leasesData]) => {
        const activeMap = new Map((activeData.result || []).map((c) => [c.mac, c]));
        const merged = (clientsData.result || []).map((c) => ({
          ...c,
          ...activeMap.get(c.mac),
        }));
        const seen = new Set(merged.map((c) => c.mac));
        for (const c of activeData.result || []) {
          if (!seen.has(c.mac)) merged.push(c);
        }
        this.setState({
          clients: merged,
          leases: (leasesData.result || []).reverse().slice(0, 50),
          loading: false,
        });
      })
      .catch(() => this.setState({ loading: false }));
  }

  formatSignal(dbm) {
    if (dbm == null) return "-";
    if (dbm >= -50) return `${dbm} dBm (excellent)`;
    if (dbm >= -60) return `${dbm} dBm (good)`;
    if (dbm >= -70) return `${dbm} dBm (fair)`;
    return `${dbm} dBm (weak)`;
  }

  render(_, { clients, leases, loading }) {
    return html`
      <div class="card">
        <h2>Connected Clients</h2>
        ${loading
          ? html`<div class="ap-info">Loading...</div>`
          : clients.length === 0
            ? html`<div class="ap-info">No clients connected</div>`
            : html`
              <table class="settings-table clients-table">
                <thead>
                  <tr>
                    <th>MAC</th>
                    <th>Hostname</th>
                    <th>Interface</th>
                    <th>Signal</th>
                    <th>TX</th>
                    <th>RX</th>
                  </tr>
                </thead>
                <tbody>
                  ${clients.map((client, i) => html`
                    <tr key=${client.mac + "-" + i}>
                      <td>${client.mac}</td>
                      <td>${client.hostname || "-"}</td>
                      <td>${client.interface}</td>
                      <td>${this.formatSignal(client.signal)}</td>
                      <td>${client.txBitrate != null ? client.txBitrate.toFixed(1) + " MBit/s" : "-"}</td>
                      <td>${client.rxBitrate != null ? client.rxBitrate.toFixed(1) + " MBit/s" : "-"}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            `
        }
      </div>

      <div class="card">
        <h2>Recent Leases</h2>
        <div class="ap-info">${leases.length} recent leases (from .dhcp-leases.jsonl)</div>
        ${loading
          ? html`<div class="ap-info">Loading...</div>`
          : leases.length === 0
            ? html`<div class="ap-info">No leases recorded yet</div>`
            : html`
              <table class="settings-table clients-table">
                <thead>
                  <tr>
                    <th>MAC</th>
                    <th>IP</th>
                    <th>Hostname</th>
                  </tr>
                </thead>
                <tbody>
                  ${leases.map((lease, i) => html`
                    <tr key=${lease.mac + "-" + i}>
                      <td>${lease.mac}</td>
                      <td>${lease.ip}</td>
                      <td>${lease.hostname || "-"}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            `
        }
      </div>
    `;
  }
}
