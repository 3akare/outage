// Scaffold only. Task 4 adds POST /probe/events and GET /probe/export with the token check.
export interface Env {
  PROBE_STORE: DurableObjectNamespace;
  PROBE_TOKEN?: string; // Wrangler secret, set by the human
}

export class ProbeStore implements DurableObject {
  constructor(readonly ctx: DurableObjectState, readonly env: Env) {}
  async fetch(_request: Request): Promise<Response> {
    return new Response('not implemented', { status: 501 });
  }
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
