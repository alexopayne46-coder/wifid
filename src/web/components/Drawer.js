import { html, Component, apiCall } from "../app.js";

export class Drawer extends Component {
  state = { clients: [], leases: [], open: false, loading: true };

  componentDidMount() {
    this.loadData();
    this._interval = setInterval(() => this.loadData(), 5000);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.open !== this.state.open && this.state.open) {
      this.loadData();
    }
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
    if (dbm >= -50) return `${dbm} dBm`;
    if (dbm >= -60) return `${dbm} dBm`;
    if (dbm >= -70) return `${dbm} dBm`;
    return `${dbm} dBm`;
  }

  render(_, { clients, leases, loading, open }) {
    return html`
      <div class="drawer-backdrop ${open ? "open" : ""}" onClick=${() => this.props.onClose()} />
      <div class="drawer ${open ? "open" : ""}">
        <div class="drawer-header">
          <h3>Clients</h3>
          <button class="drawer-close" onClick=${() => this.props.onClose()}>×</button>
        </div>
        <div class="drawer-body">
          <div class="ap-info">${clients.length} connected</div>
          ${loading
            ? html`<div class="ap-info">Loading...</div>`
            : clients.length === 0
              ? html`<div class="ap-info">No clients connected</div>`
              : html`
                <table class="settings-table drawer-table">
                  <thead>
                    <tr>
                      <th>MAC</th>
                      <th>Host</th>
                      <th>Iface</th>
                      <th>Sig</th>
                      <th>TX</th>
                      <th>RX</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${clients.map((client, i) => html`
                      <tr key=${client.mac + "-" + i}>
                        <td>${client.mac}</td>
                        <td>${client.hostname || "-"}</td>
                        <td>${client.interface || "-"}</td>
                        <td>${this.formatSignal(client.signal)}</td>
                        <td>${client.txBitrate != null ? client.txBitrate.toFixed(0) : "-"}</td>
                        <td>${client.rxBitrate != null ? client.rxBitrate.toFixed(0) : "-"}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              `
          }
        </div>
      </div>
    `;
  }
}
