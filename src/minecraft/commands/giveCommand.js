// give.js
const minecraftCommand = require("../../contracts/minecraftCommand.js");
const { formatError } = require("../../contracts/helperFunctions.js");
const {
  loadData,
  saveData,
  formatNumber,
  parseBet,
  normalizeUuid,
  ensureProfile,
  resolvePlayerUuid
} = require("../other/gambleShared.js")

class GiveCommand extends minecraftCommand {
  constructor(minecraft) {
    super(minecraft);

    this.name = "give";
    this.aliases = ["pay"];
    this.description = "Give points to another player.";
    this.options = [
      {
        name: "player",
        description: "Target player",
        required: true
      },
      {
        name: "points",
        description: "Amount of points",
        required: true
      }
    ];
  }

  async onCommand(player, message, context = {}) {
    try {
      const args = this.getArgs(message).filter((value) => String(value || "").trim().length > 0);
      const targetInput = args[0];
      const amountInput = args[1];

      if (!targetInput || !amountInput) {
        return this.send("Usage !give <ign> <points>");
      }

      const data = loadData();
      const now = Date.now();

      const senderUuid = normalizeUuid(await resolvePlayerUuid(player, data));
      const targetUuid = normalizeUuid(await resolvePlayerUuid(targetInput, data));

      if (senderUuid === targetUuid) {
        return this.send("You cannot give points to yourself.");
      }

      const senderProfile = ensureProfile(data, senderUuid, player, now);
      const targetProfile = ensureProfile(data, targetUuid, targetInput, now);

      const amount = parseBet(amountInput, senderProfile.points);

      if (amount <= 0) {
        return this.send("The amount must be greater than 0.");
      }

      if (amount > senderProfile.points) {
        return this.send(`You only have ${formatNumber(senderProfile.points)} points.`);
      }

      senderProfile.points -= amount;
      targetProfile.points += amount;

      senderProfile.updatedAt = now;
      targetProfile.updatedAt = now;

      saveData(data);

      return this.send(
        `${player} gave ${formatNumber(amount)} points to ${targetInput}. ` +
        `${player}: ${formatNumber(senderProfile.points)} points, ` +
        `${targetInput}: ${formatNumber(targetProfile.points)} points.`
      );
    } catch (error) {
      return this.send(formatError(error?.message || String(error || "")));
    }
  }
}

module.exports = GiveCommand;