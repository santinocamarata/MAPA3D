# Campus UADE · Editor 3D

Editor 3D interactivo para mapear el campus de UADE (vista exterior + patio central),
pensado como base para la navegación de estudiantes.

Escala real estricta: **1 unidad de Three.js = 1 metro**.

## Stack

- **Three.js** para el render 3D (WebGL + `CSS2DRenderer` para las etiquetas de POIs)
- **Vite** como bundler y dev server
- **Vanilla JS** en módulos ES, sin frameworks de UI
- **Claude API** (`claude-sonnet-4-6`) para la generación asistida de objetos

## Puesta en marcha

```bash
npm install
cp .env.example .env      # completá ANTHROPIC_API_KEY
npm run dev               # http://localhost:5173
```

La API key es opcional para usar el editor: sólo hace falta para el panel de IA.
Se puede configurar de dos formas:

1. `ANTHROPIC_API_KEY` en `.env` (recomendado).
2. Pegándola en el panel **Asistente IA → ⚙︎**, que la guarda en el `localStorage`
   del navegador.

En ambos casos la key vive del lado del servidor de Vite: el navegador nunca llama
a `api.anthropic.com` directamente y la key no entra al bundle.

## Arquitectura

```
index.html            shell de la UI (topbar, sidebars, viewport)
vite.config.js        config + montaje del proxy de IA
tools/
  build-campus.py     genera campus-data.js desde un volcado de OpenStreetMap
server/
  aiProxy.js          plugin de Vite: expone POST /api/ai y llama a Claude con el SDK oficial
src/
  main.js             entry point: arma escena + editor + UI y siembra el campus
  campus-data.js      GENERADO: contorno real de la parcela desde OpenStreetMap
  config.js           constantes espaciales del campus (JS puro, sin Three.js)
  scene.js            escena, cámara orbital, luces, sombras, piso, grilla, renderers
  objects.js          catálogo de objetos y factory functions (incluye rutas y marcadores)
  editor.js           selección, TransformControls, capas, trazado de rutas y POIs
  ai.js               System Prompt, JSON Schema, transporte y normalización de la respuesta
  ui.js               sidebars, panel de propiedades, panel de IA
  export.js           serialización a JSON y carga de vuelta
  styles.css          tema oscuro
```

`config.js` es la única fuente de verdad de la geometría del campus. Lo importan
tanto la escena como el System Prompt de la IA, así que el contexto espacial que
recibe Claude nunca se desincroniza de lo que se está renderizando.

## Escena base

La planta **no está inventada**: sale del contorno real de la parcela de UADE en
OpenStreetMap (`way/190536039`, `amenity=university`, Lima 775, CABA). Datos ©
colaboradores de OpenStreetMap, [ODbL 1.0](https://osm.org/copyright).

- Parcela de **10.824 m²**, 20 vértices, 120 × 118 m.
- Cuatro alas nombradas por la calle que enfrentan, con los lados que dice OSM:
  **Lima** al este, **Chile** al norte, **Salta** al oeste y
  **Av. Independencia** al sur.
- 18 volúmenes, uno por arista de la parcela: cada uno se apoya sobre el borde
  real y crece 20 m hacia adentro.
- El **patio de 63 × 74 m** no está dibujado a mano: es lo que queda libre al
  descontar la crujía perimetral del contorno.
- `GridHelper` de 2 m por división sobre el patio, ocultable desde la topbar.

Iluminación: una `DirectionalLight` que simula el sol, con
`renderer.shadowMap.enabled = true` y `castShadow`/`receiveShadow` en todos los
objetos.

### Lo único estimado: las alturas

Ningún edificio de la parcela tiene `building:levels` cargado en OSM, así que las
alturas de `WING_HEIGHTS` (`src/config.js`) son valores plausibles, no medidos.
Es el número a corregir con fotos o con la cantidad real de pisos; todo lo demás
de la planta viene del dato.

### Regenerar la planta

```bash
curl "https://api.openstreetmap.org/api/0.6/map?bbox=-58.3840,-34.6195,-58.3792,-34.6155" -o map.osm
python3 tools/build-campus.py map.osm src/campus-data.js
```

`src/campus-data.js` es generado y no se edita a mano.

## Uso

| Acción | Cómo |
| --- | --- |
| Orbitar / zoom / paneo | Mouse o touch sobre el viewport |
| Agregar objeto | Botones del panel **Herramientas** (aparece donde mira la cámara) |
| Seleccionar | Click sobre el objeto |
| Mover / rotar / escalar | `G` / `R` / `S`, o los botones de la topbar |
| Eliminar | `Supr` o el botón del panel de propiedades |
| Deseleccionar / cancelar | `Esc` |
| Trazar ruta | **Ruta** → clicks en el piso → `Enter` o doble click |
| Colocar marcador | **Marcador** → click en el piso |
| Mostrar/ocultar capas | Checkboxes del panel **Capas** |
| Guardar / cargar | **Exportar JSON** / **Importar JSON** |

Capas disponibles: Estructura, Vegetación, Mobiliario, Señalética y Rutas.

## Asistente de IA

El panel derecho traduce pedidos en español a objetos de escena, por ejemplo:

- «agregá una fuente circular en el centro del patio»
- «trazá una ruta desde la entrada Lima hasta Labs»
- «poné una hilera de 6 árboles a lo largo del lado oeste del patio»

El System Prompt incluye el bounding box del patio, la posición y el volumen de
cada bloque, los puntos de referencia con nombre y el tamaño natural de cada tipo
de objeto, para que Claude resuelva ubicaciones relativas correctamente.

La respuesta se pide con **structured outputs** (`output_config.format`), así que
llega garantizada como JSON con esta forma:

```json
{
  "objects": [
    {
      "type": "tree|bench|fountain|lamp|building|box|cylinder|sphere|stairs|route|poi",
      "position": { "x": 0, "y": 0, "z": 0 },
      "scale": { "x": 1, "y": 1, "z": 1 },
      "rotation": { "y": 0 },
      "color": "#4a7c59",
      "layer": "vegetation|structure|furniture|signage|routes",
      "label": "Árbol principal",
      "routePoints": [{ "x": 0, "y": 0, "z": 0 }, { "x": 5, "y": 0, "z": 5 }]
    }
  ]
}
```

`routePoints` sólo se usa cuando `type` es `"route"`; en el resto de los tipos es
`null`. Todo lo que llega se valida antes de instanciarse: los objetos con tipo
desconocido o rutas con menos de dos puntos se descartan y se reportan en el log
del panel, en vez de romper la escena.

El modelo se puede cambiar con `ANTHROPIC_MODEL` en el `.env`.

## Formato de escena

`Exportar JSON` guarda la escena entera —bloques base incluidos—, junto con las
capas visibles y la posición de la cámara. Como los bloques del campus se crean con
la misma factory que el resto de los objetos, importar un archivo reconstruye la
escena exactamente como estaba.

## Notas

- El endpoint `/api/ai` lo sirve un plugin de Vite, así que funciona en `npm run dev`
  y en `npm run preview`. Un despliegue estático de `dist/` sirve el editor pero no
  el asistente: para eso hace falta portar `server/aiProxy.js` a un backend propio.
- Sin TypeScript, sin SSR, sin routing y sin librerías de UI externas.
