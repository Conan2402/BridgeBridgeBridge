const fs = require("fs");
const path = require("path");
const { getUUID } = require("../../contracts/API/mowojangAPI.js");

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "gamble.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ players: {}, pendingChallenges: {} }, null, 2)
    );
  }
}

function normalizeUuid(uuid) {
  return String(uuid || "").replace(/-/g, "").toLowerCase();
}

function normalizePlayerName(player) {
  return String(player || "").trim().toLowerCase();
}

function formatNumber(number) {
  return Math.floor(Number(number) || 0).toLocaleString("en-US");
}

function loadData() {
  ensureDataFile();

  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    if (!data.players || typeof data.players !== "object") {
      data.players = {};
    }

    if (!data.pendingChallenges || typeof data.pendingChallenges !== "object") {
      data.pendingChallenges = {};
    }

    return data;
  } catch {
    return { players: {}, pendingChallenges: {} };
  }
}

function saveData(data) {
  ensureDataFile();

  const normalized = data && typeof data === "object" ? data : {};

  if (!normalized.players || typeof normalized.players !== "object") {
    normalized.players = {};
  }

  if (!normalized.pendingChallenges || typeof normalized.pendingChallenges !== "object") {
    normalized.pendingChallenges = {};
  }

  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(normalized, null, 2));
  fs.renameSync(tempFile, DATA_FILE);
}

function parseLocalizedNumber(input) {
  if (typeof input !== "string") {
    return NaN;
  }

  let raw = input.trim().replace(/\s+/g, "");

  if (!/^\d+(?:[.,]\d+)*$/.test(raw)) {
    return NaN;
  }

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const commaParts = raw.split(",");

    if (commaParts.length === 2 && commaParts[1].length !== 3) {
      raw = raw.replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (lastDot !== -1) {
    const dotParts = raw.split(".");

    if (dotParts.length > 2 || (dotParts.length === 2 && dotParts[1].length === 3)) {
      raw = raw.replace(/\./g, "");
    }
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function parseCompactNumber(input) {
  if (typeof input !== "string") {
    return NaN;
  }

  const raw = input.trim().toLowerCase().replace(/\s+/g, "");
  const match = raw.match(/^(\d+(?:[.,]\d+)*)([km])?$/);

  if (!match) {
    return NaN;
  }

  const value = parseLocalizedNumber(match[1]);

  if (!Number.isFinite(value)) {
    return NaN;
  }

  if (match[2] === "k") {
    return value * 1_000;
  }

  if (match[2] === "m") {
    return value * 1_000_000;
  }

  return value;
}

function parseBet(input, points) {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw "Bet must be provided.";
  }

  const raw = input.trim().toLowerCase();

  if (raw === "all") {
    return Math.floor(Number(points || 0));
  }

  if (raw.endsWith("%")) {
    const percent = parseLocalizedNumber(raw.slice(0, -1));

    if (!Number.isFinite(percent)) {
      throw "Percentage must be a valid number. Examples: 12.5%, 12,5%, 50%.";
    }

    if (percent <= 0 || percent > 100) {
      throw "Percentage must be between 0% and 100%.";
    }

    return Math.floor(Number(points || 0) * (percent / 100));
  }

  const amount = parseCompactNumber(raw);

  if (!Number.isFinite(amount)) {
    throw "Bet must be a valid number. Examples: 100, 250k, 1.5m, 1,5m, 50%, 12,5%, all.";
  }

  return Math.floor(amount);
}

function isBetLikeToken(input) {
  if (typeof input !== "string") {
    return false;
  }

  const raw = input.trim().toLowerCase();
  return raw === "all" || raw.endsWith("%") || /^(\d+(?:[.,]\d+)*)([km])?$/.test(raw);
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

async function resolvePlayerUuid(player, data) {
  const cachedUuid = getCachedUuidFromData(data, player);

  if (cachedUuid) {
    return cachedUuid;
  }

  const uuid = await getUUID(player);
  const normalizedUuid = normalizeUuid(uuid);

  if (!normalizedUuid) {
    throw `Could not find a Player named "${player}".`;
  }

  return normalizedUuid;
}

function createBlankProfile(player, now) {
  return {
    username: player,
    points: 0,
    totalEarnedPoints: 0,
    totalGambled: 0,
    totalWon: 0,
    totalLost: 0,
    wins: 0,
    losses: 0,
    lastGambleAt: 0,
    createdAt: now,
    updatedAt: now,
    initialWeeklyXpGranted: true
  };
}

function ensureProfile(data, uuid, player, now = Date.now()) {
  const normalizedUuid = normalizeUuid(uuid);

  if (!data.players[normalizedUuid]) {
    data.players[normalizedUuid] = createBlankProfile(player, now);
  }

  const profile = data.players[normalizedUuid];
  profile.username = player;
  profile.points = Math.floor(Number(profile.points) || 0);
  profile.totalEarnedPoints = Math.floor(Number(profile.totalEarnedPoints) || 0);
  profile.totalGambled = Math.floor(Number(profile.totalGambled) || 0);
  profile.totalWon = Math.floor(Number(profile.totalWon) || 0);
  profile.totalLost = Math.floor(Number(profile.totalLost) || 0);
  profile.wins = Math.floor(Number(profile.wins) || 0);
  profile.losses = Math.floor(Number(profile.losses) || 0);
  profile.lastGambleAt = Math.floor(Number(profile.lastGambleAt) || 0);
  profile.updatedAt = now;

  return profile;
}

function buildChallengeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getPendingChallengesStore(data) {
  if (!data.pendingChallenges || typeof data.pendingChallenges !== "object") {
    data.pendingChallenges = {};
  }

  return data.pendingChallenges;
}
function findPendingChallengeForPair(data, challengerUuid, targetUuid) {
  const now = Date.now();
  const normalizedChallengerUuid = normalizeUuid(challengerUuid);
  const normalizedTargetUuid = normalizeUuid(targetUuid);
  const store = getPendingChallengesStore(data);

  return (
    Object.values(store).find((challenge) => {
      if (!challenge || typeof challenge !== "object") {
        return false;
      }

      return (
        normalizeUuid(challenge.fromUuid) === normalizedChallengerUuid &&
        normalizeUuid(challenge.toUuid) === normalizedTargetUuid &&
        (!challenge.expiresAt || Number(challenge.expiresAt) > now)
      );
    }) || null
  );
}
function getActivePendingChallengesForTarget(data, targetUuid) {
  const now = Date.now();
  const normalizedTargetUuid = normalizeUuid(targetUuid);
  const store = getPendingChallengesStore(data);

  return Object.values(store)
    .filter((challenge) => {
      if (!challenge || typeof challenge !== "object") {
        return false;
      }

      if (normalizeUuid(challenge.toUuid) !== normalizedTargetUuid) {
        return false;
      }

      return !challenge.expiresAt || Number(challenge.expiresAt) > now;
    })
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function findPendingChallengeForTarget(data, targetUuid, challengerInput = null) {
  const active = getActivePendingChallengesForTarget(data, targetUuid);

  if (!challengerInput) {
    return active[0] || null;
  }

  const normalizedInput = normalizePlayerName(challengerInput);
  const normalizedUuidInput = normalizeUuid(challengerInput);

  return (
    active.find((challenge) => {
      return (
        normalizePlayerName(challenge.fromName) === normalizedInput ||
        normalizeUuid(challenge.fromUuid) === normalizedUuidInput
      );
    }) || null
  );
}

function deletePendingChallenge(data, challengeId) {
  const store = getPendingChallengesStore(data);
  delete store[challengeId];
}

module.exports = {
  formatNumber,
  loadData,
  saveData,
  normalizeUuid,
  normalizePlayerName,
  parseBet,
  isBetLikeToken,
  resolvePlayerUuid,
  ensureProfile,
  buildChallengeId,
  getPendingChallengesStore,
  getActivePendingChallengesForTarget,
  findPendingChallengeForTarget,
  findPendingChallengeForPair,
  deletePendingChallenge
};