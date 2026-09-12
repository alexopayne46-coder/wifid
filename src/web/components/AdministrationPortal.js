import { html, Component, apiCall } from "../app.js";

const MOBILE_BREAKPOINT = 768;
const DESKTOP_ROW_LIMIT = 100;
const MOBILE_ROW_LIMIT = 25;
const POLL_INTERVAL_MS = 3000;

export class AdministrationPortal extends Component {
  state = {
    portalRequests: [],
    dnsQueries: [],
    portalLoading: true,
    dnsLoading: true,
    isMobile: typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT,
  };

  componentDidMount() {
    this.loadData();
    this._startPolling();

    document.addEventListener("visibilitychange", this.handleVisibility);
    window.addEventListener("resize", this.handleResize);
  }

  componentWillUnmount() {
    this._stopPolling();
    document.removeEventListener("visibilitychange", this.handleVisibility);
    window.removeEventListener("resize", this.handleResize);
  }

  _startPolling() {
    if (this._interval) return;
    this._interval = setInterval(() => this.loadData(), POLL_INTERVAL_MS);
  }

  _stopPolling() {
    clearInterval(this._interval);
    this._interval = null;
  }

  handleVisibility = () => {
    if (document.hidden) {
      this._stopPolling();
    } else {
      this.loadData();
      this._startPolling();
    }
  };

  handleResize = () => {
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    if (isMobile !== this.state.isMobile) {
      this.setState({ isMobile });
    }
  };

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

  render(_, { portalRequests, dnsQueries, portalLoading, dnsLoading, isMobile }) {
    const rowLimit = isMobile ? MOBILE_ROW_LIMIT : DESKTOP_ROW_LIMIT;
    const recentPortal = [...portalRequests].reverse().slice(0, rowLimit);
    const recentDns = [...dnsQueries].reverse().slice(0, rowLimit);

    return html`
      <div class="admin-grid">
        <div class="admin-col">
          <div class="card">
            <h2>Portal Requests</h2>
            <div class="ap-info">${portalRequests.length} requests recorded (showing most recent ${rowLimit})</div>
            ${portalLoading
              ? html`<div class="ap-info">Loading...</div>`
              : recentPortal.length === 0
                ? html`<div class="ap-info">No portal requests yet</div>`
                : html`
                  <div class="table-scroll">
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
                            <td class="truncate-cell" title=${r.url}>${r.url}</td>
                            <td>${r.ip}</td>
                          </tr>
                        `)}
                      </tbody>
                    </table>
                  </div>
                `
            }
          </div>
        </div>
        <div class="admin-col">
          <div class="card">
            <h2>DNS Queries</h2>
            <div class="ap-info">${dnsQueries.length} queries recorded (showing most recent ${rowLimit})</div>
            ${dnsLoading
              ? html`<div class="ap-info">Loading...</div>`
              : recentDns.length === 0
                ? html`<div class="ap-info">No DNS queries yet</div>`
                : html`
                  <div class="table-scroll">
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
                            <td class="truncate-cell" title=${q.domain}>${q.domain}</td>
                            <td>${q.type}</td>
                            <td>${q.client}</td>
                          </tr>
                        `)}
                      </tbody>
                    </table>
                  </div>
                `
            }
          </div>
        </div>
      </div>
    `;
  }
}