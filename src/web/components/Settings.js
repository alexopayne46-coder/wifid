import { html, Component } from "../app.js";

export class Settings extends Component {
  state = { config: null };

  componentDidMount() {
    fetch("/api/ap-info")
      .then((res) => res.json())
      .then((data) => this.setState({ config: data }))
      .catch(() => {});
  }

  render(_, { config }) {
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
    `;
  }
}
