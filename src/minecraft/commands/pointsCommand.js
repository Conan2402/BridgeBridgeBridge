const fs = require("fs");
const path = require("path");

const minecraftCommand = require("../../contracts/minecraftCommand.js");
const { formatError } = require("../../contracts/helperFunctions.js");
const hypixel = require("../../contracts/API/HypixelRebornAPI.js");
const { getUUID } = require("../../contracts/API/mowojangAPI.js");
const config = require("../../../config.json");

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "gamble.json");

const GUILD_MEMBER_RUNTIME_CACHE_MS = 1000 * 30;
const guildMemberRuntimeCache = new Map();

const DEFAULT_GAMBLE_SETTINGS = {
  enabled: true,
  xpToPointRatio: 1,
  giveInitialWeeklyXp: true
};

const GAMBLE_SETTINGS = {
  ...DEFAULT_GAMBLE_SETTINGS,
  ...(config.minecraft?.gambling || {})
};

GAMBLE_SETTINGS.enabled = GAMBLE_SETTINGS.enabled !== false;
GAMBLE_SETTINGS.xpToPointRatio = Math.max(1, Number(GAMBLE_SETTINGS.xpToPointRatio) || 1);
GAMBLE_SETTINGS.giveInitialWeeklyXp = GAMBLE_SETTINGS.giveInitialWeeklyXp === true;

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ players: {} }, null, 2));
  }
}

function loadData() {
  ensureDataFile();

  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    if (!data.players || typeof data.players !== "object") {
      data.players = {};
    }

    return data;
  } catch {
    return { players: {} };
  }
}

function saveData(data) {
  ensureDataFile();

  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, DATA_FILE);
}

function formatNumber(number) {
  return Math.floor(Number(number) || 0).toLocaleString("en-US");
}

function normalizeXpNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizePlayerName(player) {
  return String(player || "").trim().toLowerCase();
}

function normalizeUuid(uuid) {
  return String(uuid || "").replace(/-/g, "").toLowerCase();
}

function getApiErrorMessage(error) {
  return (
    error?.response?.data?.cause ||
    error?.response?.data?.message ||
    error?.data?.cause ||
    error?.data?.message ||
    error?.message ||
    String(error || "")
  );
}

function isBrokenApiDataError(error) {
  const message = getApiErrorMessage(error).toLowerCase();

  return (
    message.includes("cannot read properties of undefined") ||
    message.includes("reading 'data'") ||
    message.includes('reading "data"') ||
    message.includes("got undefined but expected data") ||
    message.includes("typeerror") ||
    message.includes("type[error]")
  );
}

function isHypixelPlayerLookupError(error) {
  const message = getApiErrorMessage(error).toLowerCase();

  return (
    message.includes("player does not exist") ||
    message.includes("invalid uuid") ||
    message.includes("invalid player") ||
    message.includes("malformed uuid")
  );
}

function getCachedUuidFromData(data, player) {
  const normalizedPlayer = normalizePlayerName(player);

  for (const [uuidKey, profile] of Object.entries(data.players || {})) {
    if (!profile || typeof profile !== "object") {
      continue;
    }

    if (normalizePlayerName(profile.username) === normalizedPlayer) {
      return normalizeUuid(uuidKey);
    }
  }

  return null;
}

function getProfileByUuid(data, uuid) {
  const normalizedUuid = normalizeUuid(uuid);

  if (!normalizedUuid) {
    return null;
  }

  return data.players?.[normalizedUuid] || null;
}

async function resolvePlayerUuid(player, data) {
  const cachedUuid = getCachedUuidFromData(data, player);

  if (cachedUuid) {
    return cachedUuid;
  }

  let uuid;

  try {
    uuid = await getUUID(player);
  } catch (error) {
    console.error("[POINTS] UUID lookup failed", {
      player,
      message: getApiErrorMessage(error)
    });

    throw `Could not find a Player named "${player}".`;
  }

  uuid = normalizeUuid(uuid);

  if (!uuid) {
    throw `Could not find a Player named "${player}".`;
  }

  return uuid;
}

function looksLikeDailyExpHistory(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => {
      return (
        entry &&
        typeof entry === "object" &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(entry.day || "")) &&
        normalizeXpNumber(entry.exp) > 0
      );
    });
  }

  return Object.entries(value).some(([key, xp]) => {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(key)) && normalizeXpNumber(xp) > 0;
  });
}

function normalizeDailyExpHistory(history) {
  const normalized = {};

  if (!history || typeof history !== "object") {
    return normalized;
  }

  if (Array.isArray(history)) {
    for (const entry of history) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const day = String(entry.day || "").trim();
      const xp = normalizeXpNumber(entry.exp);

      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && xp > 0) {
        normalized[day] = xp;
      }
    }

    return normalized;
  }

  for (const [date, value] of Object.entries(history)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      continue;
    }

    const xp = normalizeXpNumber(value);

    if (xp > 0) {
      normalized[date] = xp;
    }
  }

  return normalized;
}

function findDailyExpHistoryDeep(object, depth = 0, seen = new Set()) {
  if (!object || typeof object !== "object" || depth > 8 || seen.has(object)) {
    return null;
  }

  seen.add(object);

  if (looksLikeDailyExpHistory(object)) {
    return object;
  }

  const preferredKeys = [
    "expHistory",
    "exp_history",
    "dailyExperience",
    "dailyGuildExperience",
    "guildExpHistory",
    "guildExperienceHistory"
  ];

  for (const key of preferredKeys) {
    if (looksLikeDailyExpHistory(object[key])) {
      return object[key];
    }
  }

  for (const value of Object.values(object)) {
    const found = findDailyExpHistoryDeep(value, depth + 1, seen);

    if (found) {
      return found;
    }
  }

  return null;
}

function getDailyExpHistory(member) {
  const directHistory =
    member.expHistory ||
    member.exp_history ||
    member.dailyExperience ||
    member.dailyGuildExperience ||
    member.guildExpHistory ||
    member.guildExperienceHistory ||
    member.raw?.expHistory ||
    member._raw?.expHistory ||
    member.data?.expHistory ||
    member.guildMember?.expHistory;

  if (looksLikeDailyExpHistory(directHistory)) {
    return normalizeDailyExpHistory(directHistory);
  }

  const deepHistory = findDailyExpHistoryDeep(member);

  if (looksLikeDailyExpHistory(deepHistory)) {
    return normalizeDailyExpHistory(deepHistory);
  }

  return {};
}

function getWeeklyExperienceTotal(member) {
  const weeklyExperience =
    member.weeklyExperience ||
    member.weekly_experience ||
    member.weeklyGuildExperience ||
    member.raw?.weeklyExperience ||
    member._raw?.weeklyExperience ||
    member.data?.weeklyExperience;

  if (typeof weeklyExperience === "number" || typeof weeklyExperience === "string") {
    return normalizeXpNumber(weeklyExperience);
  }

  if (Array.isArray(weeklyExperience)) {
    return weeklyExperience.reduce((total, entry) => {
      if (typeof entry === "number" || typeof entry === "string") {
        return total + normalizeXpNumber(entry);
      }

      if (entry && typeof entry === "object") {
        return total + normalizeXpNumber(entry.amount || entry.experience || entry.xp);
      }

      return total;
    }, 0);
  }

  if (weeklyExperience && typeof weeklyExperience === "object") {
    return Object.values(weeklyExperience).reduce((total, value) => {
      if (typeof value === "number" || typeof value === "string") {
        return total + normalizeXpNumber(value);
      }

      if (value && typeof value === "object") {
        return total + normalizeXpNumber(value.amount || value.experience || value.xp);
      }

      return total;
    }, 0);
  }

  return 0;
}

async function getGuildMemberFromApi(player, data) {
  const uuid = await resolvePlayerUuid(player, data);
  const normalizedUuid = normalizeUuid(uuid);
  const runtimeCacheKey = normalizedUuid;

  const runtimeCached = guildMemberRuntimeCache.get(runtimeCacheKey);

  if (
    runtimeCached &&
    Date.now() - runtimeCached.cachedAt < GUILD_MEMBER_RUNTIME_CACHE_MS
  ) {
    return {
      uuid: runtimeCached.uuid,
      member: runtimeCached.member
    };
  }

  let guild;

  try {
    guild = await hypixel.getGuild("player", normalizedUuid, {
      noCaching: true
    });
  } catch (error) {
    console.error("[POINTS] Hypixel guild lookup failed", {
      player,
      uuid: normalizedUuid,
      lookupType: "player",
      lookupValue: normalizedUuid,
      message: getApiErrorMessage(error)
    });

    if (isBrokenApiDataError(error)) {
      throw "Could not load player data. Please try again later.";
    }

    if (isHypixelPlayerLookupError(error)) {
      throw `Could not load guild data for "${player}". Please try again later.`;
    }

    throw "Could not load guild data. Please try again later.";
  }

  if (!guild) {
    throw `${player} is not in a guild.`;
  }

  if (!Array.isArray(guild.members)) {
    throw "Could not read guild member data. Please try again later.";
  }

  const member = guild.members.find((member) => {
    return normalizeUuid(member.uuid) === normalizedUuid;
  });

  if (!member) {
    throw `${player} is not in a guild.`;
  }

  guildMemberRuntimeCache.set(runtimeCacheKey, {
    uuid: normalizedUuid,
    member,
    cachedAt: Date.now()
  });

  return {
    uuid: normalizedUuid,
    member
  };
}

function createProfile(player, weeklyGuildXp, dailyExpHistory, now) {
  const initialPoints = GAMBLE_SETTINGS.giveInitialWeeklyXp
    ? Math.floor(weeklyGuildXp / GAMBLE_SETTINGS.xpToPointRatio)
    : 0;

  return {
    username: player,

    lastGuildXp: weeklyGuildXp,
    claimedDailyExpHistory: { ...dailyExpHistory },
    initialWeeklyXpGranted: true,

    points: initialPoints,
    totalEarnedPoints: initialPoints,

    totalGambled: 0,
    totalWon: 0,
    totalLost: 0,
    wins: 0,
    losses: 0,

    lastGambleAt: 0,
    createdAt: now,
    updatedAt: now
  };
}

function migrateProfileIfNeeded(profile, player, dailyExpHistory, weeklyGuildXp, now) {
  profile.username = player;

  if (profile.initialWeeklyXpGranted !== true) {
    const hasNoRealHistory =
      Number(profile.points || 0) === 0 &&
      Number(profile.totalEarnedPoints || 0) === 0 &&
      Number(profile.totalGambled || 0) === 0 &&
      Number(profile.totalWon || 0) === 0 &&
      Number(profile.totalLost || 0) === 0 &&
      Number(profile.wins || 0) === 0 &&
      Number(profile.losses || 0) === 0;

    if (GAMBLE_SETTINGS.giveInitialWeeklyXp && hasNoRealHistory) {
      const initialPoints = Math.floor(weeklyGuildXp / GAMBLE_SETTINGS.xpToPointRatio);

      profile.points = Number(profile.points || 0) + initialPoints;
      profile.totalEarnedPoints = Number(profile.totalEarnedPoints || 0) + initialPoints;
    }

    profile.initialWeeklyXpGranted = true;
  }

  if (!profile.claimedDailyExpHistory || typeof profile.claimedDailyExpHistory !== "object") {
    profile.claimedDailyExpHistory = { ...dailyExpHistory };
  }

  if (profile.lastGuildXp === undefined || profile.lastGuildXp === null) {
    profile.lastGuildXp = weeklyGuildXp;
  }

  if (profile.totalEarnedPoints === undefined || profile.totalEarnedPoints === null) {
    profile.totalEarnedPoints = 0;
  }

  profile.updatedAt = now;
}

function updatePointsFromDailyExp(profile, dailyExpHistory, now) {
  if (!profile.claimedDailyExpHistory || typeof profile.claimedDailyExpHistory !== "object") {
    profile.claimedDailyExpHistory = {};
  }

  let earnedGuildXp = 0;

  for (const [date, currentXp] of Object.entries(dailyExpHistory)) {
    const previousXp = normalizeXpNumber(profile.claimedDailyExpHistory[date]);
    const normalizedCurrentXp = normalizeXpNumber(currentXp);
    const diff = Math.max(0, normalizedCurrentXp - previousXp);

    if (diff > 0) {
      earnedGuildXp += diff;
    }

    profile.claimedDailyExpHistory[date] = normalizedCurrentXp;
  }

  for (const date of Object.keys(profile.claimedDailyExpHistory)) {
    if (!(date in dailyExpHistory)) {
      delete profile.claimedDailyExpHistory[date];
    }
  }

  const earnedPoints = Math.floor(earnedGuildXp / GAMBLE_SETTINGS.xpToPointRatio);

  if (earnedPoints > 0) {
    profile.points = Number(profile.points || 0) + earnedPoints;
    profile.totalEarnedPoints = Number(profile.totalEarnedPoints || 0) + earnedPoints;
  }

  profile.updatedAt = now;

  return earnedPoints;
}

class PointsCommand extends minecraftCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "points";
    this.aliases = ["balance", "bal", "coins"];
    this.description = "Shows your current gamble points.";
    this.options = [];
  }

  /**
   * @param {string} player
   */
  async onCommand(player) {
    if (!GAMBLE_SETTINGS.enabled) {
      return this.send("Gambling is currently disabled.");
    }

    try {
      const data = loadData();
      const now = Date.now();

      const cachedUuid = getCachedUuidFromData(data, player);
      let uuid = cachedUuid;
      let member = null;
      let apiAvailable = false;

      try {
        const guildMember = await getGuildMemberFromApi(player, data);

        uuid = guildMember.uuid;
        member = guildMember.member;
        apiAvailable = true;
      } catch (apiError) {
        console.error("[POINTS] API unavailable, trying stored profile", {
          player,
          cachedUuid,
          message: getApiErrorMessage(apiError)
        });

        if (!cachedUuid || !getProfileByUuid(data, cachedUuid)) {
          throw apiError;
        }

        uuid = cachedUuid;
      }

      const profileExists = Boolean(getProfileByUuid(data, uuid));

      if (!profileExists && !apiAvailable) {
        throw `Could not create a new gamble profile for "${player}" because the API is unavailable. Try again later.`;
      }

      let weeklyGuildXp = 0;
      let dailyExpHistory = {};

      if (apiAvailable && member) {
        weeklyGuildXp = getWeeklyExperienceTotal(member);
        dailyExpHistory = getDailyExpHistory(member);
      }

      if (!data.players[uuid]) {
        data.players[uuid] = createProfile(player, weeklyGuildXp, dailyExpHistory, now);
      }

      const profile = data.players[uuid];

      if (apiAvailable && member) {
        migrateProfileIfNeeded(profile, player, dailyExpHistory, weeklyGuildXp, now);
        updatePointsFromDailyExp(profile, dailyExpHistory, now);
      } else {
        profile.username = player;
        profile.updatedAt = now;
      }

      saveData(data);

      return this.send(`${player}, you have ${formatNumber(profile.points)} points.`);
    } catch (error) {
      if (isBrokenApiDataError(error)) {
        return this.send("Could not load player data. Please try again later.");
      }

      return this.send(formatError(getApiErrorMessage(error)));
    }
  }
}

module.exports = PointsCommand;