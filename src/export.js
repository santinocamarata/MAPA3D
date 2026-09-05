/**
 * export.js — Serialización de la escena completa a JSON y carga de vuelta.
 *
 * Se exporta TODO lo que vive en el registro del editor, incluidos los bloques
 * base del campus: así un archivo guardado reconstruye la escena tal cual, sin
 * depender de que el layout pregenerado no cambie entre versiones.
 */

import { CAMERA_HOME, PATIO, ROUTE_WIDTH } from './config.js';

export const SCENE_FORMAT = 'uade-campus-3d';
export const SCENE_VERSION = 1;

function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Convierte un objeto de escena en su definición serializable. */
export function serializeObject(object) {
  const { userData: data } = object;
  const def = {
    id: data.id,
    type: data.type,
    layer: data.layer,
    label: data.label,
    color: data.color,
    position: { x: round(object.position.x), y: round(object.position.y), z: round(object.position.z) },
    rotation: { y: round(object.rotation.y, 5) },
    scale: { x: round(object.scale.x), y: round(object.scale.y), z: round(object.scale.z) },
  };

  if (data.type === 'route') {
    def.routePoints = (data.routePoints ?? []).map((p) => ({ x: round(p.x), y: 0, z: round(p.z) }));
    def.dashed = data.dashed !== false;
    def.width = data.width ?? ROUTE_WIDTH;
  }

  return def;
}

/** Serializa la escena entera (objetos + cámara + metadatos). */
export function serializeScene(editor, ctx) {
  return {
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    savedAt: new Date().toISOString(),
    units: 'meters',
    patio: { minX: PATIO.minX, maxX: PATIO.maxX, minZ: PATIO.minZ, maxZ: PATIO.maxZ },
    camera: ctx
      ? {
        position: { x: round(ctx.camera.position.x), y: round(ctx.camera.position.y), z: round(ctx.camera.position.z) },
        target: { x: round(ctx.controls.target.x), y: round(ctx.controls.target.y), z: round(ctx.controls.target.z) },
      }
      : { position: CAMERA_HOME.position, target: CAMERA_HOME.target },
    layers: { ...editor.layerVisibility },
    objects: editor.objects.map(serializeObject),
  };
}

/** Valida la forma general de un archivo de escena antes de aplicarlo. */
export function validateScene(data) {
  if (!data || typeof data !== 'object') return 'El archivo no contiene un objeto JSON.';
  if (data.format && data.format !== SCENE_FORMAT) return `Formato desconocido: ${data.format}`;
  if (!Array.isArray(data.objects)) return 'Falta el arreglo "objects".';
  return null;
}

/**
 * Reemplaza la escena actual por la del JSON.
 * @returns {{count:number}} cantidad de objetos cargados
 */
export function applyScene(data, editor, ctx) {
  const error = validateScene(data);
  if (error) throw new Error(error);

  editor.clear();

  if (data.layers) {
    for (const [layer, visible] of Object.entries(data.layers)) {
      if (editor.layerVisibility[layer] !== undefined) editor.layerVisibility[layer] = !!visible;
    }
    editor.emit('layers', editor.layerVisibility);
  }

  const created = editor.addMany(data.objects);

  if (ctx && data.camera?.position && data.camera?.target) {
    ctx.camera.position.set(data.camera.position.x, data.camera.position.y, data.camera.position.z);
    ctx.controls.target.set(data.camera.target.x, data.camera.target.y, data.camera.target.z);
    ctx.controls.update();
  }

  return { count: created.length };
}

/** Dispara la descarga del JSON en el navegador. */
export function downloadScene(data, filename = 'campus-uade.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Liberar en el próximo tick: Safari necesita que la URL siga viva durante el click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Abre el selector de archivos y devuelve el JSON parseado. */
export function pickSceneFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(await file.text()));
      } catch (err) {
        reject(new Error(`No se pudo leer el JSON: ${err.message}`));
      }
    });
    input.click();
  });
}
