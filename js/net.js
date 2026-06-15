/**
 * net.js — Supabase Realtime 래퍼 (서버 직접 운영 X)
 *
 *   - Presence: 누가 접속/이탈했는지 (캐릭터 생성/제거 트리거)
 *   - Broadcast: 위치/회전/제스처 실시간 전파
 *
 * DB 테이블 불필요 — 채널 기능만 사용.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

let supabase = null;

function client() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 20 } },   // 위치 업데이트 빈도 상한
    });
  }
  return supabase;
}

/**
 * 방 입장. handlers:
 *   onPresence(state)  접속자 목록 동기화 시 (state[id] = [{id,gender,nickname}])
 *   onMove(payload)    원격 이동 수신 {id,x,z,rotY,moving}
 *   onGesture(payload) 원격 제스처 수신 {id,name}
 *   onReady()          내 입장(track) 완료
 * @returns {channel} send에 사용
 */
export async function joinRoom(room, me, handlers) {
  const channel = client().channel(room, {
    config: {
      presence: { key: me.id },
      broadcast: { self: false },     // 내가 보낸 건 나에게 다시 안 옴
    },
  });

  channel.on('presence', { event: 'sync' }, () => {
    handlers.onPresence?.(channel.presenceState());
  });
  channel.on('broadcast', { event: 'move' }, ({ payload }) => {
    handlers.onMove?.(payload);
  });
  channel.on('broadcast', { event: 'gesture' }, ({ payload }) => {
    handlers.onGesture?.(payload);
  });

  await channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ id: me.id, gender: me.gender, nickname: me.nickname, boneScales: me.boneScales });
      handlers.onReady?.();
    }
  });

  return channel;
}

/** 내 이동 상태 전파 */
export function sendMove(channel, payload) {
  channel.send({ type: 'broadcast', event: 'move', payload });
}

/** 내 제스처(인사/춤) 전파 */
export function sendGesture(channel, payload) {
  channel.send({ type: 'broadcast', event: 'gesture', payload });
}
