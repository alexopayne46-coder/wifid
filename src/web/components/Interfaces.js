import { html, Component, apiCall } from "../app.js";

export class Interfaces extends Component {
  state = { interfaces: [], selected: null, clients: [], loading: true };

  componentDidMount() {
    this.loadInterfaces();
    this._interval = setInterval(() => this.loadInterfaces(), 5000);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  loadInterfaces() {
    apiCall("interfaces")
      .then((data) => this.setState({ interfaces: data.result || [], loading: false }))
      .catch(() => this.setState({ loading: false }));
  }

  selectInterface(name) {
    this.setState({ selected: name, loading: true });
    apiCall("clientsByInterface", { interface: name })
      .then((data) => this.setState({ clients: data.result?.clients || [], loading: false }))
      .catch(() => this.setState({ loading: false }));
  }

  formatSignal(dbm) {
    if (dbm == null) return "-";
    if (dbm >= -50) return `${dbm} dBm (excellent)`;
    if (dbm >= -60) return `${dbm} dBm (good)`;
    if (dbm >= -70) return `${dbm} dBm (fair)`;
    return `${dbm} dBm (weak)`;
  }

  render(_, { interfaces, selected, clients, loading }) {
    return html`
      <div class="card">
        <h2>Wireless Interfaces</h2>
        ${loading && !selected
          ? html`<div class="ap-info">Loading...</div>`
          : interfaces.length === 0
            ? html`<div class="ap-info">No wireless interfaces found</div>`
            : html`
              <table class="settings-table clients-table">
                <thead>
                  <tr>
                    <th>Interface</th>
                    <th>Clients</th>
                  </tr>
                </thead>
                <tbody>
                  ${interfaces.map((iface) => html`
                    <tr key=${iface.name} onClick=${() => this.selectInterface(iface.name)} style="cursor:pointer">
                      <td>${iface.name}</td>
                      <td>${iface.clients}</td>
                    </tr>
                  `)}
                </tbody>
              </table>
            `
        }
      </div>

      ${selected && html`
        <div class="card">
          <h2>Clients on ${selected}</h2>
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
      `}
    `;
  }
}
