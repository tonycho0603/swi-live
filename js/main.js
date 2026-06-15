/**
 * main.js — 로그인 흐름 + 네트워크 연결
 *
 *   1) 미리 만든 ID로 로그인 (accounts.js)
 *   2) 캐릭터 에셋 로드 + 3D 공간 시작 (space.js)
 *   3) Supabase 방 입장 (net.js) → Presence로 입퇴장, Broadcast로 위치/제스처 동기화
 */
import { findAccount } from './accounts.js';
import { ROOM, SUPABASE_URL } from './config.js';
import { preloadAssets, startSpace } from './space.js';
import { joinRoom, sendMove, sendGesture } from './net.js';

const loginEl = document.getElementById('login');
const stageEl = document.getElementById('stage');
const idInput = document.getElementById('login-id');
const loginBtn = document.getElementById('login-btn');
const errorEl = document.getElementById('login-error');
const countEl = document.getElementById('count');

let api = null;
let channel = null;
let me = null;
const known = new Set();   // 현재 화면에 있는 원격 플레이어 id

async function enter() {
  const acc = findAccount(idInput.value);
  if (!acc) { errorEl.textContent = '없는 ID예요. 받은 ID를 확인해주세요.'; return; }
  if (SUPABASE_URL.includes('YOUR-PROJECT')) {
    errorEl.textContent = 'config.js에 Supabase 주소/키를 먼저 넣어주세요.';
    return;
  }
  me = acc;
  loginBtn.disabled = true;
  errorEl.textContent = '입장 중...';

  try {
    await preloadAssets();
    loginEl.style.display = 'none';
    stageEl.classList.add('active');

    // 공간 시작 (이동 시 위치 broadcast)
    api = startSpace(stageEl, me, {
      onLocalMove: (p) => { if (channel) sendMove(channel, p); },
    });

    // 방 입장
    channel = await joinRoom(ROOM, me, {
      onPresence: (state) => {
        const ids = new Set(Object.keys(state).filter(k => k !== me.id));
        // 새로 들어온 사람
        ids.forEach(id => {
          if (!known.has(id)) {
            const info = state[id]?.[0];
            if (info) { api.addPlayer({ id, gender: info.gender, nickname: info.nickname }); known.add(id); }
          }
        });
        // 나간 사람
        [...known].forEach(id => {
          if (!ids.has(id)) { api.removePlayer(id); known.delete(id); }
        });
        if (countEl) countEl.textContent = `접속자 ${ids.size + 1}명`;
      },
      onMove: (p) => api.applyRemoteState(p),
      onGesture: (p) => api.playGesture(p.id, p.name),
    });

    // 제스처 버튼
    document.getElementById('btn-wave')?.addEventListener('click', () => {
      api.playGesture(me.id, 'wave');
      sendGesture(channel, { id: me.id, name: 'wave' });
    });
    document.getElementById('btn-dance')?.addEventListener('click', () => {
      api.playGesture(me.id, 'dance');
      sendGesture(channel, { id: me.id, name: 'dance' });
    });
  } catch (err) {
    console.error(err);
    errorEl.textContent = '입장 실패: ' + (err?.message || err);
    loginBtn.disabled = false;
    loginEl.style.display = '';
    stageEl.classList.remove('active');
  }
}

loginBtn.addEventListener('click', enter);
idInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
