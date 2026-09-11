import { html, Component, apiCall } from "../app.js";
import { Nav } from "./Nav.js";
import { Header } from "./Header.js";
import { Status } from "./Status.js";
import { Portal } from "./Portal.js";
import { Clients } from "./Clients.js";
import { DnsQueries } from "./DnsQueries.js";
import { Logs } from "./Logs.js";
import { MeshInfo } from "./MeshInfo.js";
import { Actions } from "./Actions.js";
import { Settings } from "./Settings.js";

export class App extends Component {
  state = { page: "status", apInfo: null };

  componentDidMount() {
    apiCall("apInfo")
      .then((data) => this.setState({ apInfo: data.result || {} }))
      .catch(() => {});
  }

  render(_, { page, apInfo }) {
    return html`
      <${Header} apInfo=${apInfo} />
      <${Nav} page=${page} onNavigate=${(p) => this.setState({ page: p })} />
      <div class="container">
        ${page === "status" && html`<${Status} />`}
        ${page === "portal" && html`<${Portal} />`}
        ${page === "clients" && html`<${Clients} />`}
        ${page === "dns" && html`<${DnsQueries} />`}
        ${page === "logs" && html`<${Logs} />`}
        ${page === "mesh" && html`<${MeshInfo} />`}
        ${page === "actions" && html`<${Actions} />`}
        ${page === "settings" && html`<${Settings} />`}
      </div>
    `;
  }
}
