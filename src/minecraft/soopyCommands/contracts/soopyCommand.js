const minecraftCommand = require("../../../contracts/minecraftCommand.js");

class soopyCommand extends minecraftCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);

    this.name = "";
    this.aliases = [];
    this.description = "";
  }

  /**
   * Returns the arguments of a soopy-style command.
   * Example: -oskills Player -> ["Player"]
   * @param {string} message
   * @returns {string[]}
   */
  getArgs(message) {
    const args = message.slice(1).trim().split(/ +/);
    args.shift();

    return args;
  }

  /**
   * Executes the command.
   * @param {string} player
   * @param {string} message
   * @param {string[]} args
   * @param {string} usedAlias
   */
  onCommand(player, message, args, usedAlias) {
    throw new Error(`Soopy command ${this.name} has no onCommand implementation. Used alias: ${usedAlias}`);
  }
}

module.exports = soopyCommand;
