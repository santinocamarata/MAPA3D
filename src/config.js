/**
 * Constantes espaciales del campus UADE.
 *
 * IMPORTANTE: este módulo NO importa Three.js. Es JS puro para que también pueda
 * importarlo el proxy de Node (vite.config.js) y así construir el System Prompt de
 * la IA con exactamente las mismas dimensiones que renderiza la escena.
 *
 * ESCALA: 1 unidad de Three.js = 1 metro. Sin excepciones.
 * Ejes: X = este/oeste, Z = norte/sur (Z negativo = norte), Y = altura.
 */

export const METERS = 1;

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
 * Patio central: rectángulo abierto rodeado por los bloques perimetrales.
 * Es el bounding box que la IA usa para resolver ubicaciones relativas.
 */
export const PATIO = {
  minX: -30,
  maxX: 30,
  minZ: -22,
  maxZ: 22,
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

/**
 * Bloques perimetrales del campus. Cada uno es una o más cajas grises simples.
 * `footprint` está en metros: [ancho X, alto Y, profundidad Z].
 * `position` es el centro de la planta en el piso (y siempre apoya en y = 0).
 */
export const CAMPUS_BLOCKS = [
  {
    id: 'lima',
    name: 'Bloque Lima',
    description: 'Ala norte, entrada principal sobre Av. Lima.',
    volumes: [
      { footprint: [60, 34, 18], position: { x: 0, z: -31 } },
      { footprint: [16, 42, 10], position: { x: -18, z: -28 } },
    ],
  },
  {
    id: 'chile',
    name: 'Bloque Chile',
    description: 'Ala sur, aulas y biblioteca.',
    volumes: [
      { footprint: [60, 26, 16], position: { x: 0, z: 30 } },
      { footprint: [22, 32, 12], position: { x: 16, z: 28 } },
    ],
  },
  {
    id: 'independencia',
    name: 'Bloque Independencia',
    description: 'Ala oeste, oficinas y administración.',
    volumes: [
      { footprint: [18, 28, 80], position: { x: -39, z: 0 } },
    ],
  },
  {
    id: 'salta',
    name: 'Bloque Salta',
    description: 'Ala este, aulas y talleres.',
    volumes: [
      { footprint: [16, 22, 80], position: { x: 38, z: 0 } },
    ],
  },
  {
    id: 'labs',
    name: 'Bloque Labs',
    description: 'Anexo de laboratorios, al noreste, separado del anillo principal.',
    volumes: [
      { footprint: [24, 15, 28], position: { x: 58, z: -24 } },
      { footprint: [10, 9, 14], position: { x: 58, z: -6 } },
    ],
  },
];

/**
 * Puntos de referencia con nombre. La IA los usa para resolver prompts del tipo
 * "trazá una ruta desde la entrada Lima hasta Labs".
 */
export const LANDMARKS = [
  { id: 'entrada-lima', name: 'Entrada Lima', position: { x: 0, y: 0, z: -21 } },
  { id: 'entrada-chile', name: 'Entrada Chile', position: { x: 0, y: 0, z: 21 } },
  { id: 'entrada-independencia', name: 'Entrada Independencia', position: { x: -29, y: 0, z: 0 } },
  { id: 'entrada-salta', name: 'Entrada Salta', position: { x: 29, y: 0, z: 0 } },
  { id: 'centro-patio', name: 'Centro del patio', position: { x: 0, y: 0, z: 0 } },
  { id: 'acceso-labs', name: 'Acceso Labs', position: { x: 46, y: 0, z: -18 } },
];

/** Extensión total del terreno (para el piso, la grilla y la cámara de sombras). */
export const GROUND = {
  size: 260,
  patioColor: '#4a6b52',
  pavementColor: '#474d57',
};

/** Encuadre inicial de cámara: vista aérea oblicua estilo Google Maps 3D. */
export const CAMERA_HOME = {
  position: { x: 62, y: 150, z: 116 },
  target: { x: 0, y: 0, z: 0 },
};

export const ROUTE_HEIGHT = 0.15; // altura del tubo de ruta sobre el piso, en metros
export const ROUTE_WIDTH = 0.9;  // ancho del camino guiado, en metros
