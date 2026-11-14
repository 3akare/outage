// Scaffold (event-ingest task 1). Handlers arrive in task 4, the area actor in tasks 5, 7 and 8.
import { DurableObject } from 'cloudflare:workers';

export interface Env {
  AREA: DurableObjectNamespace<AreaActor>;
  INSTALL_TOKEN_SECRET?: string;
}

export class AreaActor extends DurableObject<Env> {}

export default {
  async fetch(): Promise<Response> {
    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
