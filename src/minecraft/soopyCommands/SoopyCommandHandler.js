const { Collection } = require("discord.js");
const fs = require("fs");

class SoopyCommandHandler {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    this.minecraft = minecraft;
    this.commands = new Collection();

    const commandFiles = fs.readdirSync("./src/minecraft/soopyCommands/commands").filter((file) => file.endsWith(".js"));

    for (const file of commandFiles) {
      const command = new (require(`./commands/${file}`))(minecraft);

      this.commands.set(command.name, command);
    }
  }

  /**
   * @param {string} player
   * @param {string} message
   * @param {boolean} officer
   * @returns {boolean}
   */
  handle(player, message, officer) {
    const args = message.slice(1).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) {
      return false;
    }

    const command = this.commands.get(commandName) ?? this.commands.find((cmd) => cmd.aliases && cmd.aliases.includes(commandName));

    if (command === undefined) {
      return false;
    }

    console.minecraft(`${player} - [soopyCommands:${command.name}] ${message}`);

    command.officer = officer;
    command.onCommand(player, message, args, commandName);

    return true;
  }
}

module.exports = SoopyCommandHandler;
