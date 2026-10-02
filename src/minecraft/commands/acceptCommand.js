const minecraftCommand = require("../../contracts/minecraftCommand.js");
const { formatError } = require("../../contracts/helperFunctions.js");
const {
  loadData,
  saveData,
  formatNumber,
  normalizeUuid,
  ensureProfile,
  resolvePlayerUuid,
  findPendingChallengeForTarget,
  deletePendingChallenge
} = require("../other/gambleShared.js");

class AcceptCommand extends minecraftCommand {
  constructor(minecraft) {
    super(minecraft);

    this.name = "accept";
    this.aliases = ["acceptgamble"];
    this.description = "Accept a player gambling challenge.";
    this.options = [
      {
        name: "player",
        description: "Optional challenger name",
        required: false
      }
    ];
  }

  async onCommand(player, message, context = {}) {
    try {
      const args = this.getArgs(message).filter((value) => String(value || "").trim().length > 0);
      const challengerInput = args[0] || null;
      const data = loadData();
      const now = Date.now();

      const targetUuid = normalizeUuid(await resolvePlayerUuid(player, data));
      const challenge = findPendingChallengeForTarget(data, targetUuid, challengerInput);

      if (!challenge) {
        return this.send(
          challengerInput
            ? `No challenge from "${challengerInput}".`
            : "No pending challenges."
        );
      }

      if (challenge.expiresAt && Number(challenge.expiresAt) <= now) {
        deletePendingChallenge(data, challenge.id);
        saveData(data);
        return this.send("No pending challenges.");
      }

      const challengerUuid = normalizeUuid(challenge.fromUuid);
      const challengerName = challenge.fromName || challengerInput || player;
      const targetName = challenge.toName || player;

      const challengerProfile = ensureProfile(data, challengerUuid, challengerName, now);
      const targetProfile = ensureProfile(data, targetUuid, targetName, now);

      const requestedAmount = Math.floor(Number(challenge.amount) || 0);
      const challengerPoints = Math.floor(Number(challengerProfile.points) || 0);
      const targetPoints = Math.floor(Number(targetProfile.points) || 0);

      // amount === 0 means: use the challenger's current available points
      const bet = requestedAmount > 0 ? Math.min(requestedAmount, challengerPoints) : challengerPoints;

      if (bet <= 0) {
        deletePendingChallenge(data, challenge.id);
        saveData(data);
        return this.send("Challenger has no points available.");
      }

      const challengerWon = Math.random() < 0.5;

      let transfer = 0;
      let winner;
      let loser;

      if (challengerWon) {
        transfer = Math.min(bet, targetPoints);
        winner = challengerProfile;
        loser = targetProfile;

        winner.points = Math.floor(Number(winner.points) || 0) + transfer;
        loser.points = Math.max(0, Math.floor(Number(loser.points) || 0) - transfer);
      } else {
        transfer = bet;
        winner = targetProfile;
        loser = challengerProfile;

        winner.points = Math.floor(Number(winner.points) || 0) + transfer;
        loser.points = Math.max(0, Math.floor(Number(loser.points) || 0) - transfer);
      }

      winner.totalEarnedPoints = Math.floor(Number(winner.totalEarnedPoints) || 0) + transfer;
      winner.totalWon = Math.floor(Number(winner.totalWon) || 0) + transfer;
      winner.wins = Math.floor(Number(winner.wins) || 0) + 1;
      winner.totalGambled = Math.floor(Number(winner.totalGambled) || 0) + transfer;

      loser.totalLost = Math.floor(Number(loser.totalLost) || 0) + transfer;
      loser.losses = Math.floor(Number(loser.losses) || 0) + 1;
      loser.totalGambled = Math.floor(Number(loser.totalGambled) || 0) + transfer;

      winner.updatedAt = now;
      loser.updatedAt = now;
      winner.lastGambleAt = now;
      loser.lastGambleAt = now;

      deletePendingChallenge(data, challenge.id);
      saveData(data);

      return this.send(`${winner.username} won ${formatNumber(transfer)} points.`);
    } catch (error) {
      return this.send(formatError(error?.message || String(error || "")));
    }
  }
}

module.exports = AcceptCommand;