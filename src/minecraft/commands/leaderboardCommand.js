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

    if (!data.players || typeof data.players !== "object") {
      data.players = {};
    }

    return data;
  } catch {
    return { players: {} };
  }
}

function formatNumber(number) {
  return Math.trunc(Number(number) || 0).toLocaleString("en-US");
}

function formatDecimal(number, digits = 1) {
  const value = Number(number);
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function getHelpText() {
  return "Leaderboard options: points, won, lost, gambled, wins, losses, winrate, avgwin, avgloss. Default: points.";
}

function getStatTypes() {
  return {
    points: {
      label: "Points",
      getValue: (profile) => Number(profile.points || 0),
      formatValue: (value) => formatNumber(value)
    },
    won: {
      label: "Won",
      getValue: (profile) => Number(profile.totalWon || 0),
      formatValue: (value) => formatNumber(value)
    },
    lost: {
      label: "Lost",
      getValue: (profile) => Number(profile.totalLost || 0),
      formatValue: (value) => formatNumber(value)
    },
    gambled: {
      label: "Gambled",
      getValue: (profile) => Number(profile.totalGambled || 0),
      formatValue: (value) => formatNumber(value)
    },
    wins: {
      label: "Wins",
      getValue: (profile) => Number(profile.wins || 0),
      formatValue: (value) => formatNumber(value)
    },
    losses: {
      label: "Losses",
      getValue: (profile) => Number(profile.losses || 0),
      formatValue: (value) => formatNumber(value)
    },
    winrate: {
      label: "Winrate",
      getValue: (profile) => {
        const wins = Number(profile.wins || 0);
        const losses = Number(profile.losses || 0);
        const games = wins + losses;

        if (games <= 0) {
          return 0;
        }

        return (wins / games) * 100;
      },
      formatValue: (value) => `${formatDecimal(value, 1)}%`
    },
    avgwin: {
      label: "Avg Win",
      getValue: (profile) => {
        const wins = Number(profile.wins || 0);
        const totalWon = Number(profile.totalWon || 0);

        if (wins <= 0) {
          return 0;
        }

        return totalWon / wins;
      },
      formatValue: (value) => formatDecimal(value, 1)
    },
    avgloss: {
      label: "Avg Loss",
      getValue: (profile) => {
        const losses = Number(profile.losses || 0);
        const totalLost = Number(profile.totalLost || 0);

        if (losses <= 0) {
          return 0;
        }

        return totalLost / losses;
      },
      formatValue: (value) => formatDecimal(value, 1)
    }
  };
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
        description: "points, won, lost, gambled, wins, losses, winrate, avgwin, avgloss",
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
      const args = this.getArgs(message).filter((value) => String(value || "").trim().length > 0);
      const type = (args[0] || "points").toLowerCase();
      const types = getStatTypes();

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
        .filter((entry) => Number.isFinite(entry.value))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      if (players.length === 0) {
        return this.send(`No ${selected.label.toLowerCase()} leaderboard data yet.`);
      }

      const leaderboard = players
        .map((entry, index) => `#${index + 1} ${entry.username}: ${selected.formatValue(entry.value)}`)
        .join(" | ");

      return this.send(`${selected.label} Leaderboard: ${leaderboard}`);
    } catch (error) {
      return this.send(formatError(error?.message || String(error || "")));
    }
  }
}

module.exports = LeaderboardCommand;