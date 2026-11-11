import { replayShot, roundTargets, type RunContext } from './replay.ts';

export type Rpc = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
const cors = {
  // No cookies: protected operations require an explicit, unguessable bearer token.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-game-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '600',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const endpoints = new Set(['session','signup','login','logout','username-availability','signup-challenge',
  'me','profile','inventory','settings','catalog','wallet','tutorial','scores','game-run']);
class ApiError extends Error {
  constructor(message: string, readonly status = 422) { super(message); }
}
export function createHandler(rpc: Rpc) {
  return async (request: Request): Promise<Response> => {
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);
    try {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ message: 'Send a JSON request.' }, 415);
      const reader = request.body?.getReader();
      if (!reader) return json({ message: 'Expected a JSON object.' }, 400);
      const chunks: Uint8Array[] = []; let length = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        length += value.length;
        if (length > 12000) { await reader.cancel(); return json({ message: 'Request is too large.' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let envelope: Record<string, unknown>;
      try { envelope = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { return json({ message: 'Invalid JSON request.' }, 400); }
      if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return json({ message: 'Expected a JSON object.' }, 400);
      const { endpoint, method, data, guestId } = envelope;
      if (typeof endpoint !== 'string' || !endpoints.has(endpoint)) return json({ message: 'Endpoint not found.' }, 404);
      if (method !== 'GET' && method !== 'POST') return json({ message: 'Method not allowed.' }, 405);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ message: 'Expected a JSON object.' }, 400);
      if (typeof guestId !== 'string' || !/^[a-f0-9-]{36}$/.test(guestId)) return json({ message: 'Invalid browser session.' }, 422);
      const token = request.headers.get('x-game-session') ?? '';
      if (token && !/^[a-f0-9]{64}$/.test(token)) return json({ message: 'Please log in again.' }, 401);
      const body = data as Record<string, unknown>;
      const game = body['game'];
      let replay: unknown = null;
      if (endpoint === 'game-run') {
        if (game !== 'tumbang-preso' && game !== 'jolens-blast') throw new ApiError('Unknown game.');
        if (body['action'] === 'shot') {
          const { vx, vy } = body;
          if (typeof vx !== 'number' || typeof vy !== 'number' || !Number.isFinite(vx) || !Number.isFinite(vy)) throw new ApiError('Invalid shot.');
          const speed = Math.hypot(vx, vy);
          if (speed > (game === 'tumbang-preso' ? 17.6 : 22.5) + 1e-9) throw new ApiError('Shot power exceeds the game limit.');
          if (game === 'jolens-blast' && speed <= 1.5) throw new ApiError('Pull farther before taking a shot.');
          const context = await rpc('tp_game_context', { p_token: token, p_game: game });
          replay = replayShot(game, vx, vy, context as unknown as RunContext);
        } else if (body['action'] === 'round') {
          const bet = body['bet'];
          if (!Number.isInteger(bet) || (bet as number) < 1 || (bet as number) > 5) throw new ApiError('Invalid marble bet.');
          replay = { targets: roundTargets(bet as number) };
        }
      }
      // x-forwarded-for is populated by Supabase's gateway. Session/account limits
      // are enforced independently by Postgres, not only by this network bucket.
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
      const result = await rpc('tp_api', { p_endpoint: endpoint, p_method: method, p_body: body,
        p_token: token, p_guest: guestId, p_ip: ip, p_replay: replay });
      const status = typeof result['_status'] === 'number' ? result['_status'] : 200;
      delete result['_status'];
      return json(result, status);
    } catch (error) {
      if (error instanceof ApiError) return json({ message: error.message }, error.status);
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P0001') {
        const detail = 'details' in error ? String(error.details) : '';
        return json({ message: 'message' in error ? error.message : 'Please log in again.' }, /^[45][0-9]{2}$/.test(detail) ? Number(detail) : 422);
      }
      console.error('Tubong API request failed', error instanceof Error ? error.name : 'Database request');
      return json({ message: 'The account service is unavailable. Please try again shortly.' }, 503);
    }
  };
}
