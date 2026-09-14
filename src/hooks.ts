import { mkdirSync } from "node:fs";
import { hl, svc } from "./config.ts";

export const HOOKS = {
  AP_CONNECTED: "AP_CONNECTED",
  PORTAL_SUBMITED: "PORTAL_SUBMITED",
  AP_DISCONNECTED: "AP_DISCONNECTED",
} as const;

export type HookEvent = (typeof HOOKS)[keyof typeof HOOKS];

export interface HookEntry {
  id: string;
  event: HookEvent;
  fn: (...args: any[]) => void | Promise<void>;
}

const hooks: HookEntry[] = [];
let nextId = 1;

function generateMemcode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "0x";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function hook(
  event: HookEvent,
  fn: (...args: any[]) => void | Promise<void>,
): string {
  const id = generateMemcode();
  hooks.push({ id, event, fn });
  svc("hooks").info(`registered hook ${hl(id)} for event ${event}`);
  return id;
}

export function unregister(memcode: string): boolean {
  const idx = hooks.findIndex((h) => h.id === memcode);
  if (idx >= 0) {
    hooks.splice(idx, 1);
    svc("hooks").info(`unregistered hook ${hl(memcode)}`);
    return true;
  }
  svc("hooks").warn(`unregister failed: hook ${hl(memcode)} not found`);
  return false;
}

export async function callHook(event: HookEvent, ...args: any[]): Promise<void> {
  const matched = hooks.filter((entry) => entry.event === event);
  if (matched.length === 0) return;
  svc("hooks").debug(
    `calling ${String(matched.length)} hook(s) for event ${event}`,
  );
  for (const entry of matched) {
    try {
      await entry.fn(...args);
    } catch (err) {
      console.error(`hook error [${event}] ${hl(entry.id)}: ${(err as Error).message}`);
    }
  }
}

export async function loadUserHooks(): Promise<void> {
  const dir = "./data/userfiles";
  const filePath = `${dir}/hooks.ts`;
  try {
    mkdirSync(dir, { recursive: true });
  } catch {}

  svc("hooks").info(`loading user hooks from ${filePath}`);
  try {
    await import(filePath);
    svc("hooks").info("user hooks loaded");
  } catch {
    svc("hooks").warn("user hooks file not found or failed to load");
  }
}
