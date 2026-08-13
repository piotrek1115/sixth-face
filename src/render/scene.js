import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  SRGBColorSpace,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  Vector3,
} from 'three';
import { buildBoard, TILE } from './board.js';
import { BOARD_SIZE } from '../core/board.js';

export function createSceneRig(canvas) {
  const scene = new Scene();
  scene.background = null;

  const camera = new PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
  // "Lekko z góry, taktyczna, czytelna" — pulled back and steepened toward
  // top-down for a clearer tactical read of the whole board.
  //
  // Derived from the board's actual extent rather than hard-coded: the
  // framing was tuned on a 6x6 grid and enlarging the board silently pushed
  // the home rows out of shot. The ratios below reproduce the tuned 6x6 view
  // (height 18, offset 6) and now follow whatever BOARD_SIZE is.
  const span = BOARD_SIZE * TILE;
  camera.position.set(0, span * 1.875, span * 0.625);
  camera.lookAt(new Vector3(0, 0, 0));

  // alpha:true so empty space (scene.background stays null) shows the page's
  // CSS background through the canvas — otherwise WebGL clears to opaque
  // black regardless of theme, which only ever matched the dark one.
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // window.innerWidth/innerHeight can read 0 at first synchronous script
  // execution in some embedded preview contexts (the layout hasn't settled
  // yet), which would freeze the camera with a NaN/zero aspect forever since
  // nothing else triggers a resize. Re-apply sizing defensively: now, and
  // again on the next animation frame once layout is guaranteed to be real.
  function applySize() {
    const w = window.innerWidth || canvas.parentElement?.clientWidth || 1280;
    const h = window.innerHeight || canvas.parentElement?.clientHeight || 720;
    if (w <= 0 || h <= 0) return false;
    renderer.setSize(w, h); // updateStyle=true — sets canvas CSS size explicitly,
    // never relying on inset:0 stretch behavior alone.
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    return true;
  }
  applySize();
  requestAnimationFrame(() => { if (!applySize()) requestAnimationFrame(applySize); });

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  scene.add(new AmbientLight(0xaabbdd, 0.55));
  const sun = new DirectionalLight(0xfff2df, 1.4);
  sun.position.set(5, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -6;
  sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -6;
  scene.add(sun);

  const board = buildBoard();
  scene.add(board);

  window.addEventListener('resize', applySize);

  return { scene, camera, renderer, board };
}
