/**
 * config.js — Supabase 연결 설정
 *
 * supabase.com 에서 프로젝트를 만든 뒤(무료):
 *   1) 좌측 Settings → API 이동
 *   2) "Project URL" 을 SUPABASE_URL 에
 *   3) "Project API keys"의 anon public 키를 SUPABASE_ANON_KEY 에 붙여넣기
 *
 * Realtime(Presence/Broadcast)만 쓰므로 DB 테이블이나 SQL 설정은 필요 없음.
 * (anon 키는 클라이언트에 노출돼도 되는 공개 키)
 */
export const SUPABASE_URL = 'https://aljbprtbzxhhganruafs.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_cA9sgQJO29Sc-lVHCkRruQ_3HRCHyC_';

// 모두 같은 방으로 입장 (발표용 단일 공간)
export const ROOM = 'gym-metaverse';
