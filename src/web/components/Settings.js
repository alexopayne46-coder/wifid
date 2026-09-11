import { html, Component, apiCall } from "../app.js";

export class Settings extends Component {
  state = { config: null, argv: "", saving: false };

  componentDidMount() {
    this.loadConfig();
    this._interval = setInterval(() => this.loadConfig(), 5000);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  loadConfig() {
    apiCall("apInfo")
      .then((data) => this.setState({ config: data.result || {} }))
      .catch(() => {});

    apiCall("argvGet")
      .then((data) => this.setState({ argv: data.result?.content || "" }))
      .catch(() => {});
  }

  saveArgv() {
    this.setState({ saving: true });
    apiCall("argvSet", { content: this.state.argv })
      .then(() => alert("Saved. Restart the hypervisor to apply."))
      .catch((err) => alert("Error: " + (err.error || err.message)))
      .finally(() => this.setState({ saving: false }));
  }

  render(_, { config, argv, saving }) {
    if (!config) {
      return html`<div class="card"><h2>Settings</h2><div>Loading...</div></div>`;
    }

    const rows = [
      ["SSID", config.ssid],
      ["Password", config.password],
      ["Band", config.band],
      ["Gateway", config.gateway],
      ["IP", config.ip],
      ["BSSID", config.bssid],
      ["Open", config.open ? "Yes" : "No"],
      ["Portal", config.portal ? "Yes" : "No"],
    ];

    if (config.mesh && config.mesh.enabled) {
      rows.push(["Mesh", config.mesh.interfaces.join(", ")]);
    }

    return html`
      <div class="card">
        <h2>Settings</h2>
        <table class="settings-table">
          <tbody>
            ${rows.map(([key, value]) => html`
              <tr key=${key}>
                <td>${key}</td>
                <td>${value}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>Startup Command (.argv.txt)</h2>
        <p class="ap-info">Used by hypervisor.ts. Must start with <b>bun</b> or <b>node</b> and include <b>src/ap.ts</b>.</p>
        <textarea
          class="argv-editor"
          value=${argv}
          onInput=${(e) => this.setState({ argv: e.target.value })}
          spellcheck="false"
        ></textarea>
        <div class="argv-actions">
          <button class="btn" onClick=${() => this.saveArgv()} disabled=${saving}>
            ${saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    `;
  }
}
