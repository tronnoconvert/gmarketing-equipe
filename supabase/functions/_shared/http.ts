// _shared/http.ts — CORS, respostas JSON e erros padronizados (mensagens em pt-BR, sem vazar segredos).

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } });
}

/** erro de negócio: {erro, codigo} com status HTTP */
export class HttpError extends Error {
  constructor(public status: number, message: string, public codigo = 'erro') { super(message); }
}

export function erro(e: unknown): Response {
  if (e instanceof HttpError) return json({ erro: e.message, codigo: e.codigo }, e.status);
  console.error('[agencia-os] erro inesperado:', e instanceof Error ? e.stack ?? e.message : e);
  return json({ erro: 'Erro interno. Tente de novo em instantes; se persistir, veja os logs da função no Supabase.', codigo: 'interno' }, 500);
}

/** envolve o handler: OPTIONS (preflight), método permitido e tratamento de erros */
export function servir(handler: (req: Request) => Promise<Response>, metodos: string[] = ['POST']) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (!metodos.includes(req.method)) return json({ erro: `Método ${req.method} não permitido. Use ${metodos.join(' ou ')}.`, codigo: 'metodo' }, 405);
    try { return await handler(req); } catch (e) { return erro(e); }
  };
}

/** lê o corpo JSON (objeto) ou lança 400 */
export async function corpo(req: Request): Promise<Record<string, unknown>> {
  if (req.method === 'GET') return Object.fromEntries(new URL(req.url).searchParams);
  const txt = await req.text();
  if (!txt.trim()) return {};
  try {
    const v = JSON.parse(txt);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('não é objeto');
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Corpo da requisição inválido: envie um JSON (objeto).', 'json');
  }
}

/* ---------------- validação simples ---------------- */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function texto(v: unknown, nome: string, o: { min?: number; max?: number; obrigatorio?: boolean; re?: RegExp } = {}): string {
  if (v === undefined || v === null || v === '') {
    if (o.obrigatorio) throw new HttpError(400, `Campo "${nome}" é obrigatório.`, 'validacao');
    return '';
  }
  if (typeof v !== 'string') throw new HttpError(400, `Campo "${nome}" precisa ser texto.`, 'validacao');
  const s = v.trim();
  if (o.min && s.length < o.min) throw new HttpError(400, `Campo "${nome}" precisa ter pelo menos ${o.min} caracteres.`, 'validacao');
  if (o.max && s.length > o.max) throw new HttpError(400, `Campo "${nome}" pode ter no máximo ${o.max} caracteres.`, 'validacao');
  if (o.re && s && !o.re.test(s)) throw new HttpError(400, `Campo "${nome}" em formato inválido.`, 'validacao');
  return s;
}
export function lista(v: unknown, nome: string, max = 100): string[] {
  if (v === undefined || v === null) return [];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  if (arr.length > max) throw new HttpError(400, `Campo "${nome}" aceita no máximo ${max} itens.`, 'validacao');
  return arr.map((x) => String(x).trim()).filter(Boolean);
}

export function env(nome: string): string | undefined {
  const v = Deno.env.get(nome);
  return v && v.trim() ? v.trim() : undefined;
}
export function envObrigatoria(nome: string): string {
  const v = env(nome);
  if (!v) {
    if (nome.startsWith('SUPABASE_')) throw new HttpError(500, `Variável ${nome} ausente: ela é fornecida automaticamente pelo Supabase às Edge Functions (rode a função no Supabase ou com "supabase functions serve").`, 'ambiente');
    throw new HttpError(503, `Integração não configurada: defina ${nome} com "supabase secrets set ${nome}=...".`, 'nao_configurado');
  }
  return v;
}

/** fetch com tempo limite */
export async function buscar(url: string, init: RequestInit = {}, ms = 25000): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...init, signal: ac.signal }); }
  catch (e) {
    if ((e as Error).name === 'AbortError') throw new HttpError(504, 'O serviço externo demorou demais para responder. Tente de novo.', 'timeout');
    throw new HttpError(502, 'Não foi possível conectar ao serviço externo.', 'rede');
  } finally { clearTimeout(t); }
}
