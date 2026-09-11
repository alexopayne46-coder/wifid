import { html, Component, apiCall } from "../app.js";

export class DnsQueries extends Component {
  state = { queries: [], loading: true };

  componentDidMount() {
    this.loadQueries();
    this._interval = setInterval(() => this.loadQueries(), 3000);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  loadQueries() {
    apiCall("dnsQueries")
      .then((data) => this.setState({ queries: data.result || [], loading: false }))
      .catch(() => this.setState({ loading: false }));
  }

  formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  }

  render(_, { queries, loading }) {
    const recent = [...queries].reverse().slice(0, 100);

    return html`
      <div class="card">
        <h2>DNS Queries</h2>
        <div class="ap-info">${queries.length} queries recorded (showing most recent 100)</div>
        ${loading
          ? html`<div class="ap-info">Loading...</div>`
          : recent.length === 0
            ? html`<div class="ap-info">No DNS queries yet</div>`
            : html`
              <table class="settings-table clients-table dns-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Domain</th>
                    <th>Type</th>
                    <th>Client</th>
                  </tr>
                </thead>
                <tbody>
                  ${recent.map((q, i) => html`
                    <tr key=${q.time + "-" + i}>
                      <td>${this.formatTime(q.time)}</td>
                      <td>${q.domain}</td>
                      <td>${q.type}</td>
                      <td>${q.client}</td>
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
