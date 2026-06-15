/**
 * main.js — 흐름: 학번 로그인 → 인바디 입력 → 멀티 공간 입장
 *
 *   1) 학번 로그인 (accounts.js, 등록된 학번만)
 *   2) 인바디 입력(성별+체중/체지방/골격근량) → 본 스케일 계산 (inbody.js)
 *   3) 내 체형 캐릭터로 공간 입장 + Supabase 실시간 동기화
 */
import { findAccount } from './accounts.js';
import { ROOM, SUPABASE_URL } from './config.js';
import { inbodyToBoneScales } from './inbody.js';
import { preloadAssets, startSpace } from './space.js';
import { joinRoom, sendMove, sendGesture } from './net.js';

const loginEl  = document.getElementById('login');
const createEl = document.getElementById('create');
const stageEl  = document.getElementById('stage');
const idInput  = document.getElementById('login-id');
const loginBtn = document.getElementById('login-btn');
const loginErr = document.getElementById('login-error');
const createBtn = document.getElementById('create-btn');
const createErr = document.getElementById('create-error');
const countEl  = document.getElementById('count');

let me = null;
let selectedGender = '';
let preloadPromise = null;
let api = null;
let channel = null;
const known = new Set();

// ===== 1) 학번 로그인 =====
function login() {
  const acc = findAccount(idInput.value);
  if (!acc) { loginErr.textContent = '등록되지 않은 학번이에요.'; return; }
  if (SUPABASE_URL.includes('YOUR-PROJECT')) { loginErr.textContent = 'config.js에 Supabase 키를 먼저 넣어주세요.'; return; }

  me = { id: acc.id, nickname: acc.nickname };
  preloadPromise = preloadAssets();         // 폼 작성하는 동안 에셋 미리 로드
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

// ===== 3) 인바디 입력 → 입장 =====
async function create() {
  if (!selectedGender) { createErr.textContent = '성별을 선택해주세요.'; return; }
  const weight  = parseFloat(document.getElementById('c-weight').value);
  const bodyFat = parseFloat(document.getElementById('c-bodyFat').value);
  const muscle  = parseFloat(document.getElementById('c-muscle').value);
  if (!muscle || muscle < 5 || muscle > 80) { createErr.textContent = '골격근량을 올바르게 입력해주세요. (5~80kg)'; return; }

  me.gender = selectedGender;
  me.boneScales = inbodyToBoneScales({ gender: selectedGender, weight, bodyFat, muscle });

  createBtn.disabled = true;
  createErr.textContent = '입장 중...';

  try {
    await preloadPromise;
    createEl.style.display = 'none';
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
  } catch (err) {
    console.error(err);
    createErr.textContent = '입장 실패: ' + (err?.message || err);
    createBtn.disabled = false;
    createEl.style.display = 'flex';
    stageEl.classList.remove('active');
  }
}

createBtn.addEventListener('click', create);
