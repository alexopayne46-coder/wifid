import { html, Component, apiCall } from "../app.js";

export class AdministrationPortal extends Component {
  state = {
    portalRequests: [],
    dnsQueries: [],
    portalLoading: true,
    dnsLoading: true,
  };

  componentDidMount() {
    this.loadData();
    this._interval = setInterval(() => this.loadData(), 3000);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  async loadData() {
    const [portalData, dnsData] = await Promise.all([
      apiCall("portalRequests").catch(() => ({ result: [] })),
      apiCall("dnsQueries").catch(() => ({ result: [] })),
    ]);
    this.setState({
      portalRequests: portalData.result || [],
      dnsQueries: dnsData.result || [],
      portalLoading: false,
      dnsLoading: false,
    });
  }

  formatTime(ts) {
    return new Date(ts).toLocaleTimeString();
  }

  render(_, { portalRequests, dnsQueries, portalLoading, dnsLoading }) {
    const recentPortal = [...portalRequests].reverse().slice(0, 100);
    const recentDns = [...dnsQueries].reverse().slice(0, 100);

    return html`
      <div class="admin-grid">
        <div class="admin-col">
          <div class="card">
            <h2>Portal Requests</h2>
            <div class="ap-info">${portalRequests.length} requests recorded (showing most recent 100)</div>
            ${portalLoading
              ? html`<div class="ap-info">Loading...</div>`
              : recentPortal.length === 0
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
                      ${recentPortal.map((r, i) => html`
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
        </div>
        <div class="admin-col">
          <div class="card">
            <h2>DNS Queries</h2>
            <div class="ap-info">${dnsQueries.length} queries recorded (showing most recent 100)</div>
            ${dnsLoading
              ? html`<div class="ap-info">Loading...</div>`
              : recentDns.length === 0
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
                      ${recentDns.map((q, i) => html`
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
        </div>
      </div>
    `;
  }
}
