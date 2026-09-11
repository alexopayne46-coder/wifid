import { html } from "../app.js";

export function Nav({ page, onNavigate }) {
  const tabs = [
    { id: "status", label: "Status" },
    { id: "portal", label: "Portal" },
    { id: "clients", label: "Clients" },
    { id: "dns", label: "DNS Queries" },
    { id: "logs", label: "Logs" },
    { id: "mesh", label: "Mesh" },
    { id: "actions", label: "Actions" },
    { id: "settings", label: "Settings" },
  ];

  return html`
    <nav class="nav-tabs">
      ${tabs.map((tab) => html`
        <button
          key=${tab.id}
          class=${"nav-tab" + (page === tab.id ? " active" : "")}
          onClick=${() => onNavigate(tab.id)}
        >
          ${tab.label}
        </button>
      `)}
    </nav>
  `;
}
