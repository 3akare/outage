export function main(io: {
  argv: string[];
  env: Record<string, string | undefined>;
  fetch?: (
    url: string,
    init: { headers: Record<string, string>; signal: AbortSignal },
  ) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
  nowMs?: number;
}): Promise<{ code: number; out: Record<string, unknown> }>;
