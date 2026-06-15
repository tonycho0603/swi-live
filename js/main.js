/**
 * main.js — 흐름: 학번 로그인 → 인바디 입력 → 캐릭터 미리보기 → 멀티 공간 입장
 */
import { findAccount } from './accounts.js';
import { ROOM, SUPABASE_URL } from './config.js';
import { inbodyToBoneScales } from './inbody.js';
import { preloadAssets, previewCharacter, startSpace } from './space.js';
import { joinRoom, sendMove, sendGesture } from './net.js';

const loginEl   = document.getElementById('login');
const createEl  = document.getElementById('create');
const previewEl = document.getElementById('preview');
const stageEl   = document.getElementById('stage');
const idInput   = document.getElementById('login-id');
const loginBtn  = document.getElementById('login-btn');
const loginErr  = document.getElementById('login-error');
const createBtn = document.getElementById('create-btn');
const createErr = document.getElementById('create-error');
const previewStage = document.getElementById('preview-stage');
const previewTitle = document.getElementById('preview-title');
const previewSub   = document.getElementById('preview-sub');
const enterBtn  = document.getElementById('enter-btn');
const countEl   = document.getElementById('count');

let me = null;
let selectedGender = '';
let preloadPromise = null;
let previewDispose = null;
let api = null;
let channel = null;
const known = new Set();

// ===== 1) 학번 로그인 =====
function login() {
  const acc = findAccount(idInput.value);
  if (!acc) { loginErr.textContent = '등록되지 않은 학번이에요.'; return; }
  if (SUPABASE_URL.includes('YOUR-PROJECT')) { loginErr.textContent = 'config.js에 Supabase 키를 먼저 넣어주세요.'; return; }

  me = { id: acc.id, nickname: acc.nickname };
  preloadPromise = preloadAssets();          // 폼 작성하는 동안 에셋 미리 로드
  loginEl.style.display = 'none';
  createEl.style.display = 'flex';
}
loginBtn.addEventListener('click', login);
idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

// ===== 2) 성별 선택 =====
document.querySelectorAll('.gender-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedGender = btn.dataset.gender;
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.toggle('selected', b === btn));
  });
});

// ===== 3) 인바디 입력 → 미리보기 =====
async function create() {
  if (!selectedGender) { createErr.textContent = '성별을 선택해주세요.'; return; }
  const weight  = parseFloat(document.getElementById('c-weight').value);
  const bodyFat = parseFloat(document.getElementById('c-bodyFat').value);
  const muscle  = parseFloat(document.getElementById('c-muscle').value);
  if (!muscle || muscle < 5 || muscle > 80) { createErr.textContent = '골격근량을 올바르게 입력해주세요. (5~80kg)'; return; }

  me.gender = selectedGender;
  me.boneScales = inbodyToBoneScales({ gender: selectedGender, weight, bodyFat, muscle });

  createBtn.disabled = true;
  createErr.textContent = '생성 중...';
  try {
    await preloadPromise;
    createEl.style.display = 'none';
    previewEl.style.display = 'flex';
    previewTitle.textContent = '캐릭터 생성중...';
    previewSub.textContent = '';
    previewDispose = previewCharacter(previewStage, me.gender, me.boneScales, () => {
      previewTitle.textContent = '당신의 전용 캐릭터가 완성됐어요!';
      previewSub.textContent = '반가워요!';
    });
  } catch (err) {
    console.error(err);
    createErr.textContent = '생성 실패: ' + (err?.message || err);
    createBtn.disabled = false;
  }
}
createBtn.addEventListener('click', create);

// ===== 4) 미리보기 → 공간 입장 =====
async function enterSpace() {
  enterBtn.disabled = true;
  if (previewDispose) { previewDispose(); previewDispose = null; }   // 미리보기 정리(WebGL 해제)
  previewEl.style.display = 'none';
  stageEl.classList.add('active');

  api = startSpace(stageEl, me, { onLocalMove: (p) => { if (channel) sendMove(channel, p); } });

  channel = await joinRoom(ROOM, me, {
    onPresence: (state) => {
      const ids = new Set(Object.keys(state).filter(k => k !== me.id));
      ids.forEach(id => {
        if (!known.has(id)) {
          const info = state[id]?.[0];
          if (info) { api.addPlayer({ id, gender: info.gender, nickname: info.nickname, boneScales: info.boneScales }); known.add(id); }
        }
      });
      [...known].forEach(id => { if (!ids.has(id)) { api.removePlayer(id); known.delete(id); } });
      if (countEl) countEl.textContent = `접속자 ${ids.size + 1}명`;
    },
    onMove: (p) => api.applyRemoteState(p),
    onGesture: (p) => api.playGesture(p.id, p.name),
  });

  document.getElementById('btn-wave')?.addEventListener('click', () => {
    api.playGesture(me.id, 'wave'); sendGesture(channel, { id: me.id, name: 'wave' });
  });
  document.getElementById('btn-dance')?.addEventListener('click', () => {
    api.playGesture(me.id, 'dance'); sendGesture(channel, { id: me.id, name: 'dance' });
  });
}
enterBtn.addEventListener('click', enterSpace);
