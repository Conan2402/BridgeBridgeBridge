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

function parseAverageToken(token) {
  const raw = String(token || "").trim();

  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1 || value > 500) {
    return null;
  }

  return value;
}

function parseRtcaArgs(args, defaultPlayer) {
  const tokens = (args || [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  let target = defaultPlayer;
  let targetAverage = 50;
  let floorInput = "m7";
  let playingClass = null;
  let targetToken = null;
  const extras = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();

    if (FLOORS[lower]) {
      floorInput = lower;
      continue;
    }

    const classDefinition = CLASSES.find((entry) => entry.input.includes(lower));
    if (classDefinition) {
      playingClass = classDefinition.key;
      continue;
    }

    const average = parseAverageToken(token);
    if (average !== null) {
      targetAverage = average;
      continue;
    }

    if (!targetToken) {
      targetToken = token;
      continue;
    }

    extras.push(token);
  }


  if (targetToken) {
    target = targetToken;
  }

  return { target, targetAverage, floorInput, playingClass };
}

class RunsTillClassAverageCommand extends soopyCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "runstillclassaverage";
    this.aliases = ["rtca"];
    this.description = "Runs until Class Average. Usage -rtca [player] [average] [floor] [class].";
  }

  async onCommand(player, message, args) {
    try {
      const parsed = parseRtcaArgs(args, player);
      const floor = getFloorOrDefault(parsed.floorInput);

      const playingClass = parsed.playingClass
        ? CLASSES.find((entry) => entry.key === parsed.playingClass) ?? null
        : null;

      const { username, profile } = await getLatestProfile(parsed.target);
      const memberProfile = getMemberProfile(profile);
      const dungeons = getDungeons(profile);

      const result = await calculateRunsUntilClassAverage(
        dungeons,
        floor,
        memberProfile,
        parsed.targetAverage,
        parsed.playingClass
      );

      if (!Number.isFinite(result.totalRuns)) {
        return this.send("Could not calculate runs until Class Average.");
      }

      if (result.totalRuns <= 0) {
        return this.send(`${username} is already Class Average ${parsed.targetAverage}, gg :)`);
      }

      const classSuffix = playingClass ? ` while only playing ${playingClass.display}` : "";

      if (playingClass) {
        return this.send(
          `It will take ${formatNumber(result.totalRuns)} ${floor.label} runs for ${username} to reach class average ${parsed.targetAverage}${classSuffix}`
        );
      }

      const classParts = result.runsPerClass
        .map((runs, i) => (Number.isFinite(runs) && runs > 0 ? `${formatNumber(runs)} ${CLASSES[i].display}` : null))
        .filter(Boolean);

      const breakdown = classParts.length > 0 ? ` (${classParts.join(", ")})` : "";

      return this.send(
        `It will take ${formatNumber(result.totalRuns)} ${floor.label} runs for ${username} to reach class average ${parsed.targetAverage}${breakdown}`
      );
    } catch (error) {
      console.error(error);
      return this.send("Could not calculate runs until Class Average.");
    }
  }
}

module.exports = RunsTillClassAverageCommand;