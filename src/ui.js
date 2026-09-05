/**
 * ui.js — Cablea el DOM del index.html con el editor: herramientas, capas,
 * lista de objetos, panel de propiedades y panel de IA.
 */

import { LAYERS, LAYER_IDS, PATIO } from './config.js';
import { OBJECT_CATALOG, TOOL_GROUPS } from './objects.js';
import {
  buildSceneContext,
  getStoredApiKey,
  requestObjects,
  setStoredApiKey,
} from './ai.js';
import { applyScene, downloadScene, pickSceneFile, serializeScene } from './export.js';

const $ = (selector) => document.querySelector(selector);

const TOOL_ICONS = {
  box: '🧊', cylinder: '🥫', sphere: '⚪', building: '🏢',
  tree: '🌳', bench: '🪑', lamp: '💡', fountain: '⛲', stairs: '🪜',
};

export function createUI({ ctx, editor, onResetScene }) {
  const statusEl = $('#status-message');
  let statusTimer = null;

  function setStatus(message, { sticky = false } = {}) {
    statusEl.textContent = message;
    clearTimeout(statusTimer);
    if (!sticky) {
      statusTimer = setTimeout(() => {
        statusEl.textContent = 'Listo. Escala 1 unidad = 1 metro.';
      }, 4000);
    }
  }

  // =================================================================== tools

  /** Dónde cae un objeto nuevo: el punto que la cámara está mirando. */
  function placementPoint() {
    const { x, z } = ctx.controls.target;
    // Clamp al patio ampliado para que nunca aparezca fuera del campus.
    return {
      x: Math.round(clamp(x, PATIO.minX - 40, PATIO.maxX + 40) * 10) / 10,
      y: 0,
      z: Math.round(clamp(z, PATIO.minZ - 40, PATIO.maxZ + 40) * 10) / 10,
    };
  }

  const toolGroupsEl = $('#tool-groups');
  for (const group of TOOL_GROUPS) {
    const heading = document.createElement('p');
    heading.className = 'group-label';
    heading.textContent = group.label;
    toolGroupsEl.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'tool-grid';
    for (const type of group.tools) {
      const entry = OBJECT_CATALOG[type];
      const button = document.createElement('button');
      button.className = 'tool';
      button.type = 'button';
      button.innerHTML = `<span class="tool-icon">${TOOL_ICONS[type] ?? '▫️'}</span><span class="tool-label">${entry.label}</span>`;
      button.addEventListener('click', () => {
        editor.setMode('select');
        const object = editor.add({ type, position: placementPoint() });
        editor.select(object);
        setStatus(`${entry.label} agregado en (${object.position.x}, ${object.position.z}).`);
      });
      grid.appendChild(button);
    }
    toolGroupsEl.appendChild(grid);
  }

  const routeTool = $('#tool-route');
  const poiTool = $('#tool-poi');
  const modeHud = $('#mode-hud');
  const draftActions = $('#draft-actions');
  const draftCount = $('#draft-count');

  routeTool.addEventListener('click', () => {
    if (editor.mode === 'route') editor.setMode('select');
    else editor.startRoute();
  });

  poiTool.addEventListener('click', () => {
    editor.setMode(editor.mode === 'poi' ? 'select' : 'poi');
  });

  $('#btn-draft-undo').addEventListener('click', () => editor.undoRoutePoint());
  $('#btn-draft-finish').addEventListener('click', () => editor.finishRoute());

  editor.on('mode', (mode) => {
    routeTool.classList.toggle('is-active', mode === 'route');
    poiTool.classList.toggle('is-active', mode === 'poi');
    draftActions.hidden = mode !== 'route';

    const hud = {
      route: 'Trazando ruta · click para agregar puntos · Enter para terminar',
      poi: 'Colocando marcador · click en el piso',
    }[mode];
    modeHud.hidden = !hud;
    if (hud) modeHud.textContent = hud;
  });

  editor.on('routeDraft', (points) => {
    draftCount.textContent = `${points.length} ${points.length === 1 ? 'punto' : 'puntos'}`;
  });

  // ================================================================== capas

  const layerListEl = $('#layer-list');
  const layerCounts = {};

  for (const id of LAYER_IDS) {
    const layer = LAYERS[id];
    const item = document.createElement('li');
    item.className = 'layer-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      editor.setLayerVisible(id, checkbox.checked);
      setStatus(`Capa ${layer.label}: ${checkbox.checked ? 'visible' : 'oculta'}.`);
    });

    const swatch = document.createElement('span');
    swatch.className = 'layer-swatch';
    swatch.style.background = layer.color;

    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = layer.label;

    const count = document.createElement('span');
    count.className = 'layer-count';
    count.textContent = '0';
    layerCounts[id] = count;

    item.append(checkbox, swatch, name, count);
    item.addEventListener('click', (event) => {
      if (event.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    });
    layerListEl.appendChild(item);
  }

  editor.on('layers', (visibility) => {
    layerListEl.querySelectorAll('input').forEach((input, index) => {
      input.checked = visibility[LAYER_IDS[index]] !== false;
    });
  });

  // ======================================================== lista de objetos

  const objectListEl = $('#object-list');
  const objectCountEl = $('#object-count');

  function refreshObjectList() {
    objectListEl.replaceChildren();
    // Los más recientes arriba: es lo que el usuario acaba de tocar.
    for (const object of [...editor.objects].reverse()) {
      const { userData: data } = object;
      const item = document.createElement('li');
      item.className = 'object-item';
      item.classList.toggle('is-selected', editor.selected === object);
      item.title = `${data.label} · ${OBJECT_CATALOG[data.type].label}`;

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = LAYERS[data.layer]?.color ?? '#888';

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = data.label;

      const type = document.createElement('span');
      type.className = 'type';
      type.textContent = OBJECT_CATALOG[data.type].label;

      item.append(dot, name, type);
      item.addEventListener('click', () => {
        editor.setMode('select');
        editor.select(object);
      });
      objectListEl.appendChild(item);
    }

    objectCountEl.textContent = String(editor.objects.length);
    const counts = editor.countByLayer();
    for (const id of LAYER_IDS) layerCounts[id].textContent = String(counts[id]);
  }

  // ============================================================ propiedades

  const propertiesEl = $('#properties');
  let syncTransformInputs = null;

  function renderProperties(object) {
    propertiesEl.replaceChildren();
    syncTransformInputs = null;

    if (!object) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Seleccioná un objeto en el viewport para editarlo.';
      propertiesEl.appendChild(empty);
      return;
    }

    const { userData: data } = object;
    const isRoute = data.type === 'route';

    const meta = document.createElement('div');
    meta.className = 'prop-meta';
    meta.innerHTML = `<span class="type-pill">${OBJECT_CATALOG[data.type].label}</span><span>${
      isRoute ? `${data.routePoints?.length ?? 0} puntos` : `id ${data.id.slice(0, 12)}`
    }</span>`;
    propertiesEl.appendChild(meta);

    // ---- nombre
    const labelInput = field(propertiesEl, 'Nombre', 'text', data.label);
    labelInput.addEventListener('input', () => {
      editor.updateSelected({ label: labelInput.value });
    });

    // ---- capa
    const layerSelect = document.createElement('select');
    for (const id of LAYER_IDS) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = LAYERS[id].label;
      option.selected = id === data.layer;
      layerSelect.appendChild(option);
    }
    wrapField(propertiesEl, 'Capa', layerSelect);
    layerSelect.addEventListener('change', () => editor.updateSelected({ layer: layerSelect.value }));

    // ---- posición
    const position = vecField(propertiesEl, 'Posición (m)', ['x', 'y', 'z'], [
      object.position.x, object.position.y, object.position.z,
    ]);
    for (const input of position) {
      input.addEventListener('input', () => {
        editor.updateSelected({
          position: { x: numOf(position[0]), y: numOf(position[1]), z: numOf(position[2]) },
        });
      });
    }

    // ---- rotación (en grados, más legible que radianes)
    const rotation = vecField(propertiesEl, 'Rotación Y (grados)', ['y'], [
      round(radToDeg(object.rotation.y), 1),
    ]);
    rotation[0].addEventListener('input', () => {
      editor.updateSelected({ rotation: { y: degToRad(numOf(rotation[0])) } });
    });

    // ---- escala (las rutas se transforman como grupo, pero escalarlas deforma
    //      el ancho del tubo; se permite igual y se avisa en el hint)
    const scale = vecField(propertiesEl, 'Escala', ['x', 'y', 'z'], [
      round(object.scale.x, 3), round(object.scale.y, 3), round(object.scale.z, 3),
    ]);
    for (const input of scale) {
      input.addEventListener('input', () => {
        editor.updateSelected({
          scale: { x: numOf(scale[0], 1), y: numOf(scale[1], 1), z: numOf(scale[2], 1) },
        });
      });
    }

    // ---- color
    const colorInput = field(propertiesEl, 'Color', 'color', normalizeHex(data.color));
    colorInput.addEventListener('input', () => editor.updateSelected({ color: colorInput.value }));

    // ---- opciones de ruta
    if (isRoute) {
      const row = document.createElement('label');
      row.className = 'checkbox-row';
      const dashed = document.createElement('input');
      dashed.type = 'checkbox';
      dashed.checked = data.dashed !== false;
      dashed.addEventListener('change', () => editor.updateSelected({ dashed: dashed.checked }));
      const text = document.createElement('span');
      text.textContent = 'Línea punteada';
      row.append(dashed, text);
      propertiesEl.appendChild(row);
    }

    // ---- acciones
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; gap:6px; margin-top:12px;';

    const focusBtn = document.createElement('button');
    focusBtn.className = 'btn btn-sm';
    focusBtn.textContent = 'Centrar cámara';
    focusBtn.addEventListener('click', () => {
      ctx.controls.target.copy(object.position);
      ctx.controls.update();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-sm btn-danger';
    deleteBtn.textContent = 'Eliminar';
    deleteBtn.addEventListener('click', () => {
      const name = object.userData.label;
      editor.remove(object);
      setStatus(`"${name}" eliminado.`);
    });

    actions.append(focusBtn, deleteBtn);
    propertiesEl.appendChild(actions);

    // Actualiza los números mientras se arrastra el gizmo, sin recrear el DOM
    // (recrearlo perdería el foco del input que el usuario esté editando).
    syncTransformInputs = () => {
      if (document.activeElement?.tagName === 'INPUT') return;
      position[0].value = round(object.position.x, 2);
      position[1].value = round(object.position.y, 2);
      position[2].value = round(object.position.z, 2);
      rotation[0].value = round(radToDeg(object.rotation.y), 1);
      scale[0].value = round(object.scale.x, 3);
      scale[1].value = round(object.scale.y, 3);
      scale[2].value = round(object.scale.z, 3);
    };
  }

  // ==================================================================== IA

  const aiPrompt = $('#ai-prompt');
  const aiSend = $('#btn-ai-send');
  const aiStatus = $('#ai-status');
  const aiLog = $('#ai-log');
  const aiKeyPanel = $('#ai-key');
  const aiKeyInput = $('#ai-key-input');

  aiKeyInput.value = getStoredApiKey();

  $('#btn-ai-settings').addEventListener('click', () => {
    aiKeyPanel.hidden = !aiKeyPanel.hidden;
  });

  $('#btn-ai-key-save').addEventListener('click', () => {
    setStoredApiKey(aiKeyInput.value.trim());
    aiKeyPanel.hidden = true;
    setAiStatus(aiKeyInput.value.trim() ? 'API key guardada.' : 'API key borrada.', 'ok');
  });

  for (const chip of document.querySelectorAll('.chip[data-prompt]')) {
    chip.addEventListener('click', () => {
      aiPrompt.value = chip.dataset.prompt;
      aiPrompt.focus();
    });
  }

  function setAiStatus(text, kind = '') {
    aiStatus.textContent = text;
    aiStatus.className = `ai-status${kind ? ` is-${kind}` : ''}`;
  }

  function logAi(text, kind = '', meta = '') {
    const entry = document.createElement('div');
    entry.className = `ai-entry${kind ? ` is-${kind}` : ''}`;
    entry.textContent = text;
    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.className = 'ai-entry-meta';
      metaEl.textContent = meta;
      entry.appendChild(metaEl);
    }
    aiLog.prepend(entry);
  }

  async function sendPrompt() {
    const prompt = aiPrompt.value.trim();
    if (!prompt) {
      setAiStatus('Escribí qué querés agregar.', 'error');
      return;
    }

    aiSend.disabled = true;
    setAiStatus('Pensando…');
    logAi(prompt, 'user');

    try {
      const { objects, rejected, usage, model } = await requestObjects(prompt, buildSceneContext(editor));

      if (!objects.length) {
        setAiStatus('Sin objetos que agregar.', 'error');
        logAi('La IA no devolvió objetos para este pedido.', 'error');
        return;
      }

      const created = editor.addMany(objects);
      editor.select(created[created.length - 1]);
      aiPrompt.value = '';

      const summary = created
        .map((object) => `${OBJECT_CATALOG[object.userData.type].label}: ${object.userData.label}`)
        .join('\n');
      const tokens = usage ? ` · ${usage.input_tokens ?? '?'}→${usage.output_tokens ?? '?'} tokens` : '';
      logAi(summary, '', `${created.length} objeto(s)${model ? ` · ${model}` : ''}${tokens}`);

      if (rejected.length) logAi(`Descartados: ${rejected.join('; ')}`, 'error');
      setAiStatus(`${created.length} objeto(s) agregados.`, 'ok');
      setStatus(`IA: ${created.length} objeto(s) agregados a la escena.`);
    } catch (err) {
      setAiStatus(err.message, 'error');
      logAi(err.message, 'error');
      if (err.needsKey) aiKeyPanel.hidden = false;
    } finally {
      aiSend.disabled = false;
    }
  }

  aiSend.addEventListener('click', sendPrompt);
  aiPrompt.addEventListener('keydown', (event) => {
    // Ctrl/Cmd + Enter envía; Enter solo hace salto de línea.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sendPrompt();
    }
  });

  // ================================================================ topbar

  const transformButtons = [...document.querySelectorAll('[data-transform]')];
  for (const button of transformButtons) {
    button.addEventListener('click', () => editor.setTransformMode(button.dataset.transform));
  }

  editor.on('transformMode', (mode) => {
    for (const button of transformButtons) {
      button.classList.toggle('is-active', button.dataset.transform === mode);
    }
  });

  $('#toggle-grid').addEventListener('change', (event) => ctx.setGridVisible(event.target.checked));
  $('#toggle-shadows').addEventListener('change', (event) => {
    ctx.setShadowsEnabled(event.target.checked);
    setStatus(`Sombras ${event.target.checked ? 'activadas' : 'desactivadas'}.`);
  });
  $('#btn-reset-camera').addEventListener('click', () => ctx.resetCamera());

  $('#btn-export').addEventListener('click', () => {
    const data = serializeScene(editor, ctx);
    downloadScene(data, `campus-uade-${new Date().toISOString().slice(0, 10)}.json`);
    setStatus(`Escena exportada: ${data.objects.length} objetos.`);
  });

  $('#btn-import').addEventListener('click', async () => {
    try {
      const data = await pickSceneFile();
      if (!data) return;
      const { count } = applyScene(data, editor, ctx);
      setStatus(`Escena importada: ${count} objetos.`);
    } catch (err) {
      setStatus(`Error al importar: ${err.message}`, { sticky: true });
    }
  });

  $('#btn-reset-scene').addEventListener('click', () => {
    if (!window.confirm('¿Volver al layout base del campus? Se pierde todo lo agregado.')) return;
    onResetScene();
    ctx.resetCamera();
    setStatus('Escena reiniciada al layout base.');
  });

  // ========================================================= suscripciones

  editor.on('selection', (object) => {
    renderProperties(object);
    refreshObjectList();
  });

  editor.on('change', () => {
    refreshObjectList();
  });

  editor.on('transform', () => {
    syncTransformInputs?.();
  });

  editor.on('layers', refreshObjectList);

  refreshObjectList();
  renderProperties(null);

  return { setStatus, refreshObjectList };
}

// ------------------------------------------------------------------ helpers

function wrapField(parent, labelText, control) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = labelText;
  wrapper.append(label, control);
  parent.appendChild(wrapper);
  return control;
}

function field(parent, labelText, type, value) {
  const input = document.createElement('input');
  input.type = type;
  input.value = value ?? '';
  return wrapField(parent, labelText, input);
}

function vecField(parent, labelText, axes, values) {
  const row = document.createElement('div');
  row.className = 'vec-row';
  if (axes.length === 1) row.style.gridTemplateColumns = '1fr';

  const inputs = axes.map((axis, index) => {
    const cell = document.createElement('div');
    cell.className = 'vec-cell';
    const tag = document.createElement('span');
    tag.textContent = axis.toUpperCase();
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.1';
    input.value = values[index];
    cell.append(tag, input);
    row.appendChild(cell);
    return input;
  });

  wrapField(parent, labelText, row);
  return inputs;
}

function numOf(input, fallback = 0) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function radToDeg(radians) { return (radians * 180) / Math.PI; }
function degToRad(degrees) { return (degrees * Math.PI) / 180; }

/** <input type="color"> sólo acepta #rrggbb: normaliza #rgb y descarta alpha. */
function normalizeHex(hex) {
  if (typeof hex !== 'string') return '#888888';
  const value = hex.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  if (/^#[0-9a-f]{8}$/i.test(value)) return value.slice(0, 7);
  return '#888888';
}
