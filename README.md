# 운동 메타버스 — 라이브 (발표용)

여러 명이 **같은 3D 헬스 공간에 동시에 들어와 서로 보이고 움직이는** 멀티플레이어 데모.
미리 만든 ID로 로그인 → 배정된 기본 캐릭터로 입장.

- 실시간 동기화: **Supabase Realtime** (Presence + Broadcast, 서버 직접 운영 X)
- 3D: Three.js (Fake Door 사이트의 공간/캐릭터 에셋 재사용)
- Fake Door 사이트와 **완전히 별개 프로젝트**

## 1. Supabase 준비 (1회)
1. https://supabase.com 에서 무료 프로젝트 생성
2. **Settings → API** 에서 `Project URL` 과 `anon public` 키 복사
3. `js/config.js` 에 붙여넣기:
   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
   → DB 테이블/SQL 설정 불필요 (Realtime 채널 기능만 사용)

## 2. 로컬 실행
- VS Code Live Server 등으로 `index.html` 열기 (모듈 import 때문에 `file://` 직접 열기는 안 됨)
- 여러 탭/기기에서 각각 다른 ID로 입장하면 서로 보임

## 3. 로그인 계정
- `user01` ~ `user30` (js/accounts.js)
- 홀수=남자 / 짝수=여자 기본 캐릭터
- 발표 때 청중에게 하나씩 나눠주면 됨

## 4. 조작
- 이동: WASD / 방향키 / 화면 왼쪽 D-패드(모바일)
- 시점: 빈 화면 드래그
- 👋 인사 / 💃 춤 버튼

## 5. 배포 (정적)
- 빌드 불필요. 이 폴더를 그대로 Netlify drop / Vercel / GitHub Pages 등에 올리면 됨
- 클라이언트만 정적 호스팅하면 되고, 실시간은 Supabase가 처리

## 참고
- 캐릭터/기구 에셋 합계가 좀 큼(수십 MB) → 첫 로딩 느리면 텍스처 압축 고려
- 30명 동시: Supabase 무료 티어로 충분 (Broadcast/Presence)
