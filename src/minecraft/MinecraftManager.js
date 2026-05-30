const CommunicationBridge = require("../contracts/CommunicationBridge.js");
const { replaceVariables } = require("../contracts/helperFunctions.js");
const StateHandler = require("./handlers/StateHandler.js");
const ErrorHandler = require("./handlers/ErrorHandler.js");
const ChatHandler = require("./handlers/ChatHandler.js");
const CommandHandler = require("./CommandHandler.js");
const config = require("../../config.json");
const mineflayer = require("mineflayer");
const Filter = require("bad-words");

const filter = new Filter();
const fileredWords = config.discord.other.filterWords ?? "";
filter.addWords(...fileredWords);

function stringifySafe(value) {
  try {
    if (typeof value === "string") {
      return value;
    }

    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

class MinecraftManager extends CommunicationBridge {
  constructor(app) {
    super();

    this.app = app;

    this.stateHandler = new StateHandler(this);
    this.errorHandler = new ErrorHandler(this);
    this.chatHandler = new ChatHandler(this, new CommandHandler(this));
  }

  connect() {
    console.log("Minecraft > Creating bot connection...");

    global.bot = this.createBotConnection();
    this.bot = bot;

    this.registerDebugEvents(this.bot);

    this.bot._client.on("state", (newState, oldState) => {
      console.log(`Minecraft Client State > ${oldState} -> ${newState}`);

      if (newState === "configuration") {
        setImmediate(() => {
          try {
            this.bot._client.write("finish_configuration", {});
            console.log("Minecraft > Sent finish_configuration packet manually.");
          } catch (error) {
            console.warn("Minecraft > Failed to manually finish configuration:", error);
          }
        });
      }
    });

    this.errorHandler.registerEvents(this.bot);
    this.stateHandler.registerEvents(this.bot);
    this.chatHandler.registerEvents(this.bot);

    this.bot.on("login", () => {
      console.log("Minecraft > Bot login event fired.");
      console.log("Minecraft bot is ready!");

      require("./other/eventNotifier.js");
      require("./other/skyblockNotifier.js");
      require("./other/alphaPlayerCountTracker.js");
    });
  }

  registerDebugEvents(bot) {
    bot.on("kicked", (reason, loggedIn) => {
      console.log("========== MINECRAFT KICKED ==========");
      console.log("Logged in:", loggedIn);
      console.log("Reason:", stringifySafe(reason));
      console.log("Client state:", bot?._client?.state);
      console.log("======================================");
    });

    bot.on("end", (reason) => {
      console.log("========== MINECRAFT END ==========");
      console.log("Reason:", stringifySafe(reason));
      console.log("Client state:", bot?._client?.state);
      console.log("===================================");
    });

    bot.on("error", (error) => {
      console.log("========== MINECRAFT ERROR ==========");
      console.log(error && error.stack ? error.stack : stringifySafe(error));
      console.log("Client state:", bot?._client?.state);
      console.log("=====================================");
    });

    bot.on("messagestr", (message) => {
      console.log("Minecraft MessageStr >", message);
    });

    bot._client.on("kick_disconnect", (packet) => {
      console.log("========== MINECRAFT KICK_DISCONNECT PACKET ==========");
      console.log(stringifySafe(packet));
      console.log("Client state:", bot?._client?.state);
      console.log("======================================================");
    });

    bot._client.on("disconnect", (packet) => {
      console.log("========== MINECRAFT DISCONNECT PACKET ==========");
      console.log(stringifySafe(packet));
      console.log("Client state:", bot?._client?.state);
      console.log("=================================================");
    });

    bot._client.on("error", (error) => {
      console.log("========== MINECRAFT CLIENT ERROR ==========");
      console.log(error && error.stack ? error.stack : stringifySafe(error));
      console.log("Client state:", bot?._client?.state);
      console.log("============================================");
    });

    bot._client.on("end", (reason) => {
      console.log("========== MINECRAFT CLIENT END ==========");
      console.log("Reason:", stringifySafe(reason));
      console.log("Client state:", bot?._client?.state);
      console.log("==========================================");
    });
  }

  createBotConnection() {
    return mineflayer.createBot({
      host: "mc.hypixel.net",
      port: 25565,
      auth: "microsoft",
      version: "1.21.11",
      profilesFolder: "./auth-cache",
      plugins: {
        blocks: false,
        physics: false,
        inventory: false,
        simple_inventory: false,
        entities: false,
        painting: false,
        digging: false,
        collectBlock: false,
        craft: false,
        chest: false,
        furnace: false,
        enchantment_table: false,
        villager: false,
        bed: false,
        rain: false,
        ray_trace: false,
        sound: false,
        experience: false,
        health: false,
        breath: false,
        boss_bar: false,
        scoreBoard: false,
        book: false,
        command_block: false,
        tablist: false,
        time: false,
        title: false,
        game: false
      }
    });
  }

  async onBroadcast({ channel, username, message, replyingTo, discord }) {
    console.broadcast(`${username}: ${message}`, "Minecraft");

    if (!this.bot || !this.bot._client || this.bot._client.state !== "play") {
      return;
    }

    if (channel === config.discord.channels.debugChannel && config.discord.channels.debugMode === true) {
      return this.bot.chat(message);
    }

    if (config.discord.other.filterMessages) {
      try {
        message = filter.clean(message);
        username = filter.clean(username);
      } catch (error) {
        // Do nothing
      }
    }

    if (config.discord.other.stripEmojisFromUsernames) {
      try {
        username = username.replace(/:[\w\-_]+:/g, "");
      } catch (error) {
        // Do nothing
      }
    }

    message = replaceVariables(config.minecraft.bot.messageFormat, { username, message });

    const chat = channel === config.discord.channels.officerChannel ? "/oc" : "/gc";

    if (replyingTo) {
      message = message.replace(username, `${username} replying to ${replyingTo}`);

      const clean = (value) =>
        String(value ?? "")
          .replace(/§[0-9a-fk-or]/gi, "")
          .trim()
          .toLowerCase();

      global.replyBridgeEchoCache ??= new Set();
      global.replyBridgeEchoCache.add(clean(message));

      setTimeout(() => {
        global.replyBridgeEchoCache.delete(clean(message));
      }, 15000);
    }

    let successfullySent = false;

    const messageListener = (receivedMessage) => {
      receivedMessage = receivedMessage.toString();

      if (
        receivedMessage.trim().includes(message.trim()) &&
        (this.chatHandler.isGuildMessage(receivedMessage) || this.chatHandler.isOfficerMessage(receivedMessage))
      ) {
        bot.removeListener("message", messageListener);
        successfullySent = true;
      }
    };

    bot.on("message", messageListener);
    this.bot.chat(`${chat} ${message}`);

    setTimeout(() => {
      bot.removeListener("message", messageListener);

      if (successfullySent === true) {
        return;
      }

      discord.react("❌");
    }, 3000);
  }
}

module.exports = MinecraftManager;