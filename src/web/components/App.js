import { html, Component, apiCall } from "../app.js";
import { Nav } from "./Nav.js";
import { Header } from "./Header.js";
import { Status } from "./Status.js";
import { Portal } from "./Portal.js";
import { Interfaces } from "./Interfaces.js";
import { DnsQueries } from "./DnsQueries.js";
import { Logs } from "./Logs.js";
import { MeshInfo } from "./MeshInfo.js";
import { Actions } from "./Actions.js";
import { Settings } from "./Settings.js";
import { Drawer } from "./Drawer.js";

export class App extends Component {
  state = { page: "status", apInfo: null, drawerOpen: false };

  componentDidMount() {
    apiCall("apInfo")
      .then((data) => this.setState({ apInfo: data.result || {} }))
      .catch(() => {});
  }

  toggleDrawer = () => {
    this.setState((prev) => ({ drawerOpen: !prev.drawerOpen }));
  };

  closeDrawer = () => {
    this.setState({ drawerOpen: false });
  };

  render(_, { page, apInfo, drawerOpen }) {
    return html`
      <${Header} apInfo=${apInfo} onToggleDrawer=${this.toggleDrawer} />
      <${Nav} page=${page} onNavigate=${(p) => this.setState({ page: p })} />
      <div class="container">
        ${page === "status" && html`<${Status} />`}
        ${page === "portal" && html`<${Portal} />`}
        ${page === "interfaces" && html`<${Interfaces} />`}
        ${page === "dns" && html`<${DnsQueries} />`}
        ${page === "logs" && html`<${Logs} />`}
        ${page === "mesh" && html`<${MeshInfo} />`}
        ${page === "actions" && html`<${Actions} />`}
        ${page === "settings" && html`<${Settings} />`}
      </div>
      <${Drawer} open=${drawerOpen} onClose=${this.closeDrawer} />
    `;
  }
}
