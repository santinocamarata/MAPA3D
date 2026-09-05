/**
 * main.js — Entry point. Arma la escena, el editor y la UI, y siembra el layout
 * base del campus UADE.
 */

import { createSceneContext } from './scene.js';
import { Editor } from './editor.js';
import { campusBlockDefinitions } from './objects.js';
import { createUI } from './ui.js';
import { LANDMARKS } from './config.js';

const viewport = document.getElementById('viewport');
const ctx = createSceneContext(viewport);
const editor = new Editor(ctx);

/** Siembra los bloques perimetrales y algunos POIs de referencia. */
function seedCampus() {
  editor.clear();
  editor.addMany(campusBlockDefinitions());

  // POIs de las entradas: le dan sentido al campus desde el primer render.
  editor.addMany(
    LANDMARKS.filter((landmark) => landmark.id.startsWith('entrada-')).map((landmark) => ({
      id: `landmark-${landmark.id}`,
      type: 'poi',
      layer: 'signage',
      label: landmark.name,
      position: landmark.position,
    })),
  );

  editor.select(null);
}

seedCampus();

const ui = createUI({ ctx, editor, onResetScene: seedCampus });

ui.setStatus(`Campus UADE cargado · ${editor.objects.length} objetos · 1 unidad = 1 metro.`);

// Útil para depurar desde la consola del navegador.
if (import.meta.env?.DEV) {
  window.__uade = { ctx, editor, ui };
}
