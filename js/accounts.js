/**
 * accounts.js — 미리 만들어둔 로그인 ID → 기본 캐릭터 매핑
 *
 * 발표 청중에게 user01 ~ user30 중 하나씩 나눠주면 됨.
 * 홀수=남자, 짝수=여자 기본 캐릭터로 입장. (원하면 자유롭게 수정)
 */
export const ACCOUNTS = {};

for (let i = 1; i <= 30; i++) {
  const id = 'user' + String(i).padStart(2, '0');
  ACCOUNTS[id] = {
    id,
    gender: i % 2 === 1 ? 'male' : 'female',   // 홀수 남 / 짝수 여
    nickname: id,
  };
}

/** ID로 계정 조회 (없으면 null) */
export function findAccount(id) {
  if (!id) return null;
  return ACCOUNTS[id.trim().toLowerCase()] || null;
}
