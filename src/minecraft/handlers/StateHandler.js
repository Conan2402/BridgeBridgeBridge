const eventHandler = require("../../contracts/EventHandler.js");

class StateHandler extends eventHandler {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super();

    this.minecraft = minecraft;
    this.loginAttempts = 0;
    this.exactDelay = 0;
    this.reconnectTimeout = null;
  }

  registerEvents(bot) {
    this.bot = bot;

    this.bot.on("login", (...args) => this.onLogin(...args));
    this.bot.on("end", (...args) => this.onEnd(...args));
    this.bot.on("kicked", (...args) => this.onKicked(...args));
  }

  onLogin() {
    console.minecraft("Client ready, logged in as " + this.bot.username);

    this.loginAttempts = 0;
    this.exactDelay = 0;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  onEnd(reason) {
    if (reason && reason === "restart") {
      return;
    }

    if (this.reconnectTimeout) {
      return;
    }

    this.loginAttempts++;

    const loginDelay = this.exactDelay > 60000 ? 60000 : this.loginAttempts * 50000;
    console.warn(`Minecraft bot has disconnected! Attempting reconnect in ${loginDelay / 1000} seconds`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.minecraft.connect();
    }, loginDelay);
  }

  onKicked(reason) {
    console.warn(`Minecraft bot has been kicked from the server for "${reason}"`);
  }
}

module.exports = StateHandler;