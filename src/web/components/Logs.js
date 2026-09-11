import { html, Component, apiCall } from "../app.js";

export class Logs extends Component {
  state = { logs: [], since: 0 };

  componentDidMount() {
    this.loadLogs();
    this._interval = setInterval(() => this.loadLogs(), 1500);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  loadLogs() {
    apiCall("logs", { since: this.state.since, count: 300 })
      .then((data) => {
        const logs = data.result || [];
        if (logs.length > 0) {
          this.setState((prev) => ({
            logs: [...prev.logs, ...logs].slice(-500),
            since: Date.now(),
          }));
        }
      })
      .catch(() => {});
  }

  formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  }

  levelColor(level) {
    if (level === "error" || level === "fatal") return "#c96a5a";
    if (level === "warn") return "#c9a86c";
    if (level === "debug") return "#6a8ac9";
    return "#8a8a8a";
  }

  render(_, { logs }) {
    return html`
      <div class="card">
        <h2>Live Logs</h2>
        <div class="ap-info">Showing last ${logs.length} lines from hostapd + dnsmasq</div>
        <div class="logs-container">
          ${logs.length === 0
            ? html`<div class="ap-info">Waiting for logs...</div>`
            : logs.map((log, i) => html`
              <div key=${log.ts + "-" + i} class="log-line">
                <span class="log-time">${this.formatTime(log.ts)}</span>
                <span class="log-service">${log.service}</span>
                <span class="log-level" style=${{ color: this.levelColor(log.level) }}>${log.level.toUpperCase()}</span>
                <span class="log-text">${log.line}</span>
              </div>
            `)
          }
        </div>
      </div>
    `;
  }
}
