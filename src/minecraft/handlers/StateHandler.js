const eventHandler = require("../../contracts/EventHandler.js");
const { startEventNotifier, stopEventNotifier } = require("../other/eventNotifier.js");

class StateHandler extends eventHandler {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super();

    this.minecraft = minecraft;
    this.loginAttempts = 0;
    this.exactDelay = 0;
    this.reconnectTimeout = null;
    this.eventNotifierStarted = false;
  }

  registerEvents(bot) {
    this.bot = bot;

    this.bot.on("login", (...args) => this.onLogin(...args));
    this.bot.on("spawn", (...args) => this.onSpawn(...args));
    this.bot.on("end", (...args) => this.onEnd(...args));
    this.bot.on("kicked", (...args) => this.onKicked(...args));

    this.startNotifierOnce();
  }

  startNotifierOnce() {
    if (this.eventNotifierStarted) {
      return;
    }

    this.eventNotifierStarted = true;
    startEventNotifier(this.bot);
  }

  onLogin() {
    console.minecraft("Client ready, logged in as " + this.bot.username);

    this.loginAttempts = 0;
    this.exactDelay = 0;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.startNotifierOnce();
  }

  onSpawn() {
    this.startNotifierOnce();
  }

  onEnd(reason) {
    stopEventNotifier();
    this.eventNotifierStarted = false;

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