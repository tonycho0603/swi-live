/**
 * space.js — 멀티플레이어 3D 공간 (헬스 메타버스)
 *
 *   - 캐릭터 GLB는 성별당 1개만 로드 후 SkeletonUtils.clone 으로 인원수만큼 복제
 *   - 로컬 플레이어: WASD/방향키/화면 D-패드로 3인칭 이동 → 위치 broadcast
 *   - 원격 플레이어: 수신한 위치/회전으로 보간(interpolation) 이동
 *   - 헬스 기구 환경 + 인사(1회)/춤(토글) 제스처(말풍선)
 *
 * 위치 동기화는 net.js(Supabase Broadcast)가 담당. 이 모듈은 렌더/연출만.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const GENDER_GLB = {
  male:   'asset/character/male/Meshy_AI_Violet_Velocity_Kid_biped_Meshy_AI_Meshy_Merged_Animations.glb',
  female: 'asset/character/female/Meshy_AI_Violet_Velocity_biped_Meshy_AI_Meshy_Merged_Animations.glb',
};
const CLIPS = {
  male:   { idle: 'Idle_02', walk: 'Walking', run: 'Running', wave: 'Wave_for_Help_1', dance: 'Gangnam_Groove' },
  female: { idle: 'Idle_02', walk: 'Walking', run: 'Running', wave: 'Wave_for_Help_1', dance: 'Superlove_Pop_Dance' },
};
const OBJECT_DIR = 'asset/object/';
const OBJECTS = [
  { file: 'Meshy_AI_powerrack_0615164335_texture.glb',        targetH: 4.8,  x:  0, z: -9, rotY: 0 },
  { file: 'Meshy_AI_runnning_machine_0615164147_texture.glb', targetH: 2.4,  x: -8, z: -4, rotY: 0 },
  { file: 'Meshy_AI_runnning_machine_0615164147_texture.glb', targetH: 2.4,  x: -8, z:  1, rotY: 0 },
  { file: 'Meshy_AI_benchpress_0615164154_texture.glb',       targetH: 2.16, x:  8, z: -2, rotY: -Math.PI / 2 },
  { file: 'Meshy_AI_dumbbell_0615164546_texture.glb',         targetH: 0.6,  x:  4, z:  4, rotY:  0.4 },
  { file: 'Meshy_AI_dumbbell_0615164546_texture.glb',         targetH: 0.6,  x: -4, z:  4, rotY: -0.4 },
];

const MOVE_SPEED  = 2.6;
const RUN_SPEED   = 6.2;       // Shift 달리기
const TURN_LERP   = 0.2;
const REMOTE_LERP = 0.18;     // 원격 플레이어 위치 보간
const BOUNDS      = 12;
const CAM_DIST    = 9.5;
const CAM_HEIGHT  = 4.2;
const DRAG_SENS   = 0.006;
const FOOT_BONES  = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'];

const LOADED = {};            // gender → gltf (clone 소스)
const _v = new THREE.Vector3();

/** 성별 GLB 2개 미리 로드 */
export async function preloadAssets() {
  const loader = new GLTFLoader();
  for (const g of ['male', 'female']) {
    const gltf = await loader.loadAsync(GENDER_GLB[g]);
    gltf.animations.forEach(c => { c.tracks = c.tracks.filter(t => !t.name.endsWith('.scale')); });
    LOADED[g] = gltf;
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function groundOffset(model) {
  model.updateMatrixWorld(true);
  let minY = Infinity;
  for (const n of FOOT_BONES) {
    const b = model.getObjectByName(n);
    if (b) { _v.setFromMatrixPosition(b.matrixWorld); if (_v.y < minY) minY = _v.y; }
  }
  return minY < Infinity ? -minY : 0;
}

function makeTextSprite(text) {
  const FONT = 48, PAD = 26, R = 30;
  const m = document.createElement('canvas').getContext('2d');
  m.font = `800 ${FONT}px sans-serif`;
  const w = Math.ceil(m.measureText(text).width);
  const c = document.createElement('canvas');
  c.width = w + PAD * 2; c.height = FONT + PAD * 2;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  if (x.roundRect) { x.beginPath(); x.roundRect(0, 0, c.width, c.height, R); x.fill(); } else x.fillRect(0, 0, c.width, c.height);
  x.font = `800 ${FONT}px sans-serif`; x.fillStyle = '#1a1a2e';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const h = 0.45; sp.scale.set(h * (c.width / c.height), h, 1);
  return sp;
}

function buildEnvironment(scene) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0x2b2b40, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  const rug = new THREE.Mesh(new THREE.CircleGeometry(5.5, 48),
    new THREE.MeshStandardMaterial({ color: 0x4954a6, roughness: 0.9 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.02; scene.add(rug);

  const grid = new THREE.GridHelper(30, 30, 0x556089, 0x333355);
  grid.position.y = 0.01; grid.material.transparent = true; grid.material.opacity = 0.25; scene.add(grid);

  const warm = new THREE.PointLight(0xffd9a0, 0.6, 40); warm.position.set(-8, 5, -4); scene.add(warm);
  const cool = new THREE.PointLight(0x88aaff, 0.5, 40); cool.position.set(8, 5, 6); scene.add(cool);

  const loader = new GLTFLoader();
  OBJECTS.forEach((cfg) => {
    loader.load(OBJECT_DIR + cfg.file, (gltf) => {
      const o = gltf.scene;
      const size = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
      o.scale.setScalar(cfg.targetH / (size.y || 1));
      const minY = new THREE.Box3().setFromObject(o).min.y;
      o.position.set(cfg.x, -minY, cfg.z);
      o.rotation.y = cfg.rotY || 0;
      scene.add(o);
    });
  });
}

/** 캐릭터 1명 생성 (clone). boneScales 있으면 인바디 체형 반영 */
function makeCharacter(gender, boneScales) {
  const src = LOADED[gender] || LOADED.male;
  const model = cloneSkinned(src.scene);
  // 인바디 본 스케일 적용 (없으면 기본 체형)
  if (boneScales) {
    for (const [bone, val] of Object.entries(boneScales)) {
      const b = model.getObjectByName(bone);
      if (b) b.scale.set(val, val, val);
    }
  }
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  const map = CLIPS[gender] || CLIPS.male;
  for (const [role, name] of Object.entries(map)) {
    const clip = src.animations.find(a => a.name === name);
    if (clip) actions[role] = mixer.clipAction(clip);
  }
  if (actions.wave) { actions.wave.setLoop(THREE.LoopOnce); actions.wave.clampWhenFinished = true; }

  const char = {
    model, mixer, actions,
    head: model.getObjectByName('Head'),
    active: null,
    gesture: null,     // null | 'dance' (지속)
    oneShot: false,    // 인사(1회) 재생 중
    groundY: 0,
    play(role) {
      if (this.active === role || !actions[role]) return;
      if (this.active && actions[this.active]) actions[this.active].fadeOut(0.2);
      actions[role].reset().setEffectiveWeight(1).fadeIn(0.2).play();
      this.active = role;
    },
  };
  mixer.addEventListener('finished', (e) => {
    if (e.action === actions.wave) char.oneShot = false;   // 인사 끝 → 렌더 루프가 idle/walk 복귀
  });
  char.groundY = groundOffset(model);
  model.position.y = char.groundY;
  return char;
}

/** 이동/제스처 상태에 따라 캐릭터 애니메이션 결정 (로컬·원격 공용) */
function updateCharAnim(char, moving, running) {
  if (moving) { char.gesture = null; char.oneShot = false; char.play(running ? 'run' : 'walk'); }
  else if (char.oneShot) { /* 인사 재생 중 — 그대로 둠 */ }
  else if (char.gesture === 'dance') char.play('dance');
  else char.play('idle');
}

// Fake Door와 동일한 단계별 "뚝!뚝!뚝!" 생성 연출 파라미터
const GEN_STEPS = 3, STEP_INTERVAL = 1000, SNAP_DURATION = 180;
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

/**
 * 캐릭터 생성 미리보기 — Fake Door와 동일하게 상체 3단계 → 하체 3단계 스냅.
 * @returns dispose() 함수 (공간 입장 전 호출해 정리)
 */
export function previewCharacter(containerEl, gender, boneScales, onDone) {
  const w = containerEl.clientWidth || 360, h = containerEl.clientHeight || 480;
  const scene = new THREE.Scene();
  scene.background = null;                                  // 투명 (stage CSS 배경 비침) — Fake Door 동일
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  camera.position.set(0, 1.7, 9);
  camera.lookAt(0, 1.25, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  containerEl.appendChild(renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));        // Fake Door와 동일한 조명
  const d = new THREE.DirectionalLight(0xffffff, 1); d.position.set(3, 5, 3); scene.add(d);

  const src = LOADED[gender] || LOADED.male;
  const model = cloneSkinned(src.scene);
  scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const idle = src.animations.find(a => a.name === (CLIPS[gender] || CLIPS.male).idle);
  if (idle) mixer.clipAction(idle).play();

  const targets = boneScales || {};
  const clock = new THREE.Clock();
  const _vv = new THREE.Vector3();
  let raf = null, disposed = false;

  function ground() {
    model.position.y = 0;
    model.updateMatrixWorld(true);
    let m = Infinity;
    for (const n of FOOT_BONES) { const b = model.getObjectByName(n); if (b) { _vv.setFromMatrixPosition(b.matrixWorld); if (_vv.y < m) m = _vv.y; } }
    if (m < Infinity) model.position.y = -m;
  }
  // 렌더 루프 (생성 스냅과 별개로 계속 그림)
  function loop() {
    raf = requestAnimationFrame(loop);
    mixer.update(clock.getDelta());
    ground();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(loop);

  // ===== 단계별 스냅 생성 (Fake Door 로직 포팅) =====
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  function curScale(name) { const b = model.getObjectByName(name); return b ? b.scale.x : 1; }
  function snap(toScales, fromScales, durationMs) {
    return new Promise((res) => {
      const t0 = performance.now();
      function step() {
        if (disposed) return res();
        const t = Math.min((performance.now() - t0) / durationMs, 1);
        const e = easeOutBack(t);
        for (const [name, target] of Object.entries(toScales)) {
          const start = fromScales[name] ?? 1.0;
          const v = start + (target - start) * e;
          const b = model.getObjectByName(name);
          if (b) b.scale.set(v, v, v);
        }
        if (t < 1) requestAnimationFrame(step); else res();
      }
      requestAnimationFrame(step);
    });
  }
  async function steppedSnap(targetScales) {
    const startScales = {};
    for (const n of Object.keys(targetScales)) startScales[n] = curScale(n);
    for (let i = 1; i <= GEN_STEPS; i++) {
      if (disposed) return;
      const ratio = i / GEN_STEPS;
      const stepTarget = {};
      for (const [n, t] of Object.entries(targetScales)) stepTarget[n] = startScales[n] + (t - startScales[n]) * ratio;
      const from = {}; for (const n of Object.keys(targetScales)) from[n] = curScale(n);
      await wait(STEP_INTERVAL - SNAP_DURATION);
      await snap(stepTarget, from, SNAP_DURATION);
    }
  }
  (async () => {
    await steppedSnap({ Spine02: targets.Spine02, neck: targets.neck });   // 상체
    await steppedSnap({ RightUpLeg: targets.RightUpLeg, LeftUpLeg: targets.LeftUpLeg }); // 하체
    if (!disposed && onDone) onDone();
  })();

  const onResize = () => {
    const ww = containerEl.clientWidth, hh = containerEl.clientHeight;
    if (!ww) return;
    camera.aspect = ww / hh; camera.updateProjectionMatrix(); renderer.setSize(ww, hh);
  };
  window.addEventListener('resize', onResize);

  return function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  };
}

/**
 * 공간 시작. hooks.onLocalMove(payload) 가 throttle되어 호출됨(broadcast용).
 * @returns API { addPlayer, removePlayer, applyRemoteState, playGesture }
 */
export function startSpace(stageEl, me, hooks) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16162a);
  scene.fog = new THREE.Fog(0x16162a, 16, 42);

  const camera = new THREE.PerspectiveCamera(40, stageEl.clientWidth / stageEl.clientHeight, 0.1, 100);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(stageEl.clientWidth, stageEl.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  stageEl.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.25));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6); dir.position.set(4, 8, 5); scene.add(dir);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(-5, 6, -4); scene.add(fill);

  buildEnvironment(scene);

  const players = new Map();   // id → { char, isLocal, target:{x,z,rotY,moving} }

  // 내 캐릭터 (인바디 체형 반영)
  const localChar = makeCharacter(me.gender, me.boneScales);
  localChar.model.position.set(0, localChar.groundY, 2);
  scene.add(localChar.model);
  players.set(me.id, { char: localChar, isLocal: true });

  // 말풍선
  const bubbles = [];
  function showBubble(char, text, ms) {
    const sp = makeTextSprite(text);
    sp.renderOrder = 999;
    scene.add(sp);
    const e = { sp, char };
    bubbles.push(e);
    setTimeout(() => { scene.remove(sp); const i = bubbles.indexOf(e); if (i >= 0) bubbles.splice(i, 1); }, ms);
  }

  // 입력
  const input = { forward: false, back: false, left: false, right: false, run: false };
  const KEY = { KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
                KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  const isShift = (c) => c === 'ShiftLeft' || c === 'ShiftRight';
  window.addEventListener('keydown', (e) => { const d = KEY[e.code]; if (d) { input[d] = true; if (e.code.startsWith('Arrow')) e.preventDefault(); } if (isShift(e.code)) input.run = true; });
  window.addEventListener('keyup', (e) => { const d = KEY[e.code]; if (d) input[d] = false; if (isShift(e.code)) input.run = false; });

  stageEl.querySelectorAll('[data-dir]').forEach((btn) => {
    const d = btn.dataset.dir;
    const on  = (ev) => { ev.preventDefault(); input[d] = true; };
    const off = (ev) => { ev.preventDefault(); input[d] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointerleave', off);
    btn.addEventListener('pointercancel', off);
  });

  // 카메라 드래그 회전
  let camYaw = 0, dragging = false, lastX = 0;
  const cv = renderer.domElement;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (dragging) { camYaw -= (e.clientX - lastX) * DRAG_SENS; lastX = e.clientX; } });
  const endDrag = () => { dragging = false; };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', () => {
    if (!stageEl.clientWidth) return;
    camera.aspect = stageEl.clientWidth / stageEl.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(stageEl.clientWidth, stageEl.clientHeight);
  });

  // 로컬 broadcast throttle
  let lastSent = 0, lastMoving = false, lastRunning = false;
  const _dir = new THREE.Vector3();
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const now = performance.now();

    // 로컬 이동 (카메라 기준)
    const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx =  Math.cos(camYaw), rz = -Math.sin(camYaw);
    _dir.set(fx * f + rx * s, 0, fz * f + rz * s);
    const moving = _dir.lengthSq() > 0;
    const running = input.run && moving;        // Shift + 이동 = 달리기
    const lm = localChar.model;
    if (moving) {
      _dir.normalize();
      const speed = running ? RUN_SPEED : MOVE_SPEED;
      lm.position.x = THREE.MathUtils.clamp(lm.position.x + _dir.x * speed * delta, -BOUNDS, BOUNDS);
      lm.position.z = THREE.MathUtils.clamp(lm.position.z + _dir.z * speed * delta, -BOUNDS, BOUNDS);
      lm.rotation.y = lerpAngle(lm.rotation.y, Math.atan2(_dir.x, _dir.z), TURN_LERP);
    }
    updateCharAnim(localChar, moving, running);

    // 위치 전파: 이동 중 ~12/s, 멈춤/달리기 전환 시 1회
    if ((moving && now - lastSent > 80) || (moving !== lastMoving) || (running !== lastRunning)) {
      hooks.onLocalMove?.({ id: me.id, x: +lm.position.x.toFixed(2), z: +lm.position.z.toFixed(2),
                            rotY: +lm.rotation.y.toFixed(2), moving, running });
      lastSent = now; lastMoving = moving; lastRunning = running;
    }

    // 원격 보간 + 애니메이션
    for (const [, p] of players) {
      if (p.isLocal) continue;
      const t = p.target;
      if (t) {
        p.char.model.position.x += (t.x - p.char.model.position.x) * REMOTE_LERP;
        p.char.model.position.z += (t.z - p.char.model.position.z) * REMOTE_LERP;
        p.char.model.rotation.y = lerpAngle(p.char.model.rotation.y, t.rotY, REMOTE_LERP);
        updateCharAnim(p.char, t.moving, t.running);
      } else {
        updateCharAnim(p.char, false, false);
      }
    }

    players.forEach(p => p.char.mixer.update(delta));

    // 말풍선 위치
    for (const b of bubbles) {
      if (!b.char.head) continue;
      b.char.head.getWorldPosition(_v);
      b.sp.position.set(_v.x, _v.y + 0.9, _v.z);
    }

    // 카메라 3인칭 추적
    camera.position.set(lm.position.x + Math.sin(camYaw) * CAM_DIST, CAM_HEIGHT, lm.position.z + Math.cos(camYaw) * CAM_DIST);
    camera.lookAt(lm.position.x, 1.2, lm.position.z);

    renderer.render(scene, camera);
  }
  animate();

  return {
    addPlayer(info) {
      if (players.has(info.id)) return;
      const char = makeCharacter(info.gender, info.boneScales);
      const seed = info.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      char.model.position.set((seed % 7) - 3, char.groundY, (seed % 5) - 3);
      char.play('idle');
      scene.add(char.model);
      players.set(info.id, { char, isLocal: false, target: null });
    },
    removePlayer(id) {
      const p = players.get(id);
      if (!p || p.isLocal) return;
      scene.remove(p.char.model);
      players.delete(id);
    },
    applyRemoteState(payload) {
      const p = players.get(payload.id);
      if (!p || p.isLocal) return;
      p.target = { x: payload.x, z: payload.z, rotY: payload.rotY, moving: payload.moving, running: payload.running };
    },
    playGesture(id, name) {
      const p = players.get(id);
      if (!p) return;
      const char = p.char;
      if (name === 'wave') {
        if (char.actions.wave) char.actions.wave.reset();
        char.gesture = null;
        char.oneShot = true;
        char.play('wave');
        showBubble(char, '안녕!', 2500);
      } else if (name === 'dance') {
        char.oneShot = false;
        char.gesture = char.gesture === 'dance' ? null : 'dance';
      }
    },
  };
}
