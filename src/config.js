/**
 * Constantes espaciales del campus UADE.
 *
 * La planta NO está inventada: sale de `campus-data.js`, generado desde el
 * contorno real de la parcela en OpenStreetMap (way/190536039, Lima 775, CABA).
 * Lo único estimado son las ALTURAS — ver WING_HEIGHTS.
 *
 * Este módulo no importa Three.js: es JS puro para que también lo pueda leer el
 * proxy de Node y construir el System Prompt de la IA con la misma geometría que
 * se renderiza.
 *
 * ESCALA: 1 unidad de Three.js = 1 metro. Sin excepciones.
 * Ejes: X = este/oeste, Z = norte/sur (Z positivo = sur), Y = altura.
 */

import {
  BUILDING_DEPTH,
  PARCEL,
  PATIO_BOUNDS,
  PERIMETER_SEGMENTS,
} from './campus-data.js';

export { BUILDING_DEPTH, PARCEL, PERIMETER_SEGMENTS };

/** Capas del editor. El orden define el orden de la UI. */
export const LAYERS = {
  structure: { id: 'structure', label: 'Estructura', color: '#8b95a5' },
  vegetation: { id: 'vegetation', label: 'Vegetación', color: '#4a7c59' },
  furniture: { id: 'furniture', label: 'Mobiliario', color: '#b08968' },
  signage: { id: 'signage', label: 'Señalética', color: '#e0a458' },
  routes: { id: 'routes', label: 'Rutas', color: '#4d9de0' },
};

export const LAYER_IDS = Object.keys(LAYERS);

/**
 * Alas del campus, nombradas por la calle que enfrentan. Los lados salen de OSM:
 * Lima al ESTE, Chile al NORTE, Salta al OESTE, Av. Independencia al SUR.
 */
export const WINGS = {
  lima: { id: 'lima', name: 'Bloque Lima', street: 'Lima', side: 'este' },
  chile: { id: 'chile', name: 'Bloque Chile', street: 'Chile', side: 'norte' },
  salta: { id: 'salta', name: 'Bloque Salta', street: 'Salta', side: 'oeste' },
  independencia: {
    id: 'independencia',
    name: 'Bloque Independencia',
    street: 'Av. Independencia',
    side: 'sur',
  },
};

/**
 * ALTURAS ESTIMADAS, en metros. Este es el único dato que NO viene de OSM:
 * ningún edificio de la parcela tiene `building:levels` cargado. Son valores
 * plausibles para un campus urbano de esta escala, puestos para que la escena
 * se lea. Ajustar con fotos o con la cantidad real de pisos.
 */
export const WING_HEIGHTS = {
  lima: 34,
  chile: 28,
  salta: 24,
  independencia: 30,
};

/**
 * Patio central: la zona interior que queda libre tras descontar la crujía
 * perimetral. Derivada del contorno real, no medida en obra. Es el bounding box
 * que la IA usa para resolver ubicaciones relativas.
 */
export const PATIO = {
  ...PATIO_BOUNDS,
  get width() {
    return this.maxX - this.minX;
  },
  get depth() {
    return this.maxZ - this.minZ;
  },
  get center() {
    return { x: (this.minX + this.maxX) / 2, y: 0, z: (this.minZ + this.maxZ) / 2 };
  },
};

/** Accesos al patio desde cada ala, más su centro. Derivados del patio. */
export const LANDMARKS = (() => {
  const c = PATIO.center;
  return [
    { id: 'entrada-lima', name: 'Entrada Lima', position: { x: PATIO.maxX, y: 0, z: c.z } },
    { id: 'entrada-salta', name: 'Entrada Salta', position: { x: PATIO.minX, y: 0, z: c.z } },
    { id: 'entrada-chile', name: 'Entrada Chile', position: { x: c.x, y: 0, z: PATIO.minZ } },
    { id: 'entrada-independencia', name: 'Entrada Independencia', position: { x: c.x, y: 0, z: PATIO.maxZ } },
    { id: 'centro-patio', name: 'Centro del patio', position: { x: c.x, y: 0, z: c.z } },
  ];
})();

/** Extensión del terreno circundante, para el piso y la cámara de sombras. */
export const GROUND = {
  size: 320,
  patioColor: '#4a6b52',
  pavementColor: '#474d57',
};

/** Encuadre inicial: vista aérea oblicua centrada en el patio. */
export const CAMERA_HOME = {
  position: { x: PATIO.center.x + 62, y: 168, z: PATIO.center.z + 128 },
  target: { x: PATIO.center.x, y: 0, z: PATIO.center.z },
};

export const ROUTE_HEIGHT = 0.15; // altura del tubo de ruta sobre el piso, en metros
export const ROUTE_WIDTH = 0.9;  // ancho del camino guiado, en metros
