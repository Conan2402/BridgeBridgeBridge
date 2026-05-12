const { getLatestProfile } = require("../../../../API/functions/getLatestProfile.js");
const { formatNumber, titleCase } = require("../../../contracts/helperFunctions.js");
const { getOverflowSkills, getOverflowSkillAverage } = require("../overflowSkills.js");
const soopyCommand = require("../contracts/soopyCommand.js");

class SkillsCommand extends soopyCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "oskills";
    this.aliases = ["osa", "overflowskills", "overflowskillaverage"];
    this.description = "Overflow Skill Average of specified user.";
  }

  /**
   * @param {string} player
   * @param {string} message
   * @param {string[]} args
   * @param {string} usedAlias
   */
  async onCommand(player, message, args, usedAlias) {
    try {
      const target = args[0] || player;

      const { username, profile } = await getLatestProfile(target);
      const overflowSkills = getOverflowSkills(profile);

      if (!overflowSkills) {
        return this.send(`${username} has no skills.`);
      }

      const overflowSkillAverage = getOverflowSkillAverage(overflowSkills);
      const formattedAverage = formatNumber(overflowSkillAverage, 2);

      if (usedAlias === "osa") {
        return this.send(`${username}'s Overflow Skill Average: ${formattedAverage}`);
      }

      const formattedSkills = Object.entries(overflowSkills).map(([skill, data]) => {
        return `${titleCase(skill)}: ${formatNumber(data.levelWithProgress, 2)}`;
      });

      return this.send(`${username}'s Overflow Skill Average: ${formattedAverage} | ${formattedSkills.join(", ")}`);
    } catch (error) {
      console.error(error);
      return this.send(`[ERROR] ${error}`);
    }
  }
}

module.exports = SkillsCommand;
