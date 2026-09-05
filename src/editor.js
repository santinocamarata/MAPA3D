/**
 * editor.js — Selección, TransformControls, capas y herramientas de colocación
 * (rutas y marcadores). Es el dueño del registro de objetos de la escena.
 */

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

import { LAYER_IDS, ROUTE_HEIGHT } from './config.js';
import {
  createObject,
  disposeSubtree,
  rebuildRoute,
  setObjectColor,
  updatePoiLabel,
} from './objects.js';

const CLICK_DRAG_TOLERANCE = 5; // px: por encima de esto, el gesto fue orbitar
const DRAFT_BUFFER_POINTS = 256; // capacidad inicial del buffer de la vista previa

export class Editor {
  constructor(ctx) {
    this.ctx = ctx;
    this.objects = [];
    this.selected = null;
    this.mode = 'select'; // 'select' | 'route' | 'poi'
    this.transformMode = 'translate';
    this.listeners = new Map();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.layerVisibility = Object.fromEntries(LAYER_IDS.map((id) => [id, true]));

    this.#setupTransformControls();
    this.#setupSelectionOutline();
    this.#setupRouteDrafting();
    this.#bindInput();
  }

  // ------------------------------------------------------------- eventos
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  // --------------------------------------------------- setup interno
  #setupTransformControls() {
    const { camera, renderer, scene, controls } = this.ctx;
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.9);
    transform.setTranslationSnap(null);

    // En three >= r169 TransformControls ya no es un Object3D: el gizmo se agrega
    // vía getHelper(). El fallback mantiene compatibilidad con versiones previas.
    scene.add(typeof transform.getHelper === 'function' ? transform.getHelper() : transform);

    // Mientras se arrastra el gizmo, la cámara no debe orbitar.
    transform.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
      this.draggingGizmo = event.value;
      if (!event.value) this.emit('transform', this.selected);
    });

    transform.addEventListener('objectChange', () => {
      this.outline?.update();
      this.emit('transform', this.selected);
    });

    this.transform = transform;
  }

  #setupSelectionOutline() {
    const outline = new THREE.BoxHelper(new THREE.Object3D(), '#4d9de0');
    outline.material.depthTest = false;
    outline.material.transparent = true;
    outline.material.opacity = 0.9;
    outline.visible = false;
    outline.renderOrder = 999;
    this.ctx.scene.add(outline);
    this.outline = outline;

    // El bounding box se recalcula por frame: cubre animaciones y transformaciones.
    this.ctx.onBeforeRender(() => {
      if (this.selected && outline.visible) outline.setFromObject(this.selected);
    });
  }

  #setupRouteDrafting() {
    this.draftPoints = [];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(DRAFT_BUFFER_POINTS * 3), 3),
    );
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: '#7fd1ff', depthTest: false, transparent: true, opacity: 0.95 }),
    );
    line.frustumCulled = false;
    line.visible = false;
    line.renderOrder = 998;
    this.ctx.scene.add(line);
    this.draftLine = line;

    this.draftMarkers = new THREE.Group();
    this.draftMarkers.visible = false;
    this.ctx.scene.add(this.draftMarkers);
  }

  #bindInput() {
    const dom = this.ctx.renderer.domElement;
    let downAt = null;

    dom.addEventListener('pointerdown', (event) => {
      downAt = { x: event.clientX, y: event.clientY };
    });

    dom.addEventListener('pointerup', (event) => {
      if (!downAt || this.draggingGizmo) {
        downAt = null;
        return;
      }
      const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
      downAt = null;
      if (moved > CLICK_DRAG_TOLERANCE) return; // fue un orbit/pan, no un click
      this.#handleClick(event);
    });

    dom.addEventListener('dblclick', () => {
      if (this.mode === 'route') this.finishRoute();
    });

    window.addEventListener('keydown', (event) => {
      // No secuestrar el teclado mientras se escribe en la UI.
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) return;

      switch (event.key) {
        case 'Escape':
          if (this.mode !== 'select') this.setMode('select');
          else this.select(null);
          break;
        case 'Delete':
        case 'Backspace':
          if (this.selected) {
            event.preventDefault();
            this.remove(this.selected);
          }
          break;
        case 'g': case 'G': this.setTransformMode('translate'); break;
        case 'r': case 'R': this.setTransformMode('rotate'); break;
        case 's': case 'S': this.setTransformMode('scale'); break;
        case 'Enter':
          if (this.mode === 'route') this.finishRoute();
          break;
        default:
          break;
      }
    });
  }

  // ----------------------------------------------------------- raycasting
  #updatePointer(event) {
    const rect = this.ctx.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.ctx.camera);
  }

  /** Punto del piso (y = 0) bajo el cursor, o null si el rayo no lo cruza. */
  groundPoint(event) {
    this.#updatePointer(event);
    const hits = this.raycaster.intersectObject(this.ctx.pickPlane, false);
    return hits.length ? hits[0].point : null;
  }

  /** Objeto registrado bajo el cursor (sube por el árbol hasta la raíz registrada). */
  pick(event) {
    this.#updatePointer(event);
    const visible = this.objects.filter((object) => object.visible);
    const hits = this.raycaster.intersectObjects(visible, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData?.pickable) node = node.parent;
      if (node) return node;
    }
    return null;
  }

  #handleClick(event) {
    if (this.mode === 'route') {
      const point = this.groundPoint(event);
      if (point) this.addRoutePoint(point);
      return;
    }

    if (this.mode === 'poi') {
      const point = this.groundPoint(event);
      if (point) {
        const object = this.add({
          type: 'poi',
          label: 'Nuevo marcador',
          position: { x: round(point.x), y: 0, z: round(point.z) },
        });
        this.setMode('select');
        this.select(object);
      }
      return;
    }

    this.select(this.pick(event));
  }

  // --------------------------------------------------------------- modos
  setMode(mode) {
    if (this.mode === mode) return;
    if (this.mode === 'route' && mode !== 'route') this.cancelRoute();
    this.mode = mode;
    if (mode !== 'select') this.select(null);
    this.ctx.renderer.domElement.style.cursor = mode === 'select' ? 'default' : 'crosshair';
    this.emit('mode', mode);
  }

  setTransformMode(mode) {
    this.transformMode = mode;
    this.transform.setMode(mode);
    this.emit('transformMode', mode);
  }

  // ----------------------------------------------------------- selección
  select(object) {
    if (object && !object.userData?.pickable) object = null;
    this.selected = object ?? null;

    if (this.selected) {
      this.transform.attach(this.selected);
      this.transform.setMode(this.transformMode);
      this.outline.visible = true;
      this.outline.setFromObject(this.selected);
    } else {
      this.transform.detach();
      this.outline.visible = false;
    }
    this.emit('selection', this.selected);
  }

  // --------------------------------------------------------- CRUD objetos
  /** Crea y agrega un objeto a la escena. */
  add(def) {
    const object = createObject(def);
    object.visible = this.layerVisibility[object.userData.layer] !== false;
    this.ctx.objectRoot.add(object);
    this.objects.push(object);
    this.emit('change', { type: 'add', object });
    return object;
  }

  /** Agrega varios objetos de una (import / respuesta de la IA). */
  addMany(defs) {
    const created = defs.map((def) => {
      const object = createObject(def);
      object.visible = this.layerVisibility[object.userData.layer] !== false;
      this.ctx.objectRoot.add(object);
      this.objects.push(object);
      return object;
    });
    if (created.length) this.emit('change', { type: 'add-many', objects: created });
    return created;
  }

  remove(object) {
    const index = this.objects.indexOf(object);
    if (index === -1) return;
    if (this.selected === object) this.select(null);
    this.objects.splice(index, 1);
    this.ctx.objectRoot.remove(object);
    disposeSubtree(object);
    this.emit('change', { type: 'remove', object });
  }

  clear() {
    this.select(null);
    for (const object of [...this.objects]) {
      this.ctx.objectRoot.remove(object);
      disposeSubtree(object);
    }
    this.objects = [];
    this.emit('change', { type: 'clear' });
  }

  /** Aplica cambios de propiedades al objeto seleccionado. */
  updateSelected(patch) {
    const object = this.selected;
    if (!object) return;

    if (patch.position) object.position.set(patch.position.x, patch.position.y, patch.position.z);
    if (patch.rotation) object.rotation.y = patch.rotation.y;
    if (patch.scale) object.scale.set(patch.scale.x || 0.01, patch.scale.y || 0.01, patch.scale.z || 0.01);

    if (patch.color) setObjectColor(object, patch.color);

    if (patch.label !== undefined) {
      object.userData.label = patch.label;
      object.name = patch.label;
      if (object.userData.type === 'poi') updatePoiLabel(object, patch.label);
    }

    if (patch.layer && patch.layer !== object.userData.layer) {
      object.userData.layer = patch.layer;
      object.visible = this.layerVisibility[patch.layer] !== false;
    }

    if (patch.dashed !== undefined && object.userData.type === 'route') {
      object.userData.dashed = patch.dashed;
      rebuildRoute(object);
    }

    this.outline.setFromObject(object);
    // Sólo 'change': emitir 'selection' haría que la UI reconstruyera el panel de
    // propiedades en cada pulsación, destruyendo el input que se está tipeando.
    this.emit('change', { type: 'update', object });
  }

  // -------------------------------------------------------------- capas
  setLayerVisible(layer, visible) {
    this.layerVisibility[layer] = visible;
    for (const object of this.objects) {
      if (object.userData.layer === layer) object.visible = visible;
    }
    if (this.selected && !this.selected.visible) this.select(null);
    this.emit('layers', this.layerVisibility);
  }

  countByLayer() {
    const counts = Object.fromEntries(LAYER_IDS.map((id) => [id, 0]));
    for (const object of this.objects) {
      if (counts[object.userData.layer] !== undefined) counts[object.userData.layer] += 1;
    }
    return counts;
  }

  // -------------------------------------------------------- rutas (draft)
  startRoute() {
    this.draftPoints = [];
    this.#refreshDraft();
    this.setMode('route');
  }

  addRoutePoint(point) {
    this.draftPoints.push({ x: round(point.x), y: 0, z: round(point.z) });
    this.#refreshDraft();
    this.emit('routeDraft', this.draftPoints);
  }

  undoRoutePoint() {
    this.draftPoints.pop();
    this.#refreshDraft();
    this.emit('routeDraft', this.draftPoints);
  }

  finishRoute() {
    if (this.draftPoints.length < 2) {
      this.cancelRoute();
      return null;
    }
    const object = this.add({
      type: 'route',
      label: `Ruta ${this.objects.filter((o) => o.userData.type === 'route').length + 1}`,
      routePoints: this.draftPoints,
      dashed: true,
    });
    this.draftPoints = [];
    this.#refreshDraft();
    this.setMode('select');
    this.select(object);
    return object;
  }

  cancelRoute() {
    this.draftPoints = [];
    this.#refreshDraft();
    this.emit('routeDraft', this.draftPoints);
  }

  #refreshDraft() {
    const points = this.draftPoints;
    const line = this.draftLine;

    // El buffer crece si hace falta: truncar dejaría la vista previa mostrando
    // menos tramos de los que la ruta realmente tiene.
    if (points.length > line.geometry.attributes.position.count) {
      const capacity = Math.max(points.length * 2, DRAFT_BUFFER_POINTS);
      line.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(capacity * 3), 3),
      );
    }

    const positions = line.geometry.attributes.position;
    const count = points.length;
    for (let i = 0; i < count; i += 1) {
      positions.setXYZ(i, points[i].x, ROUTE_HEIGHT + 0.05, points[i].z);
    }
    positions.needsUpdate = true;
    line.geometry.setDrawRange(0, count);
    line.geometry.computeBoundingSphere();
    line.visible = count >= 2;

    // Marcadores de vértice: se reconstruyen porque son pocos y de vida corta.
    for (const child of [...this.draftMarkers.children]) {
      this.draftMarkers.remove(child);
      disposeSubtree(child);
    }
    for (const point of points) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 8),
        new THREE.MeshBasicMaterial({ color: '#7fd1ff', depthTest: false }),
      );
      marker.position.set(point.x, ROUTE_HEIGHT + 0.05, point.z);
      marker.renderOrder = 998;
      this.draftMarkers.add(marker);
    }
    this.draftMarkers.visible = points.length > 0;
  }
}

function round(value) {
  return Math.round(value * 100) / 100;
}
