import { html } from "../app.js";

export function Nav({ page, onNavigate }) {
  const tabs = [
    { id: "status", label: "Status" },
    { id: "administration", label: "Administration Portal" },
    { id: "interfaces", label: "Interfaces" },
    { id: "logs", label: "Logs" },
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
