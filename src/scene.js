/**
 * scene.js — Escena Three.js, cámara orbital, luces con sombras, piso del patio,
 * grilla de referencia y el doble renderer (WebGL + CSS2D para los POIs).
 *
 * Escala estricta: 1 unidad = 1 metro.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { CAMERA_HOME, GROUND, PATIO } from './config.js';

/**
 * Construye el contexto de render completo.
 * @param {HTMLElement} container elemento que hospeda el viewport
 */
export function createSceneContext(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0f1218');
  // Niebla lejana para dar profundidad sin tapar el campus (que mide ~200 m).
  scene.fog = new THREE.Fog('#0f1218', 220, 520);

  // ---------------------------------------------------------------- renderers
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.domElement.classList.add('viewport-canvas');
  renderer.domElement.setAttribute('role', 'application');
  renderer.domElement.setAttribute('aria-label', 'Vista 3D del campus UADE');
  container.appendChild(renderer.domElement);

  // CSS2DRenderer dibuja las etiquetas de los POIs como HTML por encima del canvas.
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.classList.add('viewport-labels');
  container.appendChild(labelRenderer.domElement);

  // ------------------------------------------------------------------ cámara
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2000);
  camera.position.set(CAMERA_HOME.position.x, CAMERA_HOME.position.y, CAMERA_HOME.position.z);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.screenSpacePanning = false;
  controls.minDistance = 12;
  controls.maxDistance = 480;
  // Nunca bajar del horizonte: mantiene la sensación de mapa 3D.
  controls.maxPolarAngle = THREE.MathUtils.degToRad(84);
  controls.target.set(CAMERA_HOME.target.x, CAMERA_HOME.target.y, CAMERA_HOME.target.z);
  controls.update();

  // ------------------------------------------------------------------- luces
  const hemi = new THREE.HemisphereLight('#9fc4ff', '#3a3327', 0.36);
  hemi.position.set(0, 120, 0);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight('#ffffff', 0.1);
  scene.add(ambient);

  // Sol direccional: la sombra tiene que cubrir todo el campus (~260 m).
  const sun = new THREE.DirectionalLight('#fff2d5', 1.9);
  sun.position.set(70, 110, 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  const shadowExtent = 130;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  // Evita el "shadow acne" en superficies grandes y planas como el patio.
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  // -------------------------------------------------------------------- piso
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);

  const pavement = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND.size, GROUND.size),
    new THREE.MeshStandardMaterial({ color: GROUND.pavementColor, roughness: 0.95, metalness: 0 }),
  );
  pavement.rotation.x = -Math.PI / 2;
  pavement.receiveShadow = true;
  pavement.name = 'pavement';
  pavement.userData.pickable = false;
  world.add(pavement);

  // Plano verde del patio central, apenas elevado para no pelearse con el pavimento.
  const patio = new THREE.Mesh(
    new THREE.PlaneGeometry(PATIO.width, PATIO.depth),
    new THREE.MeshStandardMaterial({ color: GROUND.patioColor, roughness: 0.9, metalness: 0 }),
  );
  patio.rotation.x = -Math.PI / 2;
  patio.position.set(PATIO.center.x, 0.02, PATIO.center.z);
  patio.receiveShadow = true;
  patio.name = 'patio';
  patio.userData.pickable = false;
  world.add(patio);

  // ------------------------------------------------------------------ grilla
  // Divisiones de 2 m: referencia de escala real sin producir muaré al alejarse.
  const grid = new THREE.GridHelper(PATIO.width, PATIO.width / 2, '#a9c6d6', '#7b95a6');
  grid.position.set(PATIO.center.x, 0.04, PATIO.center.z);
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  grid.material.depthWrite = false;
  grid.name = 'patio-grid';
  world.add(grid);

  // Plano invisible que recibe los clicks del suelo (para colocar rutas y POIs).
  const pickPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND.size, GROUND.size),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  pickPlane.rotation.x = -Math.PI / 2;
  pickPlane.name = 'ground-pick-plane';
  pickPlane.userData.pickable = false;
  scene.add(pickPlane);

  // ------------------------------------------------------- contenedor de objetos
  // Todo lo que el usuario (o la IA) agrega vive acá, separado del decorado.
  const objectRoot = new THREE.Group();
  objectRoot.name = 'objects';
  scene.add(objectRoot);

  // ------------------------------------------------------------------- resize
  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
  }
  resize();

  new ResizeObserver(resize).observe(container);
  window.addEventListener('resize', resize);

  // -------------------------------------------------------------------- loop
  const beforeRender = new Set();
  function onBeforeRender(fn) {
    beforeRender.add(fn);
    return () => beforeRender.delete(fn);
  }

  function tick() {
    requestAnimationFrame(tick);
    controls.update();
    for (const fn of beforeRender) fn();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  tick();

  function resetCamera() {
    camera.position.set(CAMERA_HOME.position.x, CAMERA_HOME.position.y, CAMERA_HOME.position.z);
    controls.target.set(CAMERA_HOME.target.x, CAMERA_HOME.target.y, CAMERA_HOME.target.z);
    controls.update();
  }

  function setGridVisible(visible) {
    grid.visible = visible;
  }

  function setShadowsEnabled(enabled) {
    renderer.shadowMap.enabled = enabled;
    sun.castShadow = enabled;
    // Los materiales ya compilados necesitan recompilarse al cambiar el shadowMap.
    scene.traverse((node) => {
      if (node.isMesh && node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) material.needsUpdate = true;
      }
    });
  }

  return {
    scene,
    objectRoot,
    camera,
    renderer,
    controls,
    sun,
    grid,
    pickPlane,
    onBeforeRender,
    resetCamera,
    setGridVisible,
    setShadowsEnabled,
  };
}
