import { html, Component, apiCall } from "../app.js";

export class Actions extends Component {
  handleStop = () => {
    if (window.confirm("Stop AP? This will shut down the access point.")) {
      apiCall("stop")
        .then(() => alert("AP is shutting down..."))
        .catch((err) => alert("Error: " + (err.error || err.message)));
    }
  };

  render() {
    return html`
      <div class="card">
        <h2>Actions</h2>
        <button class="btn" onClick=${() => alert("Restart AP")}>Restart AP</button>
        <button class="btn danger" onClick=${this.handleStop}>Stop AP</button>
      </div>
    `;
  }
}
