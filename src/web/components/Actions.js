import { html } from "../app.js";

export function Actions() {
  return html`
    <div class="card">
      <h2>Actions</h2>
      <button class="btn" onClick=${() => alert("Restart AP")}>Restart AP</button>
      <button class="btn danger" onClick=${() => alert("Stop AP")}>Stop AP</button>
    </div>
  `;
}
