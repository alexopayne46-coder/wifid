import { html, Component } from "../app.js";

export class Clients extends Component {
  state = { clients: [], loading: true };

  componentDidMount() {
    this.loadClients();
    this._interval = setInterval(() => this.loadClients(), 5000);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  loadClients() {
    fetch("/api/clients")
      .then((res) => res.json())
      .then((data) => this.setState({ clients: data.clients || [], loading: false }))
      .catch(() => this.setState({ loading: false }));
  }

  formatSignal(dbm) {
    if (dbm == null) return "-";
    if (dbm >= -50) return `${dbm} dBm (excellent)`;
    if (dbm >= -60) return `${dbm} dBm (good)`;
    if (dbm >= -70) return `${dbm} dBm (fair)`;
    return `${dbm} dBm (weak)`;
  }

  render(_, { clients, loading }) {
    return html`
      <div class="card">
        <h2>Clients</h2>
        ${loading
          ? html`<div class="ap-info">Loading...</div>`
          : clients.length === 0
            ? html`<div class="ap-info">No clients connected</div>`
            : html`
              <table class="settings-table clients-table">
                <thead>
                  <tr>
                    <th>MAC</th>
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
    `;
  }
}
