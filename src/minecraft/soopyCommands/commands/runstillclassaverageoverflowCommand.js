const { getLatestProfile } = require("../../../../API/functions/getLatestProfile.js");
const soopyCommand = require("../contracts/soopyCommand.js");

const {
  CLASSES,
  FLOORS,
  formatNumber,
  parsePositiveNumber,
  getFloorOrDefault,
  getMemberProfile,
  getDungeons,
  calculateRunsUntilClassAverage,
} = require("../utils/dungeonRuns.js");

class RunsTillClassAverageOverflowCommand extends soopyCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "runstillclassaverageoverflow";
    this.aliases = ["rtcao"];
    this.description = "Runs until overflow Class Average.";
  }

  async onCommand(player, message, args) {
    try {
      let target = args[0] || player;
      let targetAverage = 50;
      let floorInput = "m7";

      if (FLOORS[target?.toLowerCase?.()]) {
        floorInput = target.toLowerCase();
        target = player;
      } else {
        targetAverage = parsePositiveNumber(args[1], 50);
        floorInput = args[2] || "m7";

        if (FLOORS[String(args[1] || "").toLowerCase()]) {
          targetAverage = 50;
          floorInput = args[1];
        }
      }

      const floor = getFloorOrDefault(floorInput);

      const { username, profile } = await getLatestProfile(target);
      const memberProfile = getMemberProfile(profile);
      const dungeons = getDungeons(profile);

      const result = await calculateRunsUntilClassAverage(dungeons, floor, memberProfile, targetAverage);

      if (result.totalRuns <= 0) {
        return this.send(`${username} is already Class Average ${targetAverage}, gg :)`);
      }

     const classParts = result.runsPerClass
       .map((runs, i) => (runs > 0 ? `${formatNumber(runs)} ${CLASSES[i].display}` : null))
       .filter(Boolean);

     return this.send(
       `It will take ${formatNumber(result.totalRuns)} ${floor.label} runs for ${username} to reach class average ${targetAverage} (${classParts.join(", ")})`
     );
    } catch (error) {
      console.error(error);
      return this.send("Could not calculate runs until overflow Class Average.");
    }
  }
}

module.exports = RunsTillClassAverageOverflowCommand;