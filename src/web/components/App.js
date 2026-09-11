import { html, Component, apiCall } from "../app.js";
import { Nav } from "./Nav.js";
import { Header } from "./Header.js";
import { Status } from "./Status.js";
import { Interfaces } from "./Interfaces.js";
import { Logs } from "./Logs.js";
import { Settings } from "./Settings.js";
import { Drawer } from "./Drawer.js";
import { AdministrationPortal } from "./AdministrationPortal.js";

export class App extends Component {
  state = {
    page: "status",
    apInfo: null,
    drawerOpen: false,
    drawerTitle: "Clients",
    drawerClients: [],
    drawerLoading: true,
    drawerIface: "all",
  };

  componentDidMount() {
    apiCall("apInfo")
      .then((data) => this.setState({ apInfo: data.result || {} }))
      .catch(() => {});
  }

  openDrawerForIface = (iface) => {
    this.setState({ drawerOpen: true, drawerIface: iface, drawerLoading: true, drawerTitle: `Clients on ${iface}` });
    apiCall("clientsByInterface", { interface: iface })
      .then((data) => {
        const clients = data.result?.clients || [];
        this.setState({ drawerClients: clients, drawerLoading: false });
      })
      .catch(() => this.setState({ drawerLoading: false }));
  };

  closeDrawer = () => {
    this.setState({ drawerOpen: false });
  };

  render(_, { page, apInfo, drawerOpen, drawerTitle, drawerClients, drawerLoading, drawerIface }) {
    const drawerContent = drawerLoading
      ? html`<div class="ap-info">Loading...</div>`
      : drawerClients.length === 0
        ? html`<div class="ap-info">No clients on ${drawerIface}</div>`
        : html`
          <table class="settings-table drawer-table">
            <thead>
              <tr>
                <th>MAC</th>
                <th>Host</th>
                <th>Sig</th>
                <th>TX</th>
                <th>RX</th>
              </tr>
            </thead>
            <tbody>
              ${drawerClients.map((client, i) => {
                const sig = client.signal == null ? "-" : client.signal >= -50 ? "excellent" : client.signal >= -60 ? "good" : client.signal >= -70 ? "fair" : "weak";
                return html`
                  <tr key=${client.mac + "-" + i}>
                    <td>${client.mac}</td>
                    <td>${client.hostname || "-"}</td>
                    <td>${sig}${client.signal != null ? " " + client.signal + " dBm" : ""}</td>
                    <td>${client.txBitrate != null ? client.txBitrate.toFixed(0) + " MBit/s" : "-"}</td>
                    <td>${client.rxBitrate != null ? client.rxBitrate.toFixed(0) + " MBit/s" : "-"}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        `;

    return html`
      <${Header} apInfo=${apInfo} />
      <${Nav} page=${page} onNavigate=${(p) => this.setState({ page: p })} />
      <div class="container">
        ${page === "status" && html`<${Status} />`}
        ${page === "administration" && html`<${AdministrationPortal} />`}
        ${page === "interfaces" && html`<${Interfaces} onSelect=${this.openDrawerForIface} />`}
        ${page === "logs" && html`<${Logs} />`}
        ${page === "settings" && html`<${Settings} />`}
      </div>
      <${Drawer} open=${drawerOpen} onClose=${this.closeDrawer} title=${drawerTitle}>
        ${drawerContent}
      </${Drawer}>
    `;
  }
}
