import { h, render, Component } from "preact";
import htm from "htm";

const html = htm.bind(h);

export { html, Component };

export async function apiCall(functionName, argv) {
  const res = await fetch("/api/bin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ function: functionName, argv }),
  });
  return res.json();
}

import { App } from "./components/App.js";

const root = document.getElementById("app");
if (root) {
  render(html`<${App} />`, root);
}
