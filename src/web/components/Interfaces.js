import { html, Component, apiCall } from "../app.js";

export class Interfaces extends Component {
  state = { interfaces: [], meshIfaces: [], loading: true };

  componentDidMount() {
    this.loadData();
    this._interval = setInterval(() => this.loadData(), 5000);
  }

  componentWillUnmount() {
    clearInterval(this._interval);
  }

  async loadData() {
    const [ifacesData, apData] = await Promise.all([
      apiCall("interfaces"),
      apiCall("apInfo").catch(() => ({ result: {} })),
    ]);
    this.setState({
      interfaces: ifacesData.result || [],
      meshIfaces: (apData.result?.mesh?.interfaces || []).map((s) => s.trim()),
      loading: false,
    });
  }

  handleSelect = (iface) => {
    if (this.props.onSelect) {
      this.props.onSelect(iface);
    }
  };

  render(_, { interfaces, meshIfaces, loading }) {
    return html`
      <div class="card">
        <h2>Wireless Interfaces</h2>
        ${loading
          ? html`<div class="ap-info">Loading...</div>`
          : interfaces.length === 0
            ? html`<div class="ap-info">No wireless interfaces found</div>`
            : html`
              <table class="settings-table clients-table iface-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Interface</th>
                    <th>Clients</th>
                    <th>TX</th>
                    <th>RX</th>
                    <th>Driver</th>
                    <th>Restarts</th>
                  </tr>
                </thead>
                <tbody>
                  ${interfaces.map((iface) => {
                    const isMesh = meshIfaces.includes(iface.name);
                    return html`
                      <tr key=${iface.name} onClick=${() => this.handleSelect(iface.name)} style="cursor:pointer">
                        <td>${iface.number}</td>
                        <td>${iface.name} ${isMesh ? html`<span class="mesh-icon" title="Mesh">◈</span>` : ""}</td>
                        <td>${iface.clients}</td>
                        <td>${iface.tx ? iface.tx.toFixed(0) + " MBit/s" : "-"}</td>
                        <td>${iface.rx ? iface.rx.toFixed(0) + " MBit/s" : "-"}</td>
                        <td>${iface.driver}</td>
                        <td>${iface.restarts || 0}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            `
        }
      </div>
    `;
  }
}
