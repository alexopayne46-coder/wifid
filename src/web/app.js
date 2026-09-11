import { h, render, Component } from "preact";
import htm from "htm";

const html = htm.bind(h);

export { html, Component };

import { App } from "./components/App.js";

const root = document.getElementById("app");
if (root) {
  render(html`<${App} />`, root);
}
