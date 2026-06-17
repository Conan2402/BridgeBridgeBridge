const { getLatestProfile } = require("../../../../API/functions/getLatestProfile.js");
const { formatNumber, titleCase } = require("../../../contracts/helperFunctions.js");
const { getOverflowSkills } = require("../overflowSkills.js");
const soopyCommand = require("../contracts/soopyCommand.js");

const SKILL_ALIASES = {
  alchemy: "alchemy",
  alch: "alchemy",

  carpentry: "carpentry",
  carp: "carpentry",

  combat: "combat",
  cb: "combat",

  enchanting: "enchanting",
  ench: "enchanting",

  farming: "farming",
  farm: "farming",

  fishing: "fishing",
  fish: "fishing",

  foraging: "foraging",
  forage: "foraging",
  forag: "foraging",

  hunting: "hunting",
  hunt: "hunting",

  mining: "mining",
  mine: "mining",

  taming: "taming",
  tame: "taming"
};

function normalizeSkill(value) {
  if (!value) {
    return null;
  }

  return SKILL_ALIASES[value.toLowerCase()] ?? null;
}

function formatXP(value) {
  const number = Math.floor(Number(value) || 0);

  return number.toLocaleString("en-US");
}

class SkillLvlCommand extends soopyCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "skilllvl";
    this.aliases = ["sl", "skilllevel"];
    this.description = "Overflow skill level of specified user.";
  }

  /**
   * @param {string} player
   * @param {string} message
   * @param {string[]} args
   * @param {string} usedAlias
   */
  async onCommand(player, message, args, usedAlias) {
    try {
      if (args.length === 0) {
        return this.send("Usage | -sl <skill> [player]");
      }

      let target = player;
      let skill = normalizeSkill(args[0]);

      if (skill) {
        target = args[1] || player;
      } else {
        target = args[0];
        skill = normalizeSkill(args[1]);
      }

      if (!skill) {
        return this.send("Invalid skill.");
      }

      const { username, profile } = await getLatestProfile(target);
      const overflowSkills = getOverflowSkills(profile);

      if (!overflowSkills) {
        return this.send(`${username} has Skills API disabled.`);
      }

      const skillData = overflowSkills[skill];

      if (!skillData) {
        return this.send(`${username} has no ${titleCase(skill)} experience.`);
      }

      const level = formatNumber(Number(skillData.levelWithProgress), 2);
      const xp = formatXP(skillData.xp);

      return this.send(`${username}'s ${titleCase(skill)} Level: ${level} (${xp} exp)`);
    } catch (error) {
      console.error(`[soopyCommands:skilllvl] Failed to run command`, error);
      return this.send("Something went wrong while running the command.");
    }
  }
}

module.exports = SkillLvlCommand;