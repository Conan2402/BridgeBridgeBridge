const fs = require("fs");
const path = require("path");

const minecraftCommand = require("../../contracts/minecraftCommand.js");
const { formatError } = require("../../contracts/helperFunctions.js");
const hypixel = require("../../contracts/API/HypixelRebornAPI.js");
const { getUUID } = require("../../contracts/API/mowojangAPI.js");
const config = require("../../../config.json");

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "gamble.json");

const GAMBLE_SETTINGS = {
  enabled: true,

  // Guild experience to points ratio
  xpToPointRatio: 1,

  minBet: 1,
  maxBet: 1_000_000,

  winChance: 0.45,
  winMultiplier: 2,

  cooldownSeconds: 10,

  giveInitialWeeklyXp: true
};

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

    if (!data.players) {
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

function parseBet(input, points) {
  if (!input) {
    throw "Usage: !gamble <amount | amount% | all>";
  }

  const raw = input.toLowerCase();

  if (raw === "all") {
    return points;
  }

  if (raw.endsWith("%")) {
    const percent = Number(raw.slice(0, -1));

    return Math.floor(points * (percent / 100));
  }

  const amount = Number(raw.replace(/,/g, ""));

  return Math.floor(amount);
}

class GambleCommand extends minecraftCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "gamble";
    this.aliases = ["bet"];
    this.description = "Gamble points earned from guild experience.";
    this.options = [
      {
        name: "amount",
        description: "Amount, percentage, or all",
        required: true
      }
    ];
  }

  /**
   * @param {string} player
   * @param {string} message
   */
  async onCommand(player, message) {
    if (config.minecraft.gambling?.enabled === false || !GAMBLE_SETTINGS.enabled) {
      return this.send("Gambling is currently disabled.");
    }

    const args = this.getArgs(message);
    const betInput = args[0];

    try {
      const [uuid, guild] = await Promise.all([
        getUUID(player),
        hypixel.getGuild("player", player, { noCaching: true })
      ]);

      if (!guild || !Array.isArray(guild.members)) {
        throw "Player is not in the Guild.";
      }

      const member = guild.members.find((member) => member.uuid == uuid);

      if (member === undefined) {
        throw "Player is not in the Guild.";
      }

      const now = Date.now();
      const currentGuildXp = Number(member.weeklyExperience || 0);

      const data = loadData();

      if (!data.players[uuid]) {
        data.players[uuid] = {
          username: player,
          lastGuildXp: GAMBLE_SETTINGS.giveInitialWeeklyXp ? 0 : currentGuildXp,
          points: 0,
          totalEarnedPoints: 0,
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

      const profile = data.players[uuid];
      profile.username = player;

      const lastGambleAt = Number(profile.lastGambleAt || 0);
      const cooldownMs = GAMBLE_SETTINGS.cooldownSeconds * 1000;

      if (now - lastGambleAt < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (now - lastGambleAt)) / 1000);
        throw `You are on cooldown. Try again in ${remaining}s.`;
      }

      if (currentGuildXp < Number(profile.lastGuildXp || 0)) {
        // Weekly GEXP reset detected.
        // Existing points stay, only baseline gets reset.
        profile.lastGuildXp = currentGuildXp;
      }

      const earnedGuildXp = Math.max(0, currentGuildXp - Number(profile.lastGuildXp || 0));
      const ratio = Math.max(1, Number(GAMBLE_SETTINGS.xpToPointRatio || 1));
      const earnedPoints = Math.floor(earnedGuildXp / ratio);

      if (earnedPoints > 0) {
        profile.points = Number(profile.points || 0) + earnedPoints;
        profile.totalEarnedPoints = Number(profile.totalEarnedPoints || 0) + earnedPoints;

        // Keeps leftover XP if xpToPointRatio > 1.
        profile.lastGuildXp = Number(profile.lastGuildXp || 0) + earnedPoints * ratio;
      }

      const currentPoints = Math.floor(Number(profile.points || 0));
      const bet = parseBet(betInput, currentPoints);

      if (bet < GAMBLE_SETTINGS.minBet) {
        throw `Minimum bet is ${formatNumber(GAMBLE_SETTINGS.minBet)} points.`;
      }

      if (bet > GAMBLE_SETTINGS.maxBet) {
        throw `Maximum bet is ${formatNumber(GAMBLE_SETTINGS.maxBet)} points.`;
      }

      if (bet > currentPoints) {
        throw `You only have ${formatNumber(currentPoints)} points.`;
      }

      if (bet <= 0) {
        throw "You do not have enough points to gamble.";
      }

      const won = Math.random() < GAMBLE_SETTINGS.winChance;
      const payout = Math.floor(bet * GAMBLE_SETTINGS.winMultiplier);

      profile.totalGambled = Number(profile.totalGambled || 0) + bet;
      profile.lastGambleAt = now;
      profile.updatedAt = now;

      if (won) {
        const profit = payout - bet;

        profile.points = currentPoints + profit;
        profile.totalWon = Number(profile.totalWon || 0) + profit;
        profile.wins = Number(profile.wins || 0) + 1;

        saveData(data);

        return this.send(
          `${player} won ${formatNumber(profit)} points! Balance: ${formatNumber(profile.points)}.`
        );
      }

      profile.points = currentPoints - bet;
      profile.totalLost = Number(profile.totalLost || 0) + bet;
      profile.losses = Number(profile.losses || 0) + 1;

      saveData(data);

      return this.send(
        `${player} lost ${formatNumber(bet)} points. Balance: ${formatNumber(profile.points)}.`
      );
    } catch (error) {
      this.send(formatError(error));
    }
  }
}

module.exports = GambleCommand;