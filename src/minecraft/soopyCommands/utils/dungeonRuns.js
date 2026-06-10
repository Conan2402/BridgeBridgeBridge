const zlib = require("zlib");
const nbt = require("prismarine-nbt");

const MAX_BUFFS = {
  hecatombClass: 0.04,
  scarf: 0.06,
  cataExpert: 0.10,
  cataGraduate: 0.20,
  mayor: 1.00,
  global: 1.00,
};

const ATTRIBUTE_STACKS = {
  CATACOMBS_GRADUATE: "catacombs_graduate",
};

const CLASSES = [
  { key: "archer", short: "arch", display: "Archer", input: ["archer", "arch"], perk: "toxophilite" },
  { key: "berserk", short: "bers", display: "Berserk", input: ["berserk", "bers", "berz"], perk: "unbridled_rage" },
  { key: "healer", short: "heal", display: "Healer", input: ["healer", "heal"], perk: "heart_of_gold" },
  { key: "mage", short: "mage", display: "Mage", input: ["mage"], perk: "cold_efficiency" },
  { key: "tank", short: "tank", display: "Tank", input: ["tank"], perk: "diamond_in_the_rough" },
];

const FLOORS = {
  m7: { label: "M7", xp: 300_000, maxComps: 76 },
  m6: { label: "M6", xp: 100_000, maxComps: 76 },
  m5: { label: "M5", xp: 70_000, maxComps: 76 },
  m4: { label: "M4", xp: 55_000, maxComps: 76 },
  m3: { label: "M3", xp: 35_000, maxComps: 76 },
  m2: { label: "M2", xp: 20_000, maxComps: 76 },
  m1: { label: "M1", xp: 15_000, maxComps: 26 },

  f7: { label: "F7", xp: 28_000, maxComps: 76 },
  f6: { label: "F6", xp: 4_880, maxComps: 51 },
  f5: { label: "F5", xp: 2_400, maxComps: 76 },
  f4: { label: "F4", xp: 1_420, maxComps: 76 },
  f3: { label: "F3", xp: 560, maxComps: 76 },
  f2: { label: "F2", xp: 220, maxComps: 76 },
  f1: { label: "F1", xp: 110, maxComps: 76 },
  e: { label: "Entrance", xp: 55, maxComps: 76 },
  entrance: { label: "Entrance", xp: 55, maxComps: 76 },
};

const DUNGEON_LEVEL_XP = [
  50,
  75,
  110,
  160,
  230,
  330,
  470,
  670,
  950,
  1_340,
  1_890,
  2_665,
  3_760,
  5_260,
  7_380,
  10_300,
  14_400,
  20_000,
  27_600,
  38_000,
  52_500,
  71_500,
  97_000,
  132_000,
  180_000,
  243_000,
  328_000,
  445_000,
  600_000,
  800_000,
  1_065_000,
  1_410_000,
  1_900_000,
  2_500_000,
  3_300_000,
  4_300_000,
  5_600_000,
  7_200_000,
  9_200_000,
  12_000_000,
  15_000_000,
  19_000_000,
  24_000_000,
  30_000_000,
  38_000_000,
  48_000_000,
  60_000_000,
  75_000_000,
  93_000_000,
  116_250_000,
];

const DUNGEON_XP_TO_50 = DUNGEON_LEVEL_XP.reduce((sum, xp) => sum + xp, 0);
const DUNGEON_OVERFLOW_XP_STEP = 200_000_000;

function formatNumber(number, digits = 0) {
  return Number(number).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

function clamp(number, min, max) {
  return Math.min(Math.max(number, min), max);
}

function getFloorOrDefault(input) {
  return FLOORS[String(input || "m7").toLowerCase()] ?? FLOORS.m7;
}

function parsePositiveNumber(input, fallback) {
  const number = Number(input);

  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }

  return number;
}

function getMemberProfile(profile) {
  if (profile?.dungeons || profile?.player_data || profile?.inventory) {
    return profile;
  }

  const members = profile?.members;
  if (members && typeof members === "object") {
    const firstMember = Object.values(members)[0];
    if (firstMember) return firstMember;
  }

  return profile;
}

function getDungeons(profile) {
  if (profile?.dungeons) return profile.dungeons;

  const members = profile?.members;
  if (members && typeof members === "object") {
    const firstMember = Object.values(members)[0];
    if (firstMember?.dungeons) return firstMember.dungeons;
  }

  throw new Error("Could not find dungeons data on profile.");
}

function getClassDefinition(input) {
  const lowerInput = String(input || "").toLowerCase();

  return CLASSES.find((cls) => cls.input.includes(lowerInput)) ?? null;
}

function getClassXp(dungeons, cls) {
  return dungeons?.player_classes?.[cls.key]?.experience ?? 0;
}

function getCataXp(dungeons) {
  return dungeons?.dungeon_types?.catacombs?.experience ?? 0;
}

function normalizeSkyBlockItemId(id) {
  return String(id || "")
    .toUpperCase()
    .replace(/^SKYBLOCK_/, "");
}

function parseNbt(buffer) {
  return new Promise((resolve, reject) => {
    nbt.parse(buffer, (error, data) => {
      if (error) return reject(error);

      try {
        resolve(nbt.simplify(data.parsed || data));
      } catch (simplifyError) {
        reject(simplifyError);
      }
    });
  });
}

async function parseNbtData(base64Data) {
  const compressed = Buffer.from(base64Data, "base64");
  const raw = zlib.gunzipSync(compressed);

  return parseNbt(raw);
}

function collectObjectsDeep(obj, result = []) {
  if (!obj || typeof obj !== "object") return result;

  result.push(obj);

  if (Array.isArray(obj)) {
    for (const item of obj) collectObjectsDeep(item, result);
    return result;
  }

  for (const value of Object.values(obj)) {
    collectObjectsDeep(value, result);
  }

  return result;
}

function findExtraAttributesId(obj) {
  if (!obj || typeof obj !== "object") return null;

  if (typeof obj.id === "string") return obj.id;

  if (obj.ExtraAttributes) {
    const found = findExtraAttributesId(obj.ExtraAttributes);
    if (found) return found;
  }

  if (obj.tag) {
    const found = findExtraAttributesId(obj.tag);
    if (found) return found;
  }

  if (obj.value) {
    const found = findExtraAttributesId(obj.value);
    if (found) return found;
  }

  for (const value of Object.values(obj)) {
    const found = findExtraAttributesId(value);
    if (found) return found;
  }

  return null;
}

async function readAccessoryBagItemIds(memberProfile) {
  const base64Data = memberProfile?.inventory?.bag_contents?.talisman_bag?.data;

  if (typeof base64Data !== "string" || base64Data.length === 0) {
    return new Set();
  }

  try {
    const simplified = await parseNbtData(base64Data);
    const objects = collectObjectsDeep(simplified);
    const ids = new Set();

    for (const obj of objects) {
      const id = findExtraAttributesId(obj);
      if (id) ids.add(normalizeSkyBlockItemId(id));
    }

    return ids;
  } catch {
    return new Set();
  }
}

function getBestAccessoryBuff(itemIds, candidates, fallback) {
  for (const candidate of candidates) {
    if (itemIds.has(candidate.id)) {
      return candidate.value;
    }
  }

  return fallback;
}

function readEssenceBuffs(memberProfile) {
  const perks = memberProfile?.player_data?.perks ?? {};
  const buffs = {};

  for (const cls of CLASSES) {
    const rawLevel =
      typeof perks[cls.perk] === "number" && Number.isFinite(perks[cls.perk])
        ? perks[cls.perk]
        : 5;

    const usedLevel = clamp(rawLevel, 0, 5);

    buffs[cls.short] = usedLevel * 0.02;
  }

  return buffs;
}

function readCatacombsGraduateLevel(memberProfile) {
  const stacks = memberProfile?.attributes?.stacks?.[ATTRIBUTE_STACKS.CATACOMBS_GRADUATE];

  if (typeof stacks !== "number" || !Number.isFinite(stacks)) {
    return 10;
  }

  if (stacks >= 24) {
    return 10;
  }

  return 10;
}

async function readOtherBuffs(memberProfile) {
  const accessoryBagIds = await readAccessoryBagItemIds(memberProfile);

  const scarf = getBestAccessoryBuff(
    accessoryBagIds,
    [
      { id: "SCARF_GRIMOIRE", value: 0.06 },
      { id: "SCARF_THESIS", value: 0.04 },
      { id: "SCARF_STUDIES", value: 0.02 },
    ],
    MAX_BUFFS.scarf
  );

  const cataExpert = getBestAccessoryBuff(
    accessoryBagIds,
    [{ id: "CATACOMBS_EXPERT_RING", value: 0.10 }],
    MAX_BUFFS.cataExpert
  );

  const cataGraduateLevel = readCatacombsGraduateLevel(memberProfile);

  return {
    hecatombClass: MAX_BUFFS.hecatombClass,
    scarf,
    cataExpert,
    cataGraduate: cataGraduateLevel * 0.02,
    mayor: MAX_BUFFS.mayor,
    global: MAX_BUFFS.global,
  };
}

function getDungeonXpForLevel(level) {
  const targetLevel = clamp(Math.floor(Number(level) || 50), 0, 500);

  if (targetLevel <= 0) {
    return 0;
  }

  if (targetLevel <= 50) {
    return DUNGEON_LEVEL_XP
      .slice(0, targetLevel)
      .reduce((sum, xp) => sum + xp, 0);
  }

  const overflowLevels = targetLevel - 50;

  return DUNGEON_XP_TO_50 + overflowLevels * DUNGEON_OVERFLOW_XP_STEP;
}

function calculateCataXpPerRun(floor, buffs) {
  const base = floor.xp;
  const maxComps = floor.maxComps;
  const hecatombCata = buffs.hecatombClass / 2;

  let cataPerRun;

  if (buffs.cataExpert > 0 && buffs.mayor > 1) {
    cataPerRun =
      base *
      (0.95 +
        (buffs.mayor - 1 + (maxComps - 1) / 100) +
        buffs.cataExpert +
        hecatombCata +
        (maxComps - 1) * (0.024 + hecatombCata / 50));
  } else if (buffs.cataExpert > 0) {
    cataPerRun =
      base *
      (0.95 +
        buffs.cataExpert +
        hecatombCata +
        (maxComps - 1) * (0.024 + hecatombCata / 50));
  } else {
    cataPerRun =
      base *
      (0.95 +
        hecatombCata +
        (maxComps - 1) * (0.022 + hecatombCata / 50));
  }

  return Math.ceil(cataPerRun * buffs.global);
}

function calculateClassXpPerRun(floor, essenceBuffs, otherBuffs) {
  const result = {};

  for (const cls of CLASSES) {
    result[cls.short] =
      floor.xp *
      ((1 +
        otherBuffs.hecatombClass +
        essenceBuffs[cls.short] +
        otherBuffs.scarf +
        otherBuffs.cataGraduate +
        (otherBuffs.global - 1)) *
        Math.min(1.5, otherBuffs.mayor));
  }

  return result;
}

async function getDungeonRunRates(dungeons, floor, memberProfile) {
  const essenceBuffs = readEssenceBuffs(memberProfile);
  const otherBuffs = await readOtherBuffs(memberProfile);

  return {
    cataPerRun: calculateCataXpPerRun(floor, otherBuffs),
    classPerRun: calculateClassXpPerRun(floor, essenceBuffs, otherBuffs),
    essenceBuffs,
    otherBuffs,
  };
}

async function calculateRunsUntilCata(dungeons, floor, memberProfile, targetLevel = 50) {
  const targetXp = getDungeonXpForLevel(targetLevel);
  const currentXp = getCataXp(dungeons);
  const { cataPerRun } = await getDungeonRunRates(dungeons, floor, memberProfile);

  if (!Number.isFinite(cataPerRun) || cataPerRun <= 0) {
    throw new Error("Invalid cata XP per run.");
  }

  return {
    runs: Math.max(Math.ceil((targetXp - currentXp) / cataPerRun), 0),
    currentXp,
    targetXp,
    cataPerRun,
  };
}

async function calculateRunsUntilClassLevel(
  dungeons,
  floor,
  memberProfile,
  targetClass,
  targetLevel = 50,
  playingClass = null
) {
  const cls = getClassDefinition(targetClass);
  if (!cls) {
    throw new Error("Unknown class.");
  }

  const playedCls = getClassDefinition(playingClass) ?? cls;
  const targetXp = getDungeonXpForLevel(targetLevel);
  const currentXp = getClassXp(dungeons, cls);
  const { classPerRun } = await getDungeonRunRates(dungeons, floor, memberProfile);

  const xpPerRun = classPerRun[cls.short] * (playedCls.short === cls.short ? 1 : 0.25);

  if (!Number.isFinite(xpPerRun) || xpPerRun <= 0) {
    throw new Error("Invalid class XP per run.");
  }

  return {
    runs: Math.max(Math.ceil((targetXp - currentXp) / xpPerRun), 0),
    currentXp,
    targetXp,
    xpPerRun,
    targetClass: cls,
    playingClass: playedCls,
  };
}

async function calculateRunsUntilClassAverage(dungeons, floor, memberProfile, targetAverage = 50) {
  const targetXp = getDungeonXpForLevel(targetAverage);
  const classXpLeft = CLASSES.map((cls) => Math.max(targetXp - getClassXp(dungeons, cls), 0));

  const { classPerRun } = await getDungeonRunRates(dungeons, floor, memberProfile);

  const runsPerClass = [0, 0, 0, 0, 0];

  const minClassXpPerRun = Math.min(
    ...Object.values(classPerRun).filter((xp) => Number.isFinite(xp) && xp > 0)
  );

  if (!Number.isFinite(minClassXpPerRun) || minClassXpPerRun <= 0) {
    throw new Error("Invalid class XP per run.");
  }

  const maxXpLeft = Math.max(...classXpLeft);
  let safety = Math.ceil(maxXpLeft / (minClassXpPerRun / 4)) + 10_000;

  while (classXpLeft.some((xp) => xp > 0)) {
    if (--safety <= 0) {
      throw new Error("Safety limit reached. Check XP-per-run calculation.");
    }

    let maxIndex = 0;

    for (let i = 1; i < classXpLeft.length; i++) {
      if (classXpLeft[i] > classXpLeft[maxIndex]) {
        maxIndex = i;
      }
    }

    for (let i = 0; i < CLASSES.length; i++) {
      const cls = CLASSES[i];

      if (i === maxIndex) {
        classXpLeft[i] -= classPerRun[cls.short];
        runsPerClass[i] += 1;
      } else {
        classXpLeft[i] -= classPerRun[cls.short] / 4;
      }
    }
  }

  const totalRuns = runsPerClass.reduce((sum, runs) => sum + runs, 0);

  return {
    totalRuns,
    runsPerClass,
    targetXp,
    classPerRun,
  };
}

module.exports = {
  CLASSES,
  FLOORS,
  DUNGEON_XP_TO_50,
  DUNGEON_OVERFLOW_XP_STEP,

  formatNumber,
  parsePositiveNumber,
  getFloorOrDefault,
  getMemberProfile,
  getDungeons,
  getClassDefinition,
  getDungeonXpForLevel,

  calculateRunsUntilCata,
  calculateRunsUntilClassLevel,
  calculateRunsUntilClassAverage,
};