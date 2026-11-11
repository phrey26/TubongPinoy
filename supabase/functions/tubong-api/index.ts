import { createHandler } from '../_shared/handler.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
if (!url || new URL(url).protocol !== 'https:' || !secret) throw new Error('Missing secure backend configuration');
const handler = createHandler(async (name, args) => {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  if (!response.ok) throw body;
  return body;
}, { allowedOrigins: Deno.env.get('TUBONG_ALLOWED_ORIGINS')?.split(',').map(value => value.trim()).filter(Boolean) });
Deno.serve(handler);
