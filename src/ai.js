/**
 * ai.js — Integración con la Claude API y parseo de la respuesta JSON.
 *
 * Reparto de responsabilidades:
 *   - Este módulo construye el System Prompt y el JSON Schema, y normaliza/valida
 *     lo que vuelve. No importa Three.js ni toca el DOM en el nivel superior, así
 *     que el proxy de Node (vite.config.js) puede importarlo tal cual y usar el
 *     mismo prompt exacto que describe la escena real.
 *   - El proxy es el único que ve la API key y hace la llamada con el SDK oficial.
 */

import { CAMPUS_BLOCKS, LANDMARKS, LAYERS, PATIO, ROUTE_WIDTH } from './config.js';

export const AI_ENDPOINT = '/api/ai';
export const API_KEY_STORAGE = 'uade3d.anthropic-key';

/** Tipos que la IA puede instanciar (el catálogo completo del editor). */
export const AI_OBJECT_TYPES = [
  'tree', 'bench', 'fountain', 'lamp', 'building', 'box', 'cylinder',
  'sphere', 'stairs', 'route', 'poi',
];

export const AI_LAYERS = Object.keys(LAYERS);

/**
 * JSON Schema de la respuesta. Se usa con structured outputs
 * (`output_config.format`), así que la respuesta llega garantizada como este JSON
 * y no hace falta pelearse con bloques de markdown.
 *
 * Structured outputs exige `additionalProperties: false` y que todas las claves
 * estén en `required`; los campos opcionales se modelan como nullable.
 */
export const SCENE_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['objects'],
  properties: {
    objects: {
      type: 'array',
      description: 'Objetos a agregar a la escena. Vacío si el pedido no requiere agregar nada.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'position', 'scale', 'rotation', 'color', 'layer', 'label', 'routePoints'],
        properties: {
          type: { type: 'string', enum: AI_OBJECT_TYPES },
          position: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y', 'z'],
            properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          },
          scale: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y', 'z'],
            properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          },
          rotation: {
            type: 'object',
            additionalProperties: false,
            required: ['y'],
            properties: { y: { type: 'number', description: 'Rotación en radianes sobre el eje Y.' } },
          },
          color: { type: 'string', description: 'Color hexadecimal, por ejemplo "#4a7c59".' },
          layer: { type: 'string', enum: AI_LAYERS },
          label: { type: 'string' },
          routePoints: {
            type: ['array', 'null'],
            description: 'Sólo para type "route": vértices del camino en coordenadas de mundo. null en cualquier otro tipo.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y', 'z'],
              properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
            },
          },
        },
      },
    },
  },
};

/** Tamaños naturales (a escala 1) de cada tipo, para que la IA calcule escalas. */
const NATURAL_SIZES = {
  tree: 'copa de ~3.5 m de diámetro, ~5.5 m de alto',
  bench: '1.8 m de largo × 0.5 m de fondo × 0.8 m de alto',
  fountain: '5.6 m de diámetro, 2.4 m de alto',
  lamp: '4.7 m de alto',
  stairs: '3 m de ancho, 6 escalones, ~1.1 m de alto',
  building: 'caja de 1×1×1 m — la escala ES la dimensión en metros',
  box: 'caja de 1×1×1 m — la escala ES la dimensión en metros',
  cylinder: 'cilindro de 1 m de diámetro y 1 m de alto — la escala ES la dimensión en metros',
  sphere: 'esfera de 1 m de diámetro — la escala ES la dimensión en metros',
  poi: 'pin de ~2 m de alto con etiqueta de texto flotante',
  route: `tubo punteado de ${ROUTE_WIDTH} m de ancho que sigue routePoints`,
};

function describeBlocks() {
  return CAMPUS_BLOCKS.map((block) => {
    const volumes = block.volumes
      .map(({ footprint, position }) => {
        const [w, h, d] = footprint;
        const x1 = position.x - w / 2;
        const x2 = position.x + w / 2;
        const z1 = position.z - d / 2;
        const z2 = position.z + d / 2;
        return `centro (x=${position.x}, z=${position.z}), ${w}×${d} m en planta, ${h} m de alto, ocupa x∈[${x1}, ${x2}] z∈[${z1}, ${z2}]`;
      })
      .join('; ');
    return `- ${block.name}: ${block.description} Volúmenes: ${volumes}.`;
  }).join('\n');
}

function describeLandmarks() {
  return LANDMARKS
    .map((l) => `- ${l.name}: (x=${l.position.x}, y=0, z=${l.position.z})`)
    .join('\n');
}

function describeTypes() {
  return AI_OBJECT_TYPES.map((type) => `- "${type}": ${NATURAL_SIZES[type]}`).join('\n');
}

/**
 * System Prompt: le da a Claude el contexto espacial exacto del campus para que
 * pueda resolver ubicaciones relativas ("en el centro", "cerca de la entrada").
 * Se genera desde config.js, así que nunca se desincroniza de la escena.
 */
export function buildSystemPrompt() {
  const { center } = PATIO;
  return `Sos el asistente de un editor 3D del campus de UADE (Universidad Argentina de la Empresa). Traducís pedidos en español a objetos de escena.

# Sistema de coordenadas
- 1 unidad = 1 METRO. Escala real estricta.
- Eje X: positivo hacia el ESTE, negativo hacia el OESTE.
- Eje Z: positivo hacia el SUR, negativo hacia el NORTE.
- Eje Y: altura. El piso es y = 0.
- Los objetos apoyan en su base: salvo que el usuario pida algo elevado, usá position.y = 0.
- rotation.y está en RADIANES.

# Patio central (bounding box)
El patio es el rectángulo abierto en el medio del campus, rodeado por los bloques:
- x de ${PATIO.minX} a ${PATIO.maxX} (${PATIO.width} m de ancho)
- z de ${PATIO.minZ} a ${PATIO.maxZ} (${PATIO.depth} m de profundidad)
- centro exacto: (x=${center.x}, y=0, z=${center.z})
Todo lo que se coloque "en el patio" debe caer dentro de ese rectángulo. "En el centro" significa cerca de (${center.x}, 0, ${center.z}). NO pongas objetos dentro del volumen de un bloque: quedarían embebidos en el edificio.

# Bloques del campus (estructura perimetral)
${describeBlocks()}

# Puntos de referencia con nombre
${describeLandmarks()}

# Tipos disponibles y su tamaño natural (a escala 1,1,1)
${describeTypes()}

# Capas
${AI_LAYERS.map((id) => `- "${id}": ${LAYERS[id].label}`).join('\n')}
Asigná la capa correcta: árboles → vegetation; bancos/farolas/fuentes → furniture; edificios, cajas y escaleras → structure; marcadores (poi) → signage; caminos (route) → routes.

# Reglas de salida
- Respondé ÚNICAMENTE con el JSON del schema. Sin texto, sin explicaciones, sin markdown.
- scale es un MULTIPLICADOR sobre el tamaño natural, excepto en box/building/cylinder/sphere donde la escala es directamente la dimensión en metros. Usá {"x":1,"y":1,"z":1} cuando el tamaño natural ya sirve.
- color es hexadecimal ("#4a7c59"). Elegí colores plausibles: follaje verde, agua azul, madera marrón, hormigón gris.
- label es un nombre corto y descriptivo en español.
- routePoints SÓLO se usa si type es "route"; en cualquier otro tipo debe ser null.
- Para "route": los routePoints van en coordenadas de MUNDO y position debe ser {"x":0,"y":0,"z":0}. Usá y=0 en cada punto. Mínimo 2 puntos; agregá puntos intermedios para que el camino rodee los edificios en vez de atravesarlos.
- Si el usuario pide varias cosas ("una fila de 5 árboles"), devolvé un objeto por cada una, con posiciones separadas y coherentes.
- Si el pedido no implica agregar nada, devolvé {"objects": []}.`;
}

/** Resumen compacto de la escena actual, para que la IA no pise objetos existentes. */
export function buildSceneContext(editor, limit = 40) {
  const objects = editor.objects.slice(-limit).map((object) => {
    const { userData: data } = object;
    const base = `${data.type} "${data.label}" en (${object.position.x.toFixed(1)}, ${object.position.z.toFixed(1)})`;
    return data.type === 'route'
      ? `${base} con ${data.routePoints?.length ?? 0} puntos`
      : base;
  });
  const omitted = Math.max(editor.objects.length - objects.length, 0);
  return { count: editor.objects.length, objects, omitted };
}

/** Arma el mensaje de usuario: pedido + estado actual de la escena. */
export function buildUserMessage(prompt, context) {
  if (!context?.objects?.length) {
    return `${prompt}\n\n(La escena todavía no tiene objetos además del layout base.)`;
  }
  const omitted = context.omitted ? `\n(+${context.omitted} objetos más no listados)` : '';
  return `${prompt}\n\n# Objetos ya presentes en la escena (${context.count})\n${context.objects.map((o) => `- ${o}`).join('\n')}${omitted}\n\nEvitá superponer los objetos nuevos con estos.`;
}

// ------------------------------------------------------------- normalización

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Convierte la respuesta cruda de la IA en definiciones seguras para createObject().
 * Descarta lo que no se puede interpretar en vez de romper la escena.
 */
export function normalizeAiObjects(raw) {
  const list = Array.isArray(raw?.objects) ? raw.objects : [];
  const accepted = [];
  const rejected = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') {
      rejected.push('entrada no es un objeto');
      continue;
    }
    if (!AI_OBJECT_TYPES.includes(item.type)) {
      rejected.push(`tipo desconocido: ${item.type}`);
      continue;
    }

    const def = {
      type: item.type,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : undefined,
      color: typeof item.color === 'string' && HEX.test(item.color.trim()) ? item.color.trim() : undefined,
      layer: AI_LAYERS.includes(item.layer) ? item.layer : undefined,
      position: {
        x: num(item.position?.x),
        y: Math.max(num(item.position?.y), 0), // nunca bajo el piso
        z: num(item.position?.z),
      },
      rotation: { y: num(item.rotation?.y) },
    };

    if (item.scale && (item.scale.x !== undefined || item.scale.y !== undefined || item.scale.z !== undefined)) {
      def.scale = {
        x: Math.max(num(item.scale?.x, 1), 0.01),
        y: Math.max(num(item.scale?.y, 1), 0.01),
        z: Math.max(num(item.scale?.z, 1), 0.01),
      };
    }

    if (item.type === 'route') {
      const points = (Array.isArray(item.routePoints) ? item.routePoints : [])
        .map((p) => ({ x: num(p?.x), y: 0, z: num(p?.z) }));
      if (points.length < 2) {
        rejected.push(`ruta "${def.label ?? 'sin nombre'}" con menos de 2 puntos`);
        continue;
      }
      def.routePoints = points;
      def.position = { x: 0, y: 0, z: 0 }; // los puntos ya están en mundo
      def.dashed = true;
    }

    accepted.push(def);
  }

  return { objects: accepted, rejected };
}

// ---------------------------------------------------------------- transporte

export function getStoredApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) ?? '';
  } catch {
    return ''; // modo privado / storage bloqueado
  }
}

export function setStoredApiKey(key) {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
  } catch {
    /* sin storage: la key vive sólo en memoria durante la sesión */
  }
}

/**
 * Pide objetos a Claude a través del proxy local.
 * @param {string} prompt pedido en lenguaje natural
 * @param {object} context resultado de buildSceneContext()
 * @returns {Promise<{objects:Array, rejected:Array, usage?:object}>}
 */
export async function requestObjects(prompt, context, { signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const key = getStoredApiKey();
  if (key) headers['x-anthropic-key'] = key;

  const response = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({ prompt, context }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // Sin payload JSON el endpoint no es nuestro proxy: pasa al servir el build
    // estático sin backend. Decirlo es más útil que mostrar el código HTTP.
    const detail = payload?.error
      || (payload === null
        ? 'El proxy de IA no está disponible en este host. Corré `npm run dev` para usar el asistente.'
        : `HTTP ${response.status}`);
    const error = new Error(detail);
    error.status = response.status;
    error.needsKey = payload?.needsKey === true;
    throw error;
  }

  const normalized = normalizeAiObjects(payload?.result);
  return { ...normalized, usage: payload?.usage, model: payload?.model };
}
