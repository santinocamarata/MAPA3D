/**
 * objects.js — Catálogo de objetos y factory functions.
 *
 * Toda entidad de la escena (incluidos los bloques base del campus) se crea con
 * `createObject(def)`. Eso hace que exportar/importar sea un round-trip completo:
 * no hay objetos "mágicos" que el JSON no pueda describir.
 *
 * Convención de origen: la geometría de cada objeto apoya en y = 0, es decir que
 * `position.y = 0` deja el objeto sobre el piso. La escala es un multiplicador
 * sobre el tamaño natural en metros (salvo `box`/`building`, cuyo tamaño natural
 * es 1 m³, por lo que su escala ES su dimensión en metros).
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import {
  BUILDING_DEPTH,
  LAYERS,
  PERIMETER_SEGMENTS,
  ROUTE_HEIGHT,
  ROUTE_WIDTH,
  WINGS,
  WING_HEIGHTS,
} from './config.js';

let idCounter = 0;
export function nextId(prefix = 'obj') {
  idCounter += 1;
  return `${prefix}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function standard(color, { roughness = 0.75, metalness = 0.05, ...rest } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...rest });
}

/** Marca un mesh como "tintable": su color sigue al color del objeto. */
function tint(mesh) {
  mesh.userData.tintable = true;
  return mesh;
}

/** Habilita sombras en todo el subárbol. */
export function enableShadows(object) {
  object.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return object;
}

// ---------------------------------------------------------------- primitivas

function buildBox(color) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0); // origen en la base
  return tint(new THREE.Mesh(geometry, standard(color)));
}

function buildCylinder(color) {
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
  geometry.translate(0, 0.5, 0);
  return tint(new THREE.Mesh(geometry, standard(color)));
}

function buildSphere(color) {
  const geometry = new THREE.SphereGeometry(0.5, 24, 16);
  geometry.translate(0, 0.5, 0);
  return tint(new THREE.Mesh(geometry, standard(color)));
}

// ------------------------------------------------------------------ catálogo

function buildTree(color) {
  const group = new THREE.Group();

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.22, 2.4, 10),
    standard('#6b4f3a', { roughness: 0.95 }),
  );
  trunk.position.y = 1.2;
  group.add(trunk);

  // Copa: tres esferas irregulares, ~5.5 m de alto total.
  const canopyMaterial = standard(color, { roughness: 0.9, flatShading: true });
  const blobs = [
    { r: 1.75, y: 3.5, x: 0, z: 0 },
    { r: 1.15, y: 4.4, x: 0.6, z: -0.35 },
    { r: 1.0, y: 3.1, x: -0.85, z: 0.5 },
  ];
  for (const blob of blobs) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(blob.r, 1), canopyMaterial);
    mesh.position.set(blob.x, blob.y, blob.z);
    tint(mesh);
    group.add(mesh);
  }
  return group;
}

function buildBench(color) {
  const group = new THREE.Group();
  const wood = standard(color, { roughness: 0.85 });
  const metal = standard('#2f333a', { roughness: 0.5, metalness: 0.6 });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), wood);
  seat.position.y = 0.45;
  group.add(tint(seat));

  const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.07), wood);
  back.position.set(0, 0.72, -0.21);
  group.add(tint(back));

  for (const x of [-0.75, 0.75]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.45), metal);
    leg.position.set(x, 0.225, 0);
    group.add(leg);
  }
  return group;
}

function buildLamp(color) {
  const group = new THREE.Group();
  const poleMaterial = standard('#31363f', { roughness: 0.45, metalness: 0.7 });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 12), poleMaterial);
  base.position.y = 0.15;
  group.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4, 12), poleMaterial);
  pole.position.y = 2.3;
  group.add(pole);

  // La luminaria "brilla" con emissive: barato y sin texturas.
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 12),
    standard(color, { roughness: 0.35, emissive: new THREE.Color(color), emissiveIntensity: 0.9 }),
  );
  head.position.y = 4.4;
  group.add(tint(head));
  return group;
}

function buildFountain(color) {
  const group = new THREE.Group();
  const stone = standard('#9aa3ad', { roughness: 0.9 });

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.7, 32), stone);
  basin.position.y = 0.35;
  group.add(basin);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.35, 0.12, 32),
    standard(color, { roughness: 0.15, metalness: 0.35, transparent: true, opacity: 0.85 }),
  );
  water.position.y = 0.68;
  group.add(tint(water));

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 1.6, 16), stone);
  column.position.y = 1.35;
  group.add(column);

  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.35, 0.35, 20), stone);
  bowl.position.y = 2.25;
  group.add(bowl);
  return group;
}

function buildStairs(color) {
  const group = new THREE.Group();
  const material = standard(color, { roughness: 0.9 });
  const steps = 6;
  const rise = 0.18;
  const run = 0.32;
  const width = 3;
  for (let i = 0; i < steps; i += 1) {
    const height = rise * (i + 1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(width, height, run), material);
    step.position.set(0, height / 2, -i * run);
    group.add(tint(step));
  }
  return group;
}

function buildBuilding(color) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(0, 0.5, 0);
  return tint(new THREE.Mesh(geometry, standard(color, { roughness: 0.88, metalness: 0.02 })));
}

// --------------------------------------------------------------------- rutas

function toVector3(point) {
  return new THREE.Vector3(Number(point?.x) || 0, ROUTE_HEIGHT, Number(point?.z) || 0);
}

/**
 * Construye la geometría de una ruta como tubos sobre una curva Catmull-Rom.
 * Si `dashed` es true, la curva se corta en tramos para simular línea punteada
 * manteniendo volumen real (y por lo tanto sombras).
 */
function buildRouteMeshes(points, { color, dashed, width }) {
  const group = new THREE.Group();
  const vectors = points.map(toVector3);
  if (vectors.length < 2) return group;

  const curve = new THREE.CatmullRomCurve3(vectors, false, 'catmullrom', 0.25);
  const length = Math.max(curve.getLength(), 0.001);
  const radius = Math.max(width, 0.05) / 2;
  const material = standard(color, { roughness: 0.6, metalness: 0.1 });

  const addTube = (subCurve, segments) => {
    const geometry = new THREE.TubeGeometry(subCurve, Math.max(segments, 2), radius, 8, false);
    group.add(tint(new THREE.Mesh(geometry, material)));
  };

  // El tubo se aplana en Y para que el camino se lea como una marca pintada sobre
  // el piso y no como un caño. Se sube lo justo para apoyar sin hundirse.
  const flatten = 0.3;
  group.scale.y = flatten;
  group.position.y = radius * flatten - ROUTE_HEIGHT * flatten + 0.02;

  if (!dashed) {
    addTube(curve, Math.ceil(length * 2));
    return group;
  }

  // Muestreo uniforme y agrupado en tramos dibujados/vacíos.
  const dash = 1.2;
  const gap = 0.8;
  const step = 0.2;
  const sampleCount = Math.max(Math.ceil(length / step), 2);
  const samples = curve.getSpacedPoints(sampleCount);
  const period = dash + gap;

  let run = [];
  for (let i = 0; i <= sampleCount; i += 1) {
    const distance = (i / sampleCount) * length;
    const inDash = distance % period < dash;
    if (inDash) {
      run.push(samples[i]);
    } else if (run.length >= 2) {
      addTube(new THREE.CatmullRomCurve3(run), run.length * 2);
      run = [];
    } else {
      run = [];
    }
  }
  if (run.length >= 2) addTube(new THREE.CatmullRomCurve3(run), run.length * 2);

  return group;
}

function buildRoute(def) {
  const group = new THREE.Group();
  const points = Array.isArray(def.routePoints) ? def.routePoints : [];
  group.add(
    buildRouteMeshes(points, {
      color: def.color,
      dashed: def.dashed !== false,
      width: def.width ?? ROUTE_WIDTH,
    }),
  );
  return group;
}

/** Reconstruye la geometría de una ruta tras editar sus puntos. */
export function rebuildRoute(object) {
  if (object.userData.type !== 'route') return object;
  const old = object.children[0];
  if (old) {
    object.remove(old);
    disposeSubtree(old);
  }
  object.add(
    buildRouteMeshes(object.userData.routePoints ?? [], {
      color: object.userData.color,
      dashed: object.userData.dashed !== false,
      width: object.userData.width ?? ROUTE_WIDTH,
    }),
  );
  enableShadows(object);
  return object;
}

// ---------------------------------------------------------------------- POIs

function buildPoi(def) {
  const group = new THREE.Group();

  const pin = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 1.4, 12),
    standard(def.color, { roughness: 0.4, metalness: 0.2 }),
  );
  pin.rotation.x = Math.PI; // punta hacia abajo
  pin.position.y = 0.7;
  group.add(tint(pin));

  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 16, 12),
    standard(def.color, { roughness: 0.35, emissive: new THREE.Color(def.color), emissiveIntensity: 0.35 }),
  );
  knob.position.y = 1.6;
  group.add(tint(knob));

  const element = document.createElement('div');
  element.className = 'poi-label';
  element.textContent = def.label;
  const label = new CSS2DObject(element);
  label.position.set(0, 2.6, 0);
  label.name = 'poi-label';
  group.add(label);

  return group;
}

/** Actualiza el texto HTML de la etiqueta de un POI. */
export function updatePoiLabel(object, text) {
  const label = object.getObjectByName('poi-label');
  if (label?.element) label.element.textContent = text || 'POI';
}

// ------------------------------------------------------------------ catálogo

export const OBJECT_CATALOG = {
  building: { label: 'Edificio', layer: 'structure', color: '#8b95a5', build: (d) => buildBuilding(d.color), naturalScale: [10, 8, 10] },
  box: { label: 'Cubo', layer: 'structure', color: '#7d8794', build: (d) => buildBox(d.color), naturalScale: [2, 2, 2] },
  cylinder: { label: 'Cilindro', layer: 'structure', color: '#7d8794', build: (d) => buildCylinder(d.color), naturalScale: [2, 3, 2] },
  sphere: { label: 'Esfera', layer: 'structure', color: '#7d8794', build: (d) => buildSphere(d.color), naturalScale: [2, 2, 2] },
  tree: { label: 'Árbol', layer: 'vegetation', color: '#4a7c59', build: (d) => buildTree(d.color) },
  bench: { label: 'Banco', layer: 'furniture', color: '#b08968', build: (d) => buildBench(d.color) },
  lamp: { label: 'Farola', layer: 'furniture', color: '#ffe9b0', build: (d) => buildLamp(d.color) },
  fountain: { label: 'Fuente', layer: 'furniture', color: '#4d9de0', build: (d) => buildFountain(d.color) },
  stairs: { label: 'Escalera', layer: 'structure', color: '#9aa3ad', build: (d) => buildStairs(d.color) },
  route: { label: 'Ruta', layer: 'routes', color: '#4d9de0', build: (d) => buildRoute(d) },
  poi: { label: 'Marcador', layer: 'signage', color: '#e0a458', build: (d) => buildPoi(d) },
};

/** Herramientas del panel izquierdo, agrupadas para la UI. */
export const TOOL_GROUPS = [
  {
    id: 'primitives',
    label: 'Primitivas',
    tools: ['box', 'cylinder', 'sphere', 'building'],
  },
  {
    id: 'campus',
    label: 'Elementos del campus',
    tools: ['tree', 'bench', 'lamp', 'fountain', 'stairs'],
  },
];

// ------------------------------------------------------------------- factory

function normalizeVec(value, fallback) {
  return {
    x: Number.isFinite(Number(value?.x)) ? Number(value.x) : fallback,
    y: Number.isFinite(Number(value?.y)) ? Number(value.y) : fallback,
    z: Number.isFinite(Number(value?.z)) ? Number(value.z) : fallback,
  };
}

/**
 * Crea un objeto de escena a partir de una definición serializable.
 * @param {object} def definición (mismo shape que el JSON de export y de la IA)
 * @returns {THREE.Object3D}
 */
export function createObject(def = {}) {
  const type = OBJECT_CATALOG[def.type] ? def.type : 'box';
  const entry = OBJECT_CATALOG[type];

  const color = typeof def.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(def.color)
    ? def.color
    : entry.color;
  const layer = LAYERS[def.layer] ? def.layer : entry.layer;

  const routePoints = type === 'route'
    ? (Array.isArray(def.routePoints) ? def.routePoints : []).map((p) => ({
      x: Number(p?.x) || 0,
      y: 0,
      z: Number(p?.z) || 0,
    }))
    : undefined;

  // El label se resuelve una sola vez: el builder (p. ej. la etiqueta CSS2D del
  // POI) y userData tienen que mostrar exactamente el mismo texto.
  const label = typeof def.label === 'string' && def.label.trim()
    ? def.label.trim()
    : entry.label;

  const resolved = { ...def, type, color, layer, label, routePoints };
  const object = entry.build(resolved);

  object.name = label;
  object.userData = {
    id: def.id || nextId(type),
    type,
    layer,
    color,
    label,
    pickable: true,
  };

  if (type === 'route') {
    object.userData.routePoints = routePoints;
    object.userData.dashed = def.dashed !== false;
    object.userData.width = Number(def.width) || ROUTE_WIDTH;
  }

  const position = normalizeVec(def.position, 0);
  object.position.set(position.x, position.y, position.z);

  // La escala por defecto de box/building es su tamaño natural sugerido en metros.
  const defaultScale = entry.naturalScale && def.scale === undefined
    ? { x: entry.naturalScale[0], y: entry.naturalScale[1], z: entry.naturalScale[2] }
    : { x: 1, y: 1, z: 1 };
  const scale = def.scale === undefined ? defaultScale : normalizeVec(def.scale, 1);
  object.scale.set(scale.x || 1, scale.y || 1, scale.z || 1);

  if (def.rotation) {
    object.rotation.set(
      Number(def.rotation.x) || 0,
      Number(def.rotation.y) || 0,
      Number(def.rotation.z) || 0,
    );
  }

  enableShadows(object);
  return object;
}

/** Cambia el color de un objeto, respetando los meshes no tintables. */
export function setObjectColor(object, hex) {
  object.userData.color = hex;
  const seen = new Set();
  object.traverse((node) => {
    if (!node.isMesh || !node.userData.tintable) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);
      material.color.set(hex);
      if (material.emissive && material.emissiveIntensity > 0) material.emissive.set(hex);
    }
  });
}

/** Libera geometrías y materiales de un subárbol descartado. */
export function disposeSubtree(object) {
  object.traverse((node) => {
    if (node.isCSS2DObject) node.element?.remove();
    if (!node.isMesh) return;
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) material?.dispose();
  });
}

/**
 * Definiciones de los bloques base del campus.
 *
 * Cada arista de la parcela real se levanta como una caja apoyada sobre ese
 * borde y con la profundidad de crujía hacia adentro. La posición y el largo
 * vienen de OpenStreetMap; la altura es la estimación de WING_HEIGHTS.
 */
export function campusBlockDefinitions() {
  const perWing = {};

  return PERIMETER_SEGMENTS.map((segment) => {
    const wing = WINGS[segment.wing];
    perWing[segment.wing] = (perWing[segment.wing] ?? 0) + 1;
    const index = perWing[segment.wing];

    return {
      id: `campus-${segment.wing}-${index}`,
      type: 'building',
      layer: 'structure',
      // Alternar dos grises deja leer dónde termina un volumen y empieza el otro.
      color: index % 2 ? '#8b95a5' : '#79838f',
      label: `${wing.name} ${index}`,
      position: { x: segment.x, y: 0, z: segment.z },
      scale: { x: segment.length, y: WING_HEIGHTS[segment.wing], z: BUILDING_DEPTH },
      // La caja se orienta a lo largo de la arista: su +X local sigue el borde.
      rotation: { y: -segment.angle },
    };
  });
}
