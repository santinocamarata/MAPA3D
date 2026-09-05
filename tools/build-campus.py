"""
Genera src/campus-data.js desde datos crudos de OpenStreetMap.

Fuente: way/190536039 "UADE - Universidad Argentina de la Empresa" (amenity=university,
Lima 775, CABA). Datos © colaboradores de OpenStreetMap, ODbL 1.0.

Descargar la entrada con:
  curl "https://api.openstreetmap.org/api/0.6/map?bbox=-58.3840,-34.6195,-58.3792,-34.6155" -o map.osm

Uso:  python3 tools/build-campus.py map.osm src/campus-data.js
"""
import math
import sys
import xml.etree.ElementTree as ET

CAMPUS_WAY = '190536039'
BUILDING_DEPTH = 20.0   # profundidad de crujía del anillo perimetral, en metros
EARTH_M_PER_DEG = 111320.0


def load_polygon(path):
    root = ET.parse(path).getroot()
    nodes = {n.get('id'): (float(n.get('lat')), float(n.get('lon'))) for n in root.findall('node')}
    way = next(w for w in root.findall('way') if w.get('id') == CAMPUS_WAY)
    coords = [nodes[nd.get('ref')] for nd in way.findall('nd') if nd.get('ref') in nodes]

    lat0 = sum(c[0] for c in coords) / len(coords)
    lon0 = sum(c[1] for c in coords) / len(coords)
    m_lon = EARTH_M_PER_DEG * math.cos(math.radians(lat0))
    # x crece al este, z crece al sur (convención de la escena)
    pts = [((lon - lon0) * m_lon, -(lat - lat0) * EARTH_M_PER_DEG) for lat, lon in coords]
    if pts[0] == pts[-1]:
        pts.pop()
    return [(round(x, 1), round(z, 1)) for x, z in pts], (lat0, lon0)


def point_in_polygon(pt, poly):
    x, z = pt
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
    return inside


def outward_normals(poly):
    """Normal unitaria hacia afuera de cada arista.

    El sentido se decide arista por arista: se corre el punto medio un poco
    sobre la perpendicular y se mira si cayó adentro. Un único test global para
    todo el polígono no sirve acá, porque la parcela tiene muescas y el sentido
    correcto no es el mismo en todas las aristas.
    """
    normals = []
    for i in range(len(poly)):
        (x1, z1), (x2, z2) = poly[i], poly[(i + 1) % len(poly)]
        dx, dz = x2 - x1, z2 - z1
        length = math.hypot(dx, dz) or 1.0
        nx, nz = dz / length, -dx / length
        mx, mz = (x1 + x2) / 2, (z1 + z2) / 2
        if point_in_polygon((mx + nx * 0.1, mz + nz * 0.1), poly):
            nx, nz = -nx, -nz
        normals.append((nx, nz))
    return normals


def wing_for(midpoint, bounds):
    """Ala a la que pertenece una arista: la calle que tiene mas cerca.

    Se decide por POSICION, no por la normal. La parcela tiene muescas, y una
    pared metida en una muesca del oeste puede apuntar al este: su normal diria
    "Lima" cuando estructuralmente es parte del ala Salta.
    """
    mx, mz = midpoint
    minx, maxx, minz, maxz = bounds
    return min((
        (maxx - mx, 'lima'),            # Lima corre por el este
        (mx - minx, 'salta'),           # Salta por el oeste
        (mz - minz, 'chile'),           # Chile por el norte
        (maxz - mz, 'independencia'),   # Av. Independencia por el sur
    ))[1]


def courtyard_bbox(poly, depth):
    """Zona libre: puntos del interior a más de `depth` de toda arista.

    Erosión por muestreo en grilla de 1 m. Evita implementar offset de polígonos
    para un dato que se calcula una sola vez, en tiempo de build.
    """
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    keep = []
    for x in range(int(min(xs)), int(max(xs)) + 1):
        for z in range(int(min(zs)), int(max(zs)) + 1):
            if not point_in_polygon((x, z), poly):
                continue
            if min(dist_to_segment((x, z), poly[i], poly[(i + 1) % len(poly)])
                   for i in range(len(poly))) >= depth:
                keep.append((x, z))
    if not keep:
        return None
    kx = [p[0] for p in keep]
    kz = [p[1] for p in keep]
    return {'minX': min(kx), 'maxX': max(kx), 'minZ': min(kz), 'maxZ': max(kz)}


def dist_to_segment(p, a, b):
    px, pz = p
    ax, az = a
    bx, bz = b
    dx, dz = bx - ax, bz - az
    denom = dx * dx + dz * dz
    t = 0.0 if denom == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / denom))
    return math.hypot(px - (ax + t * dx), pz - (az + t * dz))


def main(osm_path, out_path):
    poly, origin = load_polygon(osm_path)
    normals = outward_normals(poly)

    bounds = (min(p[0] for p in poly), max(p[0] for p in poly),
              min(p[1] for p in poly), max(p[1] for p in poly))

    segments = []
    for i, (nx, nz) in enumerate(normals):
        (x1, z1), (x2, z2) = poly[i], poly[(i + 1) % len(poly)]
        length = math.hypot(x2 - x1, z2 - z1)
        if length < 2.0:
            continue  # aristas de quiebre: no merecen un volumen propio
        # El bloque se apoya sobre la arista y crece hacia adentro.
        segments.append({
            'wing': wing_for(((x1 + x2) / 2, (z1 + z2) / 2), bounds),
            'x': round((x1 + x2) / 2 - nx * BUILDING_DEPTH / 2, 2),
            'z': round((z1 + z2) / 2 - nz * BUILDING_DEPTH / 2, 2),
            'length': round(length, 2),
            'angle': round(math.atan2(z2 - z1, x2 - x1), 5),
        })

    patio = courtyard_bbox(poly, BUILDING_DEPTH)
    area = abs(sum(poly[i][0] * poly[i - 1][1] - poly[i - 1][0] * poly[i][1]
                   for i in range(len(poly)))) / 2

    js = f'''/**
 * campus-data.js — GENERADO. No editar a mano.
 *
 * Contorno real de la parcela de UADE, tomado de OpenStreetMap:
 * way/{CAMPUS_WAY} "UADE - Universidad Argentina de la Empresa"
 * (amenity=university, Lima 775, CABA).
 * Datos © colaboradores de OpenStreetMap, ODbL 1.0 — https://osm.org/copyright
 *
 * Regenerar con: python3 tools/build-campus.py map.osm src/campus-data.js
 *
 * Origen (0,0) = centroide de la parcela, {origin[0]:.7f}, {origin[1]:.7f}.
 * x crece al ESTE, z crece al SUR, 1 unidad = 1 metro.
 * Superficie de la parcela: {area:,.0f} m².
 */

/** Vértices de la parcela, en metros. Polígono cerrado (el último une con el primero). */
export const PARCEL = {fmt_points(poly)};

/** Profundidad de crujía usada para derivar el anillo perimetral, en metros. */
export const BUILDING_DEPTH = {BUILDING_DEPTH};

/**
 * Un volumen por arista de la parcela: se apoya sobre el borde real y crece
 * hacia adentro. `wing` es la calle que enfrenta.
 */
export const PERIMETER_SEGMENTS = [
{chr(10).join(f"  {{ wing: '{s['wing']}', x: {s['x']}, z: {s['z']}, length: {s['length']}, angle: {s['angle']} }}," for s in segments)}
];

/** Zona libre interior tras descontar la crujía: el patio. Derivada, no medida. */
export const PATIO_BOUNDS = {{ minX: {patio['minX']}, maxX: {patio['maxX']}, minZ: {patio['minZ']}, maxZ: {patio['maxZ']} }};
'''
    open(out_path, 'w').write(js)

    print(f'parcela: {len(poly)} vértices, {area:,.0f} m²')
    print(f'segmentos: {len(segments)}')
    for w in ('lima', 'chile', 'salta', 'independencia'):
        n = sum(1 for s in segments if s['wing'] == w)
        m = sum(s['length'] for s in segments if s['wing'] == w)
        print(f'  {w:15} {n:2} volúmenes, {m:6.1f} m de frente')
    print(f"patio: x {patio['minX']}..{patio['maxX']}  z {patio['minZ']}..{patio['maxZ']}"
          f"  ({patio['maxX']-patio['minX']} x {patio['maxZ']-patio['minZ']} m)")


def fmt_points(poly):
    rows = ',\n'.join(f'  {{ x: {x}, z: {z} }}' for x, z in poly)
    return '[\n' + rows + ',\n]'


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
