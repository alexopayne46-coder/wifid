import { html, Component } from "../app.js";
import { Nav } from "./Nav.js";
import { Header } from "./Header.js";
import { Status } from "./Status.js";
import { Clients } from "./Clients.js";
import { MeshInfo } from "./MeshInfo.js";
import { Actions } from "./Actions.js";
import { Settings } from "./Settings.js";

export class App extends Component {
  state = { page: "status", apInfo: null };

  componentDidMount() {
    fetch("/api/ap-info")
      .then((res) => res.json())
      .then((data) => this.setState({ apInfo: data }))
      .catch(() => {});
  }

  render(_, { page, apInfo }) {
    return html`
      <${Header} apInfo=${apInfo} />
      <${Nav} page=${page} onNavigate=${(p) => this.setState({ page: p })} />
      <div class="container">
        ${page === "status" && html`<${Status} />`}
        ${page === "clients" && html`<${Clients} />`}
        ${page === "mesh" && html`<${MeshInfo} />`}
        ${page === "actions" && html`<${Actions} />`}
        ${page === "settings" && html`<${Settings} />`}
      </div>
    `;
  }
}
