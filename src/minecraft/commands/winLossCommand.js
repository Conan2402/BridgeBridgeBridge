const fs = require("fs");
const path = require("path");

const minecraftCommand = require("../../contracts/minecraftCommand.js");
const { formatError } = require("../../contracts/helperFunctions.js");
const config = require("../../../config.json");

const DATA_FILE = path.join(process.cwd(), "data", "gamble.json");

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { players: {} };
  }

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

function findProfile(data, username) {
  const search = String(username || "").toLowerCase();

  return Object.values(data.players || {}).find(
    (profile) => String(profile.username || "").toLowerCase() === search
  );
}

function formatRatio(wins, losses) {
  wins = Number(wins || 0);
  losses = Number(losses || 0);

  if (wins <= 0 && losses <= 0) {
    return "N/A";
  }

  if (losses <= 0) {
    return wins > 0 ? "Perfect" : "0.00";
  }

  return (wins / losses).toFixed(2);
}

class WinLossCommand extends minecraftCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "wlr";
    this.aliases = ["winloss", "ratio", "wr"];
    this.description = "Shows a player's win/loss ratio.";
    this.options = [
      {
        name: "player",
        description: "Player name. Defaults to yourself.",
        required: false
      }
    ];
  }

  /**
   * @param {string} player
   * @param {string} message
   */
  async onCommand(player, message) {
    if (config.minecraft.gambling?.enabled === false) {
      return this.send("Gambling is currently disabled.");
    }

    try {
      const args = this.getArgs(message);
      const targetName = args[0] || player;

      const data = loadData();
      const profile = findProfile(data, targetName);

      if (!profile) {
        return this.send(`No gamble data found for ${targetName}.`);
      }

      const wins = Number(profile.wins || 0);
      const losses = Number(profile.losses || 0);
      const ratio = formatRatio(wins, losses);

      return this.send(`${profile.username}'s Win-Loss ratio: ${ratio} (${wins}W - ${losses}L)`);
    } catch (error) {
      this.send(formatError(error));
    }
  }
}

module.exports = WinLossCommand;