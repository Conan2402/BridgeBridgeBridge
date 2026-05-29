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

function formatNumber(number) {
  return Math.floor(Number(number) || 0).toLocaleString("en-US");
}

function getHelpText() {
  return "Leaderboard options - points, won, lost, gambled, wins, losses. Default: points.";
}

class LeaderboardCommand extends minecraftCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "leaderboard";
    this.aliases = ["lb", "top", "gambletop"];
    this.description = "Shows the gamble points leaderboard.";
    this.options = [
      {
        name: "type",
        description: "points, won, lost, gambled, wins, losses",
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
      const type = (args[0] || "points").toLowerCase();

      const types = {
        points: {
          label: "Points",
          getValue: (profile) => Number(profile.points || 0)
        },
        won: {
          label: "Won",
          getValue: (profile) => Number(profile.totalWon || 0)
        },
        lost: {
          label: "Lost",
          getValue: (profile) => Number(profile.totalLost || 0)
        },
        gambled: {
          label: "Gambled",
          getValue: (profile) => Number(profile.totalGambled || 0)
        },
        wins: {
          label: "Wins",
          getValue: (profile) => Number(profile.wins || 0)
        },
        losses: {
          label: "Losses",
          getValue: (profile) => Number(profile.losses || 0)
        }
      };

      if (type === "help") {
        return this.send(getHelpText());
      }

      if (!types[type]) {
        return this.send(getHelpText());
      }

      const selected = types[type];

      const players = Object.values(loadData().players || {})
        .map((profile) => ({
          username: profile.username || "Unknown",
          value: selected.getValue(profile)
        }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      if (players.length === 0) {
        return this.send(`No ${selected.label.toLowerCase()} leaderboard data yet.`);
      }

      const leaderboard = players
        .map((entry, index) => `#${index + 1} ${entry.username}: ${formatNumber(entry.value)}`)
        .join(" | ");

      return this.send(`${selected.label} Leaderboard: ${leaderboard}`);
    } catch (error) {
      this.send(formatError(error));
    }
  }
}

module.exports = LeaderboardCommand;