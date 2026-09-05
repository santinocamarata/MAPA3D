/**
 * server/aiProxy.js — Plugin de Vite que expone POST /api/ai.
 *
 * Existe para que la API key NUNCA viaje al navegador ni quede en el bundle: el
 * front manda el pedido en lenguaje natural y este middleware, corriendo en Node,
 * hace la llamada con el SDK oficial de Anthropic.
 *
 * La key se resuelve en este orden:
 *   1. header `x-anthropic-key` (la que el usuario pega en el panel de IA)
 *   2. variable de entorno ANTHROPIC_API_KEY (archivo .env)
 */

import { json } from 'node:stream/consumers';

import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';

import {
  SCENE_RESPONSE_SCHEMA,
  buildSystemPrompt,
  buildUserMessage,
} from '../src/ai.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(body);
}

/** Traduce errores del SDK a algo que la UI pueda mostrar sin filtrar secretos. */
function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 401, error: 'API key inválida o sin permisos.', needsKey: true };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, error: 'Límite de rate alcanzado. Probá de nuevo en unos segundos.' };
  }
  if (err instanceof Anthropic.NotFoundError) {
    return { status: 404, error: `Modelo no encontrado. Revisá ANTHROPIC_MODEL (actual: ${process.env.ANTHROPIC_MODEL || DEFAULT_MODEL}).` };
  }
  if (err instanceof Anthropic.APIStatusError) {
    return { status: err.status ?? 502, error: `La API respondió ${err.status}: ${err.message}` };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 503, error: 'No se pudo conectar con la API de Claude.' };
  }
  return { status: 500, error: err?.message || 'Error desconocido en el proxy de IA.' };
}

async function handle(req, res, env) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Usá POST.' });
    return;
  }

  const apiKey = req.headers['x-anthropic-key'] || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    sendJson(res, 401, {
      error: 'Falta la API key. Configurá ANTHROPIC_API_KEY en .env o pegá una key en el panel de IA.',
      needsKey: true,
    });
    return;
  }

  let body;
  try {
    // ponytail: sin tope de tamaño de cuerpo. Es un proxy de dev en localhost y el
    // cliente es nuestra propia página. Si esto se porta a un backend público,
    // el tope va ahí, junto con rate limiting y auth.
    body = await json(req);
  } catch {
    sendJson(res, 400, { error: 'El cuerpo del pedido no es JSON válido.' });
    return;
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    sendJson(res, 400, { error: 'El prompt está vacío.' });
    return;
  }

  const model = env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.parse({
      model,
      max_tokens: 16000,
      // El pensamiento adaptativo ayuda en el razonamiento espacial (evitar que un
      // objeto caiga dentro de un edificio, rodear bloques al trazar una ruta).
      thinking: { type: 'adaptive' },
      system: buildSystemPrompt(),
      output_config: { format: jsonSchemaOutputFormat(SCENE_RESPONSE_SCHEMA) },
      messages: [{ role: 'user', content: buildUserMessage(prompt, body.context) }],
    });

    if (message.stop_reason === 'refusal') {
      sendJson(res, 422, { error: 'El modelo declinó este pedido. Probá reformularlo.' });
      return;
    }

    if (!message.parsed_output) {
      sendJson(res, 502, { error: 'La respuesta del modelo no pudo parsearse como JSON del schema.' });
      return;
    }

    sendJson(res, 200, {
      result: message.parsed_output,
      model: message.model,
      usage: {
        input_tokens: message.usage?.input_tokens,
        output_tokens: message.usage?.output_tokens,
      },
    });
  } catch (err) {
    const { status, ...payload } = describeError(err);
    // Log del lado servidor para depurar sin exponer detalles al browser.
    console.error('[ai-proxy]', err?.message ?? err);
    sendJson(res, status, payload);
  }
}

/**
 * @param {Record<string,string>} env variables cargadas con loadEnv()
 * @returns {import('vite').Plugin}
 */
export function aiProxyPlugin(env = {}) {
  const middleware = (req, res, next) => {
    if (!req.url?.startsWith('/api/ai')) {
      next();
      return;
    }
    handle(req, res, env).catch((err) => {
      console.error('[ai-proxy] fallo no controlado', err);
      sendJson(res, 500, { error: 'Fallo interno del proxy de IA.' });
    });
  };

  return {
    name: 'uade-ai-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    // Que `vite preview` también sirva el endpoint, no sólo `vite dev`.
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
