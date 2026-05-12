const { getXpTable } = require("../../../API/constants/skills.js");

const BASE_STEP_CURVE_1_TO_60 = [
  50, 125, 200, 300, 500, 750, 1000, 1500, 2000, 3500,
  5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000, 200000,
  300000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000, 1100000, 1200000,
  1300000, 1400000, 1500000, 1600000, 1700000, 1800000, 1900000, 2000000, 2100000, 2200000,
  2300000, 2400000, 2500000, 2600000, 2750000, 2900000, 3100000, 3400000, 3700000, 4000000,
  4300000, 4600000, 4900000, 5200000, 5500000, 5800000, 6100000, 6400000, 6700000, 7000000
];

const SKILLS_FOR_AVERAGE = [
  "farming",
  "mining",
  "combat",
  "foraging",
  "fishing",
  "enchanting",
  "alchemy",
  "taming",
  "carpentry",
  "hunting"
];

const BASE_CAPS = {
  farming: 60,
  mining: 60,
  combat: 60,
  enchanting: 60,
  foraging: 54,
  fishing: 50,
  alchemy: 50,
  taming: 60,
  carpentry: 50,
  hunting: 25
};

function sanitizeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : 0;
}

function normalizeXpTableToStepCurve(table) {
  if (Array.isArray(table)) {
    return table.map(sanitizeNumber).filter((value) => value > 0);
  }

  if (table && typeof table === "object") {
    return Object.keys(table)
      .map(Number)
      .filter((key) => Number.isFinite(key))
      .sort((a, b) => a - b)
      .map((key) => sanitizeNumber(table[key]))
      .filter((value) => value > 0);
  }

  return BASE_STEP_CURVE_1_TO_60;
}

function getStepCurve(skill) {
  const table = getXpTable(skill);
  const curve = normalizeXpTableToStepCurve(table);

  return curve.length > 0 ? curve : BASE_STEP_CURVE_1_TO_60;
}

function getCapForSkill(profile, skill) {
  return BASE_CAPS[skill] ?? 50;
}

function xpRequiredForLevel(stepCurve, level) {
  let total = 0;

  for (let i = 0; i < level; i++) {
    const need = stepCurve[i];

    if (!Number.isFinite(need) || need <= 0) {
      break;
    }

    total += need;
  }

  return total;
}

function overflowXPAbove60ToAbsLevelFloat(overflowXP) {
  let xp = Math.max(0, Math.floor(overflowXP));

  let absLevel = 60;
  let slope = 600000;
  let cost = 7000000 + slope;

  while (xp >= cost) {
    xp -= cost;
    absLevel++;
    cost += slope;

    if (absLevel % 10 === 0) {
      slope *= 2;
    }
  }

  const progress = cost > 0 ? xp / cost : 0;

  return {
    levelWithProgress: absLevel + progress,
    current: xp,
    needed: cost
  };
}

function overflowXPToAbsLevelFloatFromCap(overflowXP, startAbsLevel, stepCurve) {
  let xp = Math.max(0, Math.floor(overflowXP));
  let absLevel = Math.max(0, Math.floor(startAbsLevel));

  if (absLevel >= 60) {
    return overflowXPAbove60ToAbsLevelFloat(xp);
  }

  while (absLevel < 60) {
    const nextLevel = absLevel + 1;
    const need = stepCurve[nextLevel - 1] ?? BASE_STEP_CURVE_1_TO_60[nextLevel - 1] ?? 0;

    if (!Number.isFinite(need) || need <= 0) {
      break;
    }

    if (xp < need) {
      return {
        levelWithProgress: absLevel + xp / need,
        current: xp,
        needed: need
      };
    }

    xp -= need;
    absLevel = nextLevel;
  }

  return overflowXPAbove60ToAbsLevelFloat(xp);
}

function calculateOverflowSkillLevel(currentXP, skillCap, stepCurve) {
  const xpTotal = Math.max(0, Math.floor(sanitizeNumber(currentXP)));
  const maxLevel = Math.max(0, Math.floor(sanitizeNumber(skillCap)));

  let xpCurrent = xpTotal;
  let level = 0;

  while (level < maxLevel) {
    const need = stepCurve[level];

    if (!Number.isFinite(need) || need <= 0) {
      break;
    }

    if (xpCurrent < need) {
      break;
    }

    xpCurrent -= need;
    level++;
  }

  const xpForNext = stepCurve[level] ?? 0;

  if (level < maxLevel) {
    return {
      level,
      levelWithProgress: level + (xpForNext > 0 ? xpCurrent / xpForNext : 0),
      current: xpCurrent,
      needed: xpForNext,
      overflowTotal: 0
    };
  }

  const xpNeededForLevel60 = xpRequiredForLevel(stepCurve, 60);

  if (xpTotal >= xpNeededForLevel60) {
    const overflow = overflowXPAbove60ToAbsLevelFloat(xpTotal);

    return {
      level: Math.floor(overflow.levelWithProgress),
      levelWithProgress: overflow.levelWithProgress,
      current: overflow.current,
      needed: overflow.needed,
      overflowTotal: xpTotal
    };
  }

  const xpNeededForCap = xpRequiredForLevel(stepCurve, maxLevel);
  const overflowXP = Math.max(0, xpTotal - xpNeededForCap);
  const overflow = overflowXPToAbsLevelFloatFromCap(overflowXP, maxLevel, stepCurve);

  return {
    level: Math.floor(overflow.levelWithProgress),
    levelWithProgress: overflow.levelWithProgress,
    current: overflow.current,
    needed: overflow.needed,
    overflowTotal: overflowXP
  };
}

function getOverflowSkills(profile) {
  const experience = profile.player_data?.experience;

  if (!experience) {
    return null;
  }

  const result = {};

  for (const skill of SKILLS_FOR_AVERAGE) {
    const xpKey = `SKILL_${skill.toUpperCase()}`;
    const xp = sanitizeNumber(experience[xpKey]);
    const stepCurve = getStepCurve(skill);
    const cap = getCapForSkill(profile, skill);

    result[skill] = {
      xp,
      cap,
      ...calculateOverflowSkillLevel(xp, cap, stepCurve)
    };
  }

  return result;
}

function getOverflowSkillAverage(overflowSkills) {
  const levels = Object.values(overflowSkills)
    .map((skill) => skill.levelWithProgress)
    .filter((level) => typeof level === "number" && Number.isFinite(level));

  if (levels.length === 0) {
    return 0;
  }

  return levels.reduce((total, level) => total + level, 0) / levels.length;
}

module.exports = {
  getOverflowSkills,
  getOverflowSkillAverage
};
