// Utilidades HTTP compartidas: CORS restringido y respuestas JSON.

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function allowedOrigins(): string[] {
  const fromEnv = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...fromEnv, ...DEFAULT_ORIGINS];
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = allowedOrigins().includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin');
  // Peticiones sin Origin (scripts de servidor) se permiten; los navegadores siempre lo envían.
  return !origin || allowedOrigins().includes(origin);
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function error(req: Request, status: number, message: string, code?: string): Response {
  return json(req, { error: message, code }, status);
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

type Handler = (req: Request, body: Record<string, unknown>) => Promise<Response>;

/** Envoltura común: CORS, método, origen, JSON y manejo de errores. */
export function serve(handler: Handler) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    if (req.method !== 'POST') {
      return error(req, 405, 'Método no permitido.');
    }
    if (!isAllowedOrigin(req)) {
      return error(req, 403, 'Origen no permitido.');
    }
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return error(req, 400, 'Solicitud inválida.');
    }
    try {
      return await handler(req, body);
    } catch (err) {
      if (err instanceof HttpError) {
        return error(req, err.status, err.message, err.code);
      }
      console.error(err);
      return error(req, 500, 'Error interno. Intenta de nuevo.');
    }
  });
}
