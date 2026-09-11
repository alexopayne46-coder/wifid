export type WebBinRequest = {
  function: string;
  argv?: Record<string, unknown>;
};

export type WebBinResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

export abstract class WebBinFunction {
  abstract name: string;
  abstract execute(argv: Record<string, unknown>): Promise<unknown> | unknown;

  async handle(argv: Record<string, unknown>): Promise<WebBinResult> {
    try {
      const result = await this.execute(argv);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
