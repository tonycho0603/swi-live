/**
 * inbody.js — 인바디 수치 → 본 스케일 매핑 (Fake Door 사이트의 web-character.js 재사용)
 *
 *   - 부위별 입력 있음: 상체합(양팔+몸통)·다리 각각 정밀 매핑
 *   - 부위별 없음:      전체 골격근량(muscle) 하나로 상/하체 fallback 매핑
 *   - neck = 1/Spine02 (머리 크기 보존)
 */

// 부위별 입력 모드 (segmental 스케일, 평균에서 18%↓)
const BONE_CONFIG_BY_GENDER = {
  male: {
    Spine02:    { baseline: 24,  weight: 0.75, min: 0.75, max: 1.3 },
    RightUpLeg: { baseline: 7.5, weight: 1.75, min: 0.55, max: 1.8 },
    LeftUpLeg:  { baseline: 7.5, weight: 1.75, min: 0.55, max: 1.8 },
  },
  female: {
    Spine02:    { baseline: 17, weight: 0.75, min: 0.75, max: 1.3 },
    RightUpLeg: { baseline: 5,  weight: 1.75, min: 0.55, max: 1.8 },
    LeftUpLeg:  { baseline: 5,  weight: 1.75, min: 0.55, max: 1.8 },
  },
};

// 전체 골격근량만 입력 시 fallback (평균 -18%: 남 26 / 여 18)
const MUSCLE_FALLBACK_BY_GENDER = {
  male: {
    Spine02:    { baseline: 26, weight: 1.5,  min: 0.7, max: 1.4 },
    RightUpLeg: { baseline: 26, weight: 1.75, min: 0.6, max: 1.8 },
    LeftUpLeg:  { baseline: 26, weight: 1.75, min: 0.6, max: 1.8 },
  },
  female: {
    Spine02:    { baseline: 18, weight: 1.5,  min: 0.7, max: 1.4 },
    RightUpLeg: { baseline: 18, weight: 1.75, min: 0.6, max: 1.8 },
    LeftUpLeg:  { baseline: 18, weight: 1.75, min: 0.6, max: 1.8 },
  },
};

function getGender(inbody) {
  return inbody?.gender === 'female' ? 'female' : 'male';
}

function toScale(value, cfg) {
  if (!value || !cfg?.baseline) return 1.0;
  const ratio = value / cfg.baseline;
  const weighted = 1 + (ratio - 1) * cfg.weight;
  return Math.max(cfg.min, Math.min(cfg.max, weighted));
}

function hasDetailMuscle(inbody) {
  return Boolean(inbody.armR && inbody.armL && inbody.legR && inbody.legL && inbody.trunk);
}

/** 인바디 → { Spine02, neck, RightUpLeg, LeftUpLeg } */
export function inbodyToBoneScales(inbody) {
  const gender = getGender(inbody);

  if (hasDetailMuscle(inbody)) {
    const cfg = BONE_CONFIG_BY_GENDER[gender];
    const upperTotal = inbody.armR + inbody.armL + inbody.trunk;   // 상체 = 양팔+몸통
    const spine02 = toScale(upperTotal, cfg.Spine02);
    return {
      Spine02: spine02,
      neck: 1 / spine02,
      RightUpLeg: toScale(inbody.legR, cfg.RightUpLeg),
      LeftUpLeg:  toScale(inbody.legL, cfg.LeftUpLeg),
    };
  }

  const fb = MUSCLE_FALLBACK_BY_GENDER[gender];
  const spine02 = toScale(inbody.muscle, fb.Spine02);
  return {
    Spine02: spine02,
    neck: 1 / spine02,
    RightUpLeg: toScale(inbody.muscle, fb.RightUpLeg),
    LeftUpLeg:  toScale(inbody.muscle, fb.LeftUpLeg),
  };
}
