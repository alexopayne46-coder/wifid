import { html, Component, apiCall } from "../app.js";

export class Portal extends Component {
  state = { requests: [], loading: true };

  componentDidMount() {
    this.loadRequests();
    this._interval = setInterval(() => this.loadRequests(), 3000);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  loadRequests() {
    apiCall("portalRequests")
      .then((data) => this.setState({ requests: data.result || [], loading: false }))
      .catch(() => this.setState({ loading: false }));
  }

  formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  }

  render(_, { requests, loading }) {
    const recent = [...requests].reverse().slice(0, 100);

    return html`
      <div class="card">
        <h2>Portal Requests</h2>
        <div class="ap-info">${requests.length} requests recorded (showing most recent 100)</div>
        ${loading
          ? html`<div class="ap-info">Loading...</div>`
          : recent.length === 0
            ? html`<div class="ap-info">No portal requests yet</div>`
            : html`
              <table class="settings-table clients-table portal-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Method</th>
                    <th>Path</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  ${recent.map((r, i) => html`
                    <tr key=${r.ts + "-" + i}>
                      <td>${this.formatTime(r.ts)}</td>
                      <td>${r.method}</td>
                      <td>${r.url}</td>
                      <td>${r.ip}</td>
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
