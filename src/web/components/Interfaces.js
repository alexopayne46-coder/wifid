import { html, Component, apiCall } from "../app.js";

export class Interfaces extends Component {
  state = { interfaces: [], loading: true };

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

  handleSelect = (iface) => {
    if (this.props.onSelect) {
      this.props.onSelect(iface);
    }
  };

  render(_, { interfaces, loading }) {
    return html`
      <div class="card">
        <h2>Wireless Interfaces</h2>
        ${loading
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
                    <tr key=${iface.name} onClick=${() => this.handleSelect(iface.name)} style="cursor:pointer">
                      <td>${iface.name}</td>
                      <td>${iface.clients}</td>
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
