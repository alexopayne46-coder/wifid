import { mkdirSync } from "node:fs";

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
  return id;
}

export function unregister(memcode: string): boolean {
  const idx = hooks.findIndex((h) => h.id === memcode);
  if (idx >= 0) {
    hooks.splice(idx, 1);
    return true;
  }
  return false;
}

export async function callHook(event: HookEvent, ...args: any[]): Promise<void> {
  for (const entry of hooks) {
    if (entry.event === event) {
      try {
        await entry.fn(...args);
      } catch (err) {
        console.error(`hook error [${event}]: ${(err as Error).message}`);
      }
    }
  }
}

export async function loadUserHooks(): Promise<void> {
  const dir = "./data/userfiles";
  const filePath = `${dir}/hooks.ts`;
  try {
    mkdirSync(dir, { recursive: true });
  } catch {}

  try {
    await import(filePath);
  } catch {
    // File does not exist or failed to load; ignore
  }
}
