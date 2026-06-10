const { getLatestProfile } = require("../../../../API/functions/getLatestProfile.js");
const soopyCommand = require("../contracts/soopyCommand.js");

const {
  FLOORS,
  formatNumber,
  parsePositiveNumber,
  getFloorOrDefault,
  getMemberProfile,
  getDungeons,
  calculateRunsUntilCata,
} = require("../utils/dungeonRuns.js");

class RunsTillCataCommand extends soopyCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "runstillcata";
    this.aliases = ["rtc"];
    this.description = "Runs until Catacombs level.";
  }

  async onCommand(player, message, args) {
    try {
      let target = args[0] || player;
      let targetLevel = 50;
      let floorInput = "m7";

      if (FLOORS[target?.toLowerCase?.()]) {
        floorInput = target.toLowerCase();
        target = player;
      } else {
        targetLevel = parsePositiveNumber(args[1], 50);
        floorInput = args[2] || "m7";

        if (FLOORS[String(args[1] || "").toLowerCase()]) {
          targetLevel = 50;
          floorInput = args[1];
        }
      }

      const floor = getFloorOrDefault(floorInput);

      const { username, profile } = await getLatestProfile(target);
      const memberProfile = getMemberProfile(profile);
      const dungeons = getDungeons(profile);

      const result = await calculateRunsUntilCata(dungeons, floor, memberProfile, targetLevel);

      if (result.runs <= 0) {
        return this.send(`${username} is already Catacombs ${targetLevel}, gg :)`);
      }

      return this.send(
        `It will take ${formatNumber(result.runs)} ${floor.label} runs for ${username} to reach cata ${targetLevel}`
      );
    } catch (error) {
      console.error(error);
      return this.send("Could not calculate runs until Catacombs level.");
    }
  }
}

module.exports = RunsTillCataCommand;