/**
 * campus-data.js — GENERADO. No editar a mano.
 *
 * Contorno real de la parcela de UADE, tomado de OpenStreetMap:
 * way/190536039 "UADE - Universidad Argentina de la Empresa"
 * (amenity=university, Lima 775, CABA).
 * Datos © colaboradores de OpenStreetMap, ODbL 1.0 — https://osm.org/copyright
 *
 * Regenerar con: python3 tools/build-campus.py map.osm src/campus-data.js
 *
 * Origen (0,0) = centroide de la parcela, -34.6170623, -58.3825416.
 * x crece al ESTE, z crece al SUR, 1 unidad = 1 metro.
 * Superficie de la parcela: 10,824 m².
 */

/** Vértices de la parcela, en metros. Polígono cerrado (el último une con el primero). */
export const PARCEL = [
  { x: -38.0, z: 60.9 },
  { x: -39.1, z: 36.4 },
  { x: -12.2, z: 35.7 },
  { x: -13.3, z: 9.0 },
  { x: -21.9, z: 9.4 },
  { x: -22.5, z: -6.5 },
  { x: -23.8, z: -6.4 },
  { x: -40.2, z: -5.8 },
  { x: -41.3, z: -27.5 },
  { x: -24.6, z: -28.2 },
  { x: -23.3, z: -28.2 },
  { x: -23.6, z: -35.8 },
  { x: -24.6, z: -54.3 },
  { x: 34.4, z: -57.0 },
  { x: 35.4, z: -36.0 },
  { x: 48.7, z: -36.6 },
  { x: 74.5, z: -37.8 },
  { x: 78.4, z: 45.2 },
  { x: 57.3, z: 46.2 },
  { x: 57.8, z: 56.4 },
];

/** Profundidad de crujía usada para derivar el anillo perimetral, en metros. */
export const BUILDING_DEPTH = 20.0;

/**
 * Un volumen por arista de la parcela: se apoya sobre el borde real y crece
 * hacia adentro. `wing` es la calle que enfrenta.
 */
export const PERIMETER_SEGMENTS = [
  { wing: 'salta', x: -28.56, z: 48.2, length: 24.52, angle: -1.61566 },
  { wing: 'salta', x: -25.39, z: 46.05, length: 26.91, angle: -0.02602 },
  { wing: 'salta', x: -2.76, z: 21.94, length: 26.72, angle: -1.61197 },
  { wing: 'salta', x: -18.06, z: -0.79, length: 8.61, angle: 3.09511 },
  { wing: 'salta', x: -12.21, z: 1.07, length: 15.91, angle: -1.60851 },
  { wing: 'salta', x: -32.37, z: -16.09, length: 16.41, angle: 3.10502 },
  { wing: 'salta', x: -30.76, z: -17.16, length: 21.73, angle: -1.62144 },
  { wing: 'salta', x: -32.53, z: -17.86, length: 16.71, angle: -0.04189 },
  { wing: 'salta', x: -13.46, z: -32.39, length: 7.61, angle: -1.61025 },
  { wing: 'chile', x: -14.11, z: -45.59, length: 18.53, angle: -1.6248 },
  { wing: 'chile', x: 5.36, z: -45.66, length: 59.06, angle: -0.04573 },
  { wing: 'chile', x: 24.91, z: -46.02, length: 21.02, angle: 1.52321 },
  { wing: 'chile', x: 42.5, z: -26.31, length: 13.31, angle: -0.04508 },
  { wing: 'lima', x: 62.06, z: -27.21, length: 25.83, angle: -0.04648 },
  { wing: 'lima', x: 66.46, z: 4.17, length: 83.09, angle: 1.52384 },
  { wing: 'lima', x: 67.38, z: 35.71, length: 21.12, angle: 3.09423 },
  { wing: 'independencia', x: 47.56, z: 51.79, length: 10.21, angle: 1.52182 },
  { wing: 'independencia', x: 9.43, z: 48.66, length: 95.91, angle: 3.09465 },
];

/** Zona libre interior tras descontar la crujía: el patio. Derivada, no medida. */
export const PATIO_BOUNDS = { minX: -6, maxX: 57, minZ: -36, maxZ: 38 };
