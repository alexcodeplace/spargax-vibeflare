const DAILY_LIMIT = 10_000;

export class QuotaCounter implements DurableObject {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const today = new Date().toISOString().slice(0, 10);
    const key = `q:${today}`;
    const used = (await this.state.storage.get<number>(key)) ?? 0;

    if (url.pathname === '/peek') {
      return Response.json({ used, limit: DAILY_LIMIT, day: today });
    }

    if (url.pathname === '/charge' && req.method === 'POST') {
      const { neurons } = await req.json<{ neurons: number }>();
      if (used + neurons > DAILY_LIMIT) {
        return Response.json(
          { ok: false, used, limit: DAILY_LIMIT, reason: 'quota_exceeded' },
          { status: 429 }
        );
      }
      const next = used + neurons;
      await this.state.storage.put(key, next);
      const warn = next >= DAILY_LIMIT * 0.9;
      return Response.json({ ok: true, used: next, limit: DAILY_LIMIT, warn });
    }

    return new Response('not found', { status: 404 });
  }
}
