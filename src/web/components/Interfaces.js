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
    const Svg = (props) => html`<svg class="tbl-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ...${props} />`;

    const HashIcon = () => html`<${Svg}><path d="M4 7V4h3"/><path d="M5 20v3h3"/><path d="M20 7V4h-3"/><path d="M19 20v-3h-3"/><path d="M9 9h6v6H9z"/></${Svg}>`;
    const WifiIcon = () => html`<${Svg}><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1"/></${Svg}>`;
    const ClientsIcon = () => html`<${Svg}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></${Svg}>`;
    const UpIcon = () => html`<${Svg}><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></${Svg}>`;
    const DownIcon = () => html`<${Svg}><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></${Svg}>`;
    const DriverIcon = () => html`<${Svg}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/></${Svg}>`;
    const RestartsIcon = () => html`<${Svg}><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></${Svg}>`;

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
                    <th><${HashIcon} /> #</th>
                    <th><${WifiIcon} /> Interface</th>
                    <th><${ClientsIcon} /> Clients</th>
                    <th><${UpIcon} /> TX</th>
                    <th><${DownIcon} /> RX</th>
                    <th><${DriverIcon} /> Driver</th>
                    <th><${RestartsIcon} /> Restarts</th>
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
