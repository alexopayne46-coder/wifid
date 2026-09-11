import { html, Component } from "../app.js";

export class Drawer extends Component {
  render({ open, onClose, title, children }) {
    return html`
      <div class="drawer-backdrop ${open ? "open" : ""}" onClick=${onClose} />
      <div class="drawer ${open ? "open" : ""}">
        <div class="drawer-header">
          <h3>${title || "Drawer"}</h3>
          <button class="drawer-close" onClick=${onClose}>×</button>
        </div>
        <div class="drawer-body">
          ${children}
        </div>
      </div>
    `;
  }
}
