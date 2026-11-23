// The factory floor: a paper diorama standing on the page's graph paper. Matte surfaces, soft shadows,
// machines and agents in ink, people in pine, bug crates in rust. Nothing here invents a colour.
import {
  AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DataTexture, DirectionalLight, DynamicDrawUsage,
  EdgesGeometry, Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, LineBasicMaterial, LineLoop, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, Object3D, OrthographicCamera, PCFShadowMap, PlaneGeometry, Quaternion, Raycaster, RGBAFormat, Scene,
  ShadowMaterial, SphereGeometry, Vector2, Vector3, WebGLRenderer, LinearFilter,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Kind, Station, Visit } from '../engine';
import type { FloorStation, Settings } from '../model/settings';
import { makeLayout, type Layout, type P, type Rect } from './layout';
import { SHIP_HOURS, type FloorState, type Playback } from './playback';

export interface Palette { paper: string; card: string; ink: string; pine: string; rust: string; rule: string; muted: string }
export interface LabelAnchor { x: number; y: number }
export interface FloorScene {
  setFactory(pb: Playback, s: Settings): void;
  /** Draws the floor at sim time t. `snap` skips the easing (after a scrub or a new run). */
  frame(state: FloorState, dt: number, speed: number, snap: boolean): void;
  resize(): void;
  pick(clientX: number, clientY: number): FloorStation | null;
  setHot(hover: FloorStation | null, focus: FloorStation | null): void;
  orbit(dx: number, dy: number): void;
  zoomBy(factor: number, clientX: number, clientY: number): void;
  resetView(): void;
  anchors(): Record<FloorStation, LabelAnchor>;
  dispose(): void;
}

const mix = (a: Color, b: Color, t: number) => a.clone().lerp(b, t);
const tint = (g: BufferGeometry, c: Color) => {
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new BufferAttribute(arr, 3));
  return g;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: Color) => tint(new BoxGeometry(w, h, d).translate(x, y, z), c);
const CRATE = 0.42, CRATE_H = 0.32, SIDE = 0.74;
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function createFloorScene(canvas: HTMLCanvasElement, pal: Palette, opts: { phone: boolean }): FloorScene {
  const C = { paper: new Color(pal.paper), card: new Color(pal.card), ink: new Color(pal.ink), pine: new Color(pal.pine), rust: new Color(pal.rust), rule: new Color(pal.rule), muted: new Color(pal.muted) };
  const maxCrates = opts.phone ? 220 : 520, pileCap = opts.phone ? 20 : 44;

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene();
  const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 200);

  const hemi = new HemisphereLight(0xffffff, C.rule, 1);
  const amb = new AmbientLight(0xffffff, 1);
  const sun = new DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.phone ? 1024 : 2048, opts.phone ? 1024 : 2048);
  sun.shadow.radius = 5; sun.shadow.blurSamples = 12; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(hemi, amb, sun, sun.target);

  // materials: everything matte
  const lambert = (c: Color) => new MeshLambertMaterial({ color: c });
  const M = {
    vertex: new MeshLambertMaterial({ vertexColors: true }),
    ink: lambert(mix(C.ink, C.paper, 0.08)), card: lambert(C.card), pine: lambert(C.pine), rule: lambert(C.rule),
    belt: lambert(mix(C.ink, C.paper, 0.25)), beacon: lambert(C.pine), reviewOff: new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.3 }),
    edge: new LineBasicMaterial({ color: C.ink }), edgeSoft: new LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.55 }),
    crate: new MeshLambertMaterial({ color: 0xffffff }),
  };

  let L: Layout = makeLayout(3, 8, 6);
  let stage = new Group();
  let layoutKey = '';
  let cfg = { reviewOn: true, agentsWatch: false, shift: true };

  // instanced things that move
  const crateGeo = new BoxGeometry(CRATE, CRATE_H, CRATE);
  const lidGeo = new BoxGeometry(CRATE + 0.03, 0.07, CRATE + 0.03);
  const crates = new InstancedMesh(crateGeo, M.crate, maxCrates);
  const lids = new InstancedMesh(lidGeo, M.crate, maxCrates);
  for (const m of [crates, lids]) { m.instanceMatrix.setUsage(DynamicDrawUsage); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; scene.add(m); }
  crates.setColorAt(0, C.card); lids.setColorAt(0, C.card);

  const headC = mix(C.pine, C.card, 0.28);
  const personGeo = mergeGeometries([
    tint(new CylinderGeometry(0.12, 0.2, 0.54, 14).translate(0, 0.27, 0), C.pine),
    tint(new SphereGeometry(0.145, 16, 12).translate(0, 0.7, 0), headC),
  ])!;
  const robotGeo = mergeGeometries([
    box(0.32, 0.09, 0.28, 0, 0.045, 0, C.muted),
    box(0.36, 0.3, 0.3, 0, 0.26, 0, C.ink),
    box(0.25, 0.19, 0.23, 0, 0.52, 0, C.ink),
    box(0.17, 0.05, 0.02, 0, 0.53, 0.116, C.paper),
    tint(new CylinderGeometry(0.014, 0.014, 0.16, 6).translate(0, 0.69, 0).toNonIndexed(), C.ink),
    tint(new SphereGeometry(0.04, 10, 8).translate(0, 0.79, 0).toNonIndexed(), C.pine),
  ].map((g) => (g.index ? g.toNonIndexed() : g)))!;
  let people: InstancedMesh | null = null, robots: InstancedMesh | null = null;

  // the floor: by day it is the page itself (the canvas is transparent), so only graph lines and shadows are drawn.
  // By night a soft-edged sheet of shade fades in over it.
  let grid: LineSegments | null = null, shade: Mesh | null = null, shadowPlane: Mesh | null = null;
  const gridMat = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  const shadeMat = new MeshBasicMaterial({ color: mix(C.ink, C.pine, 0.12), transparent: true, opacity: 0, depthWrite: false });
  const shadowMat = new ShadowMaterial({ color: C.ink, opacity: 0.2 });
  {
    const n = 96, data = new Uint8Array(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const u = Math.min(i, n - 1 - i) / n, v = Math.min(j, n - 1 - j) / n;
      const e = Math.min(1, Math.min(u / 0.16, v / 0.2));
      data.fill(Math.round(255 * e * e * (3 - 2 * e)), (j * n + i) * 4, (j * n + i) * 4 + 4);
    }
    const tex = new DataTexture(data, n, n, RGBAFormat);
    tex.magFilter = LinearFilter; tex.minFilter = LinearFilter; tex.needsUpdate = true;
    shadeMat.alphaMap = tex;
  }

  const hitMeshes: Mesh[] = [];
  const hitMat = new MeshBasicMaterial({ visible: false });
  const ringMat = new LineBasicMaterial({ color: C.pine });
  const ringGeo = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 0, 1), new Vector3(0, 0, 1)]);
  const hoverRing = new LineLoop(ringGeo, ringMat), focusRing = new LineLoop(ringGeo, ringMat);
  hoverRing.visible = focusRing.visible = false;
  scene.add(hoverRing, focusRing);
  let beacon: Mesh | null = null;

  const edged = (g: BufferGeometry, mat: MeshLambertMaterial, soft = false) => {
    const m = new Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    m.add(new LineSegments(new EdgesGeometry(g, 30), soft ? M.edgeSoft : M.edge));
    return m;
  };
  const at = <T extends Object3D>(o: T, x: number, y: number, z: number) => { o.position.set(x, y, z); return o; };

  function buildStage() {
    scene.remove(stage);
    stage.traverse((o) => { const m = o as Mesh; if (m.geometry && m.geometry !== ringGeo) m.geometry.dispose(); });
    stage = new Group();
    hitMeshes.length = 0;
    const b = L.bounds, pad = 3.2;
    const fx0 = Math.floor(b.x0 - pad), fx1 = Math.ceil(b.x1 + pad), fz0 = Math.floor(b.z0 - pad), fz1 = Math.ceil(b.z1 + pad);

    // graph lines, one per world unit, fading out toward the edge of the floor so it melts into the page
    const pos: number[] = [], col: number[] = [];
    const fade = (x: number, z: number) => { const e = Math.max(0, Math.min(1, Math.min(x - fx0, fx1 - x, z - fz0, fz1 - z) / pad)); return e * e * (3 - 2 * e); };
    const seg = (xa: number, za: number, xb: number, zb: number) => { pos.push(xa, 0.004, za, xb, 0.004, zb); col.push(1, 1, 1, fade(xa, za), 1, 1, 1, fade(xb, zb)); };
    for (let x = fx0; x <= fx1; x++) for (let z = fz0; z < fz1; z++) seg(x, z, x, z + 1);
    for (let z = fz0; z <= fz1; z++) for (let x = fx0; x < fx1; x++) seg(x, z, x + 1, z);
    const gg = new BufferGeometry();
    gg.setAttribute('position', new Float32BufferAttribute(pos, 3));
    gg.setAttribute('color', new Float32BufferAttribute(col, 4));
    grid = new LineSegments(gg, gridMat); grid.renderOrder = -2;
    const plane = new PlaneGeometry(fx1 - fx0, fz1 - fz0).rotateX(-Math.PI / 2).translate((fx0 + fx1) / 2, 0, (fz0 + fz1) / 2);
    // the night shade stays inside the frame, so its soft edge is never cut off by the canvas
    const sx = b.x1 - b.x0 + 3.4, sz = b.z1 - b.z0 + 3.0;
    shade = new Mesh(new PlaneGeometry(sx, sz).rotateX(-Math.PI / 2).translate((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2), shadeMat); shade.position.y = 0.001; shade.renderOrder = -3;
    shadowPlane = new Mesh(plane.clone(), shadowMat); shadowPlane.position.y = 0.006; shadowPlane.receiveShadow = true; shadowPlane.renderOrder = -1;
    stage.add(shade, grid, shadowPlane);

    // inbox tray, where feature requests land
    stage.add(at(edged(new BoxGeometry(0.85, 0.08, 1.1), M.card), L.inbox.x, 0.04, L.inbox.z));
    // maintenance chute: scheduled agent work drops in here, no spec
    stage.add(at(edged(new BoxGeometry(0.7, 0.7, 0.7), M.ink), L.maintChute.x, 0.35, L.maintChute.z));
    stage.add(at(edged(new BoxGeometry(0.5, 0.06, 1.2).rotateX(-0.5), M.belt), L.maintChute.x, 0.36, L.maintChute.z + 0.85));
    // the door people leave by
    const door = new Group();
    door.add(at(edged(new BoxGeometry(0.1, 1.5, 0.1), M.ink), -0.55, 0.75, 0), at(edged(new BoxGeometry(0.1, 1.5, 0.1), M.ink), 0.55, 0.75, 0), at(edged(new BoxGeometry(1.3, 0.1, 0.1), M.ink), 0, 1.5, 0));
    stage.add(at(door, L.door.x, 0, L.door.z));

    // desks (spec and review share the same people)
    const deskGeo = mergeGeometries([
      box(0.98, 0.06, 0.62, 0, 0.47, 0, C.card),
      ...[[-0.42, -0.25], [0.42, -0.25], [-0.42, 0.25], [0.42, 0.25]].map(([x, z]) => box(0.05, 0.44, 0.05, x, 0.22, z, C.ink)),
          ])!;
    const topEdge = new EdgesGeometry(new BoxGeometry(0.98, 0.06, 0.62));
    const desks = (pts: P[], off: boolean) => {
      const im = new InstancedMesh(deskGeo, off ? M.reviewOff : M.vertex, pts.length);
      const m4 = new Matrix4();
      pts.forEach((p, i) => { im.setMatrixAt(i, m4.makeTranslation(p.x, 0, p.z)); if (!off) stage.add(at(new LineSegments(topEdge, M.edgeSoft), p.x, 0.47, p.z)); });
      im.castShadow = !off; im.receiveShadow = true;
      stage.add(im);
    };
    desks(L.specDesks, false);
    desks(L.reviewDesks, !cfg.reviewOn);

    // build bays: an ink pad per agent
    const padGeo = new BoxGeometry(0.86, 0.05, 0.86);
    const pads = new InstancedMesh(padGeo, M.belt, L.bays.length);
    const m4 = new Matrix4();
    L.bays.forEach((p, i) => pads.setMatrixAt(i, m4.makeTranslation(p.x, 0.025, p.z)));
    pads.receiveShadow = true; stage.add(pads);

    // CI conveyor: one lane per runner
    const lz0 = L.ci.laneZ[0], lz1 = L.ci.laneZ[L.lanes - 1], cw = lz1 - lz0 + 0.56, cl = L.ci.x1 - L.ci.x0;
    stage.add(at(edged(new BoxGeometry(cl, 0.26, cw), M.belt), (L.ci.x0 + L.ci.x1) / 2, 0.13, (lz0 + lz1) / 2));
    const lanePts: number[] = [];
    for (let i = 0; i <= L.lanes; i++) { const z = lz0 - 0.28 + (i * cw) / L.lanes; if (i > 0 && i < L.lanes) lanePts.push(L.ci.x0 + 0.05, 0.262, z, L.ci.x1 - 0.05, 0.262, z); }
    for (let x = L.ci.x0 + 0.4; x < L.ci.x1 - 0.1; x += 0.4) lanePts.push(x, 0.262, lz0 - 0.28, x, 0.262, lz1 + 0.28);
    const laneGeo = new BufferGeometry(); laneGeo.setAttribute('position', new Float32BufferAttribute(lanePts, 3));
    stage.add(new LineSegments(laneGeo, new LineBasicMaterial({ color: C.paper, transparent: true, opacity: 0.35 })));
    for (const x of [L.ci.x0 - 0.06, L.ci.x1 + 0.06]) stage.add(at(edged(new CylinderGeometry(0.15, 0.15, cw, 12).rotateX(Math.PI / 2), M.ink), x, 0.13, (lz0 + lz1) / 2));

    // judge gate: the AI checks every change passes under
    const gate = new Group();
    gate.add(at(edged(new BoxGeometry(0.24, 1.7, 0.24), M.ink), 0, 0.85, -0.95), at(edged(new BoxGeometry(0.24, 1.7, 0.24), M.ink), 0, 0.85, 0.95), at(edged(new BoxGeometry(0.3, 0.26, 2.3), M.ink), 0, 1.78, 0));
    gate.add(at(edged(new BoxGeometry(0.06, 0.34, 0.9), M.card), 0.16, 1.78, 0));
    stage.add(at(gate, L.judge.x, 0, L.judge.z));

    // merge point
    stage.add(at(edged(new CylinderGeometry(0.72, 0.72, 0.1, 8), M.pine), L.merge.x, 0.05, L.merge.z));
    stage.add(at(edged(new CylinderGeometry(0.4, 0.4, 0.06, 8), M.card), L.merge.x, 0.13, L.merge.z));

    // production: a raised platform, a flag, and the mast that watches it
    const pr = L.prod, pw = pr.x1 - pr.x0, pd = pr.z1 - pr.z0, pcx = (pr.x0 + pr.x1) / 2, pcz = (pr.z0 + pr.z1) / 2;
    stage.add(at(edged(new BoxGeometry(pw, 0.22, pd), M.card), pcx, 0.11, pcz));
    stage.add(at(edged(new BoxGeometry(pw + 0.3, 0.06, pd + 0.3), M.rule, true), pcx, 0.03, pcz));
    stage.add(at(edged(new CylinderGeometry(0.03, 0.03, 1.7, 8), M.ink), pr.x1 - 0.3, 1.07, pr.z0 + 0.3));
    beacon = at(edged(new BoxGeometry(0.2, 0.2, 0.2), M.beacon), pr.x1 - 0.3, 2.0, pr.z0 + 0.3);
    stage.add(beacon);
    stage.add(at(edged(new BoxGeometry(0.55, 0.06, 0.4), M.card), L.tickets.x, 0.03, L.tickets.z));
    // the thing in production: a rack of servers at the back of the platform
    for (let i = 0; i < 3; i++) stage.add(at(edged(new BoxGeometry(0.42, 0.95 - i * 0.12, 0.42), M.ink), pr.x0 + 0.42 + i * 0.5, 0.22 + (0.95 - i * 0.12) / 2, pr.z0 + 0.4));

    // invisible boxes to hover and click
    for (const [id, r] of Object.entries(L.rects) as [FloorStation, Rect][]) {
      const h = id === 'judge' ? 2 : id === 'diagnose' ? 0.9 : 1.3;
      const m = at(new Mesh(new BoxGeometry(r.x1 - r.x0, h, r.z1 - r.z0), hitMat), (r.x0 + r.x1) / 2, h / 2, (r.z0 + r.z1) / 2);
      m.userData.station = id; hitMeshes.push(m); stage.add(m);
    }

    // people and robots
    if (people) { scene.remove(people); people.dispose(); }
    if (robots) { scene.remove(robots); robots.dispose(); }
    people = new InstancedMesh(personGeo, M.vertex, L.humans);
    robots = new InstancedMesh(robotGeo, M.vertex, L.agents + 1);
    for (const m of [people, robots]) { m.instanceMatrix.setUsage(DynamicDrawUsage); m.castShadow = true; m.frustumCulled = false; scene.add(m); }
    who.length = 0;
    for (let i = 0; i < L.humans; i++) who.push({ x: L.door.x, z: L.door.z, s: 0 });

    scene.add(stage);
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2 + 3;
    const sc = sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 80; sc.updateProjectionMatrix();
    sun.position.set(-9, 22, 12); sun.target.position.set(0, 0, 0);
  }

  // ---- camera ----
  const view = { az: 0, el: 0, zoom: 1, pan: new Vector3() };
  const baseView = () => {
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    // wide stages see the line run left to right; tall phone stages turn it onto the diagonal so it fills the frame
    const k = Math.max(0, Math.min(1, (aspect - 0.7) / 1.3));
    return { az: 0.95 - 0.67 * k, el: 0.7 - 0.1 * k };
  };
  let user = { daz: 0, del: 0 };
  const half = { w: 10, h: 10 };
  function placeCamera() {
    const bv = baseView();
    view.az = bv.az + user.daz; view.el = bv.el + user.del;
    const dir = new Vector3(Math.sin(view.az) * Math.cos(view.el), Math.sin(view.el), Math.cos(view.az) * Math.cos(view.el));
    camera.position.copy(view.pan).addScaledVector(dir, 70);
    camera.lookAt(view.pan);
    camera.updateMatrixWorld(true);
    // fit the floor's box as seen from this angle, measured about its centre so panning never changes the scale
    const unrot = camera.quaternion.clone().invert(), b = L.bounds, v = new Vector3();
    let mx = 0, top = 0, bottom = 0;
    for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const y of [0, opts.phone ? 1.4 : 2.3]) {
      v.set(x, y, z).applyQuaternion(unrot);
      mx = Math.max(mx, Math.abs(v.x)); top = Math.max(top, v.y); bottom = Math.min(bottom, v.y);
    }
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const hh = Math.max((top - bottom) / 2, mx / aspect) * 1.06;
    half.h = hh / view.zoom; half.w = half.h * aspect;
    const cy = view.zoom === 1 ? (top + bottom) / 2 : 0;
    camera.left = -half.w; camera.right = half.w; camera.top = half.h + cy; camera.bottom = -half.h + cy;
    camera.updateProjectionMatrix();
  }

  // ---- moving things ----
  interface Ent { x: number; y: number; z: number; s: number; seen: number }
  const ents = new Map<number, Ent>();
  const who: { x: number; z: number; s: number }[] = [];
  let tick = 0, night = 0, clock = 0;
  let visits: Visit[] = [];
  const pool = (st: Station) => (st === 'spec' || st === 'review' || st === 'diagnose' ? 'humans' : st);

  const bodyC: Record<Kind, Color> = { feature: mix(C.pine, C.card, 0.6), maint: mix(C.rule, C.card, 0.15), fix: mix(C.rust, C.card, 0.68), diag: mix(C.rust, C.card, 0.55) };
  const lidC: Record<Kind, Color> = { feature: C.pine, maint: C.muted, fix: C.card, diag: C.rust };
  const m4 = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0), vp = new Vector3(), vs = new Vector3();
  let n = 0;
  const pile = (base: P, k: number, flat: boolean) => flat
    ? { x: base.x + (hash(k) - 0.5) * 0.08, y: 0.08 + k * 0.045, z: base.z + (hash(k + 9) - 0.5) * 0.08 }
    : { x: base.x + ((k % 2) - 0.5) * 0.5, y: CRATE_H / 2 + Math.floor(k / 4) * (CRATE_H + 0.075), z: base.z + ((Math.floor(k / 2) % 2) - 0.5) * 0.5 };

  function put(id: number, kind: Kind, bug: boolean, tx: number, ty: number, tz: number, ts: number, from: P | null, ease: number, snap: boolean) {
    if (n >= maxCrates) return;
    let e = ents.get(id);
    if (!e) { e = snap || !from ? { x: tx, y: ty, z: tz, s: ts, seen: tick } : { x: from.x, y: 0.3, z: from.z, s: 0.2, seen: tick }; ents.set(id, e); }
    e.seen = tick;
    if (snap) { e.x = tx; e.y = ty; e.z = tz; e.s = ts; }
    else { e.x += (tx - e.x) * ease; e.y += (ty - e.y) * ease; e.z += (tz - e.z) * ease; e.s += (ts - e.s) * ease; }
    // crates sent a long way (back to build, or home from production) are tossed in an arc
    const far = Math.hypot(tx - e.x, tz - e.z), hop = far > 0.5 ? Math.min(1.5, (far - 0.5) * 0.22) : 0;
    const flat = kind === 'diag';
    q.setFromAxisAngle(up, (hash(id) - 0.5) * 0.5);
    vp.set(e.x, e.y + hop, e.z);
    m4.compose(vp, q, vs.set(flat ? e.s * 0.8 : e.s, flat ? e.s * 0.14 : e.s, flat ? e.s * 0.55 : e.s));
    crates.setMatrixAt(n, m4); crates.setColorAt(n, bug ? C.rust : bodyC[kind]);
    vp.y += flat ? 0 : (CRATE_H / 2 + 0.02) * e.s;
    m4.compose(vp, q, vs.set(flat ? 0 : e.s, flat ? 0 : e.s, flat ? 0 : e.s));
    lids.setMatrixAt(n, m4); lids.setColorAt(n, lidC[kind]);
    n++;
  }
  const origin = (v: Visit, first: boolean): P | null => {
    if (!first) return null;
    if (v.kind === 'feature') return L.inbox;
    if (v.kind === 'maint') return L.maintChute;
    if (v.kind === 'fix') return L.diagSpots[0];
    return { x: (L.prod.x0 + L.prod.x1) / 2, z: (L.prod.z0 + L.prod.z1) / 2 };
  };
  const queueAt: Record<Station, () => P> = { spec: () => L.specQueue, build: () => L.buildQueue, ci: () => L.ciQueue, judge: () => L.judge, review: () => L.reviewQueue, diagnose: () => L.tickets };
  const firstVisit = new Map<number, number>();

  function drawState(st: FloorState, dt: number, speed: number, snap: boolean) {
    tick++; n = 0; clock += dt;
    const ease = snap ? 1 : 1 - Math.exp(-dt * (8 + speed * 0.5));
    const slow = snap ? 1 : 1 - Math.exp(-dt * 3.2);
    night += ((st.onShift ? 0 : 1) - night) * (snap ? 1 : 1 - Math.exp(-dt * 2.2));

    // people: at the desk they are working at, at production when diagnosing, gone when off shift
    // a person stands at the left end of the desk they are working at, so the crate on it stays in view
    const target = who.map((_, i) => ({ x: L.specDesks[i].x - SIDE, z: L.specDesks[i].z, s: st.onShift ? 1 : 0, home: !st.onShift }));
    for (const i of st.serving) {
      const v = visits[i];
      if (v.slot < L.humans && pool(v.st) === 'humans') {
        const p = v.st === 'spec' ? L.specDesks[v.slot] : v.st === 'review' ? L.reviewDesks[v.slot] : L.diagSpots[v.slot];
        target[v.slot] = { x: p.x - (v.st === 'diagnose' ? 0 : SIDE), z: p.z, s: 1, home: false };
      }
    }
    who.forEach((w, i) => {
      const g = target[i], tx = g.home ? L.door.x + (i - (who.length - 1) / 2) * 0.3 : g.x, tz = g.home ? L.door.z : g.z;
      if (snap) { w.x = tx; w.z = tz; w.s = g.s; }
      else { w.x += (tx - w.x) * slow; w.z += (tz - w.z) * slow; w.s += (g.s - w.s) * (g.home ? slow * 0.6 : slow * 1.5); }
      m4.compose(vp.set(w.x, 0, w.z), q.identity(), vs.setScalar(Math.max(0.0001, w.s * 1.2)));
      people!.setMatrixAt(i, m4);
    });
    people!.instanceMatrix.needsUpdate = true;

    // agents: one per bay, bobbing while they build; one more on the platform when agents watch production
    const busy = new Set<number>();
    for (const i of st.serving) if (visits[i].st === 'build') busy.add(visits[i].slot);
    L.bays.forEach((p, i) => {
      const bob = busy.has(i) ? Math.abs(Math.sin(clock * 9 + i * 1.7)) * 0.05 : 0;
      m4.compose(vp.set(p.x, bob, p.z - 0.5), q.identity(), vs.setScalar(1));
      robots!.setMatrixAt(i, m4);
    });
    m4.compose(vp.set(L.watcher.x, 0.22, L.watcher.z), q.setFromAxisAngle(up, Math.sin(clock * 0.8) * 0.5 - 0.6), vs.setScalar(cfg.agentsWatch ? 1 : 0.0001));
    robots!.setMatrixAt(L.agents, m4);
    robots!.instanceMatrix.needsUpdate = true;

    // crates waiting: piles in front of each station
    for (const s of ['spec', 'build', 'ci', 'review', 'diagnose', 'judge'] as Station[]) {
      const list = st.queues[s], base = queueAt[s]();
      for (let k = 0; k < list.length && k < pileCap; k++) {
        const v = visits[list[k]], p = pile(base, k, s === 'diagnose');
        put(v.job, v.kind, v.bug, p.x, p.y, p.z, 1, origin(v, firstVisit.get(v.job) === list[k]), ease, snap);
      }
    }
    // crates being worked on
    for (const i of st.serving) {
      const v = visits[i], prog = Math.min(1, (st.t - v.start) / Math.max(1e-6, v.end - v.start));
      let x = 0, y = CRATE_H / 2, z = 0;
      if (v.st === 'spec' || v.st === 'review') { const p = (v.st === 'spec' ? L.specDesks : L.reviewDesks)[v.slot % L.humans]; x = p.x + 0.12; z = p.z; y = 0.5 + CRATE_H / 2; }
      else if (v.st === 'diagnose') { const p = L.diagSpots[v.slot % L.humans]; x = p.x; z = p.z - 0.55; y = 0.3; }
      else if (v.st === 'build') { const p = L.bays[v.slot % L.agents]; x = p.x; z = p.z + 0.08; y = 0.05 + CRATE_H / 2; }
      else if (v.st === 'ci') { x = L.ci.x0 + 0.3 + (L.ci.x1 - L.ci.x0 - 0.6) * prog; z = L.ci.laneZ[v.slot % L.lanes]; y = 0.26 + CRATE_H / 2; }
      else { x = L.judge.x; z = L.judge.z + ((v.slot % 3) - 1) * 0.5; }
      put(v.job, v.kind, v.bug, x, y, z, 1, origin(v, firstVisit.get(v.job) === i), ease, snap);
    }
    // merged clean: slide through the merge point into production and settle out of sight
    const pcx = (L.prod.x0 + L.prod.x1) / 2, pcz = (L.prod.z0 + L.prod.z1) / 2;
    for (const i of st.shipping) {
      const v = visits[i], p = (st.t - v.end) / SHIP_HOURS;
      const a = Math.min(1, p / 0.45), b2 = Math.max(0, (p - 0.45) / 0.55);
      put(v.job, v.kind, false, L.merge.x + (pcx - L.merge.x) * b2, CRATE_H / 2 + 0.14 + 0.2 * b2, L.merge.z + (pcz - L.merge.z) * b2 + (hash(v.job) - 0.5) * 1.6 * b2, 1 - 0.75 * b2 * b2 * (a > 0 ? 1 : 0), null, ease, snap);
    }
    // merged with a bug: it sits live on the platform until someone notices and it is mitigated
    st.liveBugs.forEach((bug, k) => {
      if (k >= L.prodSlots.length) return;
      const p = L.prodSlots[k], found = st.t >= bug.found;
      const wob = found ? 0 : Math.sin(clock * 5 + bug.id) * 0.04;
      put(bug.job, bug.kind, true, p.x, 0.22 + CRATE_H / 2 + wob + (found ? 0.12 : 0), p.z, found ? 0.8 : 1, null, ease, snap);
    });
    for (const [id, e] of ents) if (e.seen !== tick) ents.delete(id);
    crates.count = lids.count = n;
    crates.instanceMatrix.needsUpdate = lids.instanceMatrix.needsUpdate = true;
    if (crates.instanceColor) crates.instanceColor.needsUpdate = true;
    if (lids.instanceColor) lids.instanceColor.needsUpdate = true;

    // the lights go down when people are off shift; agents and CI carry on in the half-dark
    hemi.intensity = 1.5 - 0.75 * night; amb.intensity = 0.95 - 0.3 * night; sun.intensity = 1.7 - 1.35 * night;
    shadeMat.opacity = 0.74 * night;
    shadowMat.opacity = 0.2 - 0.12 * night;
    gridMat.color.copy(C.ink).lerp(C.paper, night); gridMat.opacity = 0.1 + 0.02 * night;
    M.edge.color.copy(C.ink).lerp(C.muted, night * 0.6); M.edgeSoft.color.copy(M.edge.color);
    M.beacon.color.copy(st.liveBugs.some((b) => st.t >= b.found) ? C.rust : C.pine);
    if (beacon) beacon.rotation.y = clock * 0.8;
  }

  const ray = new Raycaster(), ndc = new Vector2();
  let hot: { hover: FloorStation | null; focus: FloorStation | null } = { hover: null, focus: null };
  const ringTo = (ring: LineLoop, id: FloorStation | null) => {
    ring.visible = !!id; if (!id) return;
    const r = L.rects[id]; ring.position.set(r.x0, 0.012, r.z0); ring.scale.set(r.x1 - r.x0, 1, r.z1 - r.z0);
  };

  buildStage(); placeCamera();
  return {
    setFactory(pb, s) {
      visits = pb.trace.visits;
      firstVisit.clear();
      visits.forEach((v, i) => { if (!firstVisit.has(v.job)) firstVisit.set(v.job, i); });
      const key = [s.humans, s.agents, s.ciRunners, s.review.on].join();
      cfg = { reviewOn: s.review.on, agentsWatch: s.prod.mode === 'agents', shift: s.shift };
      if (key !== layoutKey) {
        layoutKey = key;
        L = makeLayout(s.humans, s.agents, s.ciRunners);
        buildStage(); placeCamera(); ents.clear();
        ringTo(hoverRing, hot.hover); ringTo(focusRing, hot.focus);
      }
    },
    frame(state, dt, speed, snap) { drawState(state, dt, speed, snap); renderer.render(scene, camera); },
    resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.phone ? 1.5 : 2));
      renderer.setSize(w, h, false);
      placeCamera();
    },
    pick(cx, cy) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(hitMeshes, false)[0];
      return hit ? (hit.object.userData.station as FloorStation) : null;
    },
    setHot(hover, focus) { hot = { hover, focus }; ringTo(hoverRing, hover === focus ? null : hover); ringTo(focusRing, focus); },
    orbit(dx, dy) {
      user.daz = Math.max(-0.6, Math.min(0.6, user.daz - dx * 0.005));
      user.del = Math.max(-0.28, Math.min(0.5, user.del + dy * 0.004));
      placeCamera();
    },
    zoomBy(f, cx, cy) {
      const r = canvas.getBoundingClientRect();
      const nx = ((cx - r.left) / r.width) * 2 - 1, ny = -(((cy - r.top) / r.height) * 2 - 1);
      const z0 = view.zoom, z1 = Math.max(1, Math.min(4, z0 * f));
      if (z1 === z0) return;
      // keep the point under the cursor where it is
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0), upv = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const k = 1 - z0 / z1;
      view.pan.addScaledVector(right, nx * half.w * k).addScaledVector(upv, ny * half.h * k);
      if (z1 === 1) view.pan.set(0, 0, 0);
      const lim = 14 * (1 - 1 / z1) + 0.001;
      view.pan.clampLength(0, lim);
      view.zoom = z1;
      placeCamera();
    },
    resetView() { user = { daz: 0, del: 0 }; view.zoom = 1; view.pan.set(0, 0, 0); placeCamera(); },
    anchors() {
      const w = canvas.clientWidth, h = canvas.clientHeight, out = {} as Record<FloorStation, LabelAnchor>, v = new Vector3();
      for (const [id, p] of Object.entries(L.labels) as [FloorStation, { x: number; y: number; z: number }][]) {
        v.set(p.x, p.y, p.z).project(camera);
        out[id] = { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
      }
      return out;
    },
    dispose() {
      renderer.dispose();
      scene.traverse((o) => { const m = o as Mesh; if (m.geometry) m.geometry.dispose(); });
    },
  };
}
