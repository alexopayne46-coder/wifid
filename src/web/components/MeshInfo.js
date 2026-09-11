import { html, Component } from "../app.js";

export class MeshInfo extends Component {
  state = { loading: true, details: [] };

  componentDidMount() {
    fetch("/api/ap-info")
      .then((res) => res.json())
      .then((data) => {
        const details = [];
        if (data.mesh && data.mesh.enabled) {
          details.push(["Status", "Enabled"]);
          details.push(["Interfaces", data.mesh.interfaces.join(", ")]);
          details.push(["Count", String(data.mesh.interfaces.length)]);
        } else {
          details.push(["Status", "Disabled"]);
        }
        this.setState({ loading: false, details });
      })
      .catch(() => this.setState({ loading: false, details: [["Error", "Failed to load"]] }));
  }

  render(_, { loading, details }) {
    return html`
      <div class="card">
        <h2>Mesh Info</h2>
        ${loading
          ? html`<div class="ap-info">Loading...</div>`
          : html`
            <table class="settings-table">
              <tbody>
                ${details.map(([key, value]) => html`
                  <tr key=${key}>
                    <td>${key}</td>
                    <td>${value}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          `}
      </div>
    `;
  }
}
