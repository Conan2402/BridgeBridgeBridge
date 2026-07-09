const CommunicationBridge = require("../contracts/CommunicationBridge.js");
const { replaceVariables } = require("../contracts/helperFunctions.js");
const StateHandler = require("./handlers/StateHandler.js");
const ErrorHandler = require("./handlers/ErrorHandler.js");
const ChatHandler = require("./handlers/ChatHandler.js");
const CommandHandler = require("./CommandHandler.js");
const config = require("../../config.json");
const mineflayer = require("mineflayer");
const Filter = require("bad-words");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const https = require("https");

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

    this.skyblockResourcePackAcceptUntil = 0;
    this.skyblockResourcePackTimeout = null;
    this.skyblockResourcePackHandling = false;
  }

  connect() {
    console.log("Minecraft > Creating bot connection...");

    global.bot = this.createBotConnection();
    this.bot = bot;

    this.registerDebugEvents(this.bot);
    this.registerSkyblockResourcePackHandler(this.bot);

    this.bot._client.on("state", (newState, oldState) => {
      console.log(`Minecraft Client State > ${oldState} -> ${newState}`);

      const isInitialLoginConfiguration = oldState === "login" && newState === "configuration";

      if (isInitialLoginConfiguration) {
        setImmediate(() => {
          try {
            this.bot._client.write("finish_configuration", {});
            console.log("Minecraft > Sent initial finish_configuration packet manually.");
          } catch (error) {
            console.warn("Minecraft > Failed to manually finish initial configuration:", error.message || error);
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

  ensureDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, {
        recursive: true
      });
    }
  }

  getSha1(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha1");
      const stream = fs.createReadStream(filePath);

      stream.on("data", (chunk) => {
        hash.update(chunk);
      });

      stream.on("end", () => {
        resolve(hash.digest("hex"));
      });

      stream.on("error", reject);
    });
  }

  downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith("https:") ? https : http;
      const file = fs.createWriteStream(outputPath);

      const request = client.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close(() => {
            fs.unlink(outputPath, () => {});
          });

          return this.downloadFile(response.headers.location, outputPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close(() => {
            fs.unlink(outputPath, () => {});
          });

          reject(new Error(`HTTP ${response.statusCode} while downloading resource pack.`));
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close(resolve);
        });
      });

      request.on("error", (error) => {
        file.close(() => {
          fs.unlink(outputPath, () => {});
        });

        reject(error);
      });

      file.on("error", (error) => {
        file.close(() => {
          fs.unlink(outputPath, () => {});
        });

        reject(error);
      });
    });
  }

  async downloadAndVerifyResourcePack(packet) {
    if (!packet || !packet.url || !packet.hash) {
      console.warn("Minecraft > Resource pack packet has no url/hash. Cannot download/verify.");
      return false;
    }

    const startedAt = Date.now();
    const resourcePackDirectory = path.resolve(process.cwd(), "resourcepacks", "skyblock");
    const filePath = path.join(resourcePackDirectory, `${packet.hash}.zip`);

    this.ensureDirectory(resourcePackDirectory);

    try {
      if (fs.existsSync(filePath)) {
        const cachedHash = await this.getSha1(filePath);

        if (cachedHash === packet.hash) {
          console.log(`Minecraft > Resource pack cache hit (${Date.now() - startedAt}ms).`);
          return true;
        }

        console.warn("Minecraft > Cached resource pack hash mismatch. Redownloading.");
        fs.unlinkSync(filePath);
      }

      await this.downloadFile(packet.url, filePath);

      const actualHash = await this.getSha1(filePath);

      if (actualHash !== packet.hash) {
        console.warn("Minecraft > Resource pack SHA1 mismatch after download.");
        console.warn(
          stringifySafe({
            expectedHash: packet.hash,
            actualHash
          })
        );
        return false;
      }

      console.log(`Minecraft > Resource pack downloaded and verified (${Date.now() - startedAt}ms).`);
      return true;
    } catch (error) {
      console.warn("Minecraft > Resource pack download/verify failed:", error.message || error);
      return false;
    }
  }

  registerSkyblockResourcePackHandler(bot) {
    const RESOURCE_PACK_RESULTS = {
      SUCCESSFULLY_LOADED: 0,
      DECLINED: 1,
      FAILED_DOWNLOAD: 2,
      ACCEPTED: 3
    };

    bot.armSkyblockResourcePackAcceptance = (timeoutMs = 45000) => {
      this.skyblockResourcePackAcceptUntil = Date.now() + timeoutMs;

      if (this.skyblockResourcePackTimeout) {
        clearTimeout(this.skyblockResourcePackTimeout);
        this.skyblockResourcePackTimeout = null;
      }

      this.skyblockResourcePackTimeout = setTimeout(() => {
        this.skyblockResourcePackAcceptUntil = 0;
        this.skyblockResourcePackTimeout = null;
      }, timeoutMs);
    };

    const isSkyblockResourcePackAcceptanceArmed = () => {
      return Date.now() <= this.skyblockResourcePackAcceptUntil;
    };

    const disarmSkyblockResourcePackAcceptance = () => {
      this.skyblockResourcePackAcceptUntil = 0;

      if (this.skyblockResourcePackTimeout) {
        clearTimeout(this.skyblockResourcePackTimeout);
        this.skyblockResourcePackTimeout = null;
      }
    };

    const writeResourcePackStatus = (packet, result) => {
      if (!packet || packet.uuid === undefined) {
        console.warn("Minecraft > Cannot send resource pack status because packet.uuid is missing.");
        return false;
      }

      try {
        bot._client.write("resource_pack_receive", {
          uuid: packet.uuid,
          result
        });

        return true;
      } catch (error) {
        console.warn("Minecraft > Failed to write resource_pack_receive:", error.message || error);
        return false;
      }
    };

    const finishSkyblockConfiguration = () => {
      if (!bot?._client || bot._client.state !== "configuration") {
        return;
      }

      try {
        bot._client.write("finish_configuration", {});
      } catch (error) {
        console.warn("Minecraft > Failed to send SkyBlock finish_configuration:", error.message || error);
      }
    };

    const acceptSkyblockResourcePack = async (packet = {}) => {
      if (!isSkyblockResourcePackAcceptanceArmed()) {
        return;
      }

      if (this.skyblockResourcePackHandling) {
        return;
      }

      this.skyblockResourcePackHandling = true;

      try {
        const accepted = writeResourcePackStatus(packet, RESOURCE_PACK_RESULTS.ACCEPTED);

        if (!accepted) {
          disarmSkyblockResourcePackAcceptance();
          return;
        }

        const loadedSuccessfully = await this.downloadAndVerifyResourcePack(packet);

        if (!loadedSuccessfully) {
          writeResourcePackStatus(packet, RESOURCE_PACK_RESULTS.FAILED_DOWNLOAD);
          disarmSkyblockResourcePackAcceptance();
          return;
        }

        const loaded = writeResourcePackStatus(packet, RESOURCE_PACK_RESULTS.SUCCESSFULLY_LOADED);

        if (loaded) {
          setTimeout(() => {
            finishSkyblockConfiguration();
          }, 500);
        }

        disarmSkyblockResourcePackAcceptance();
      } finally {
        this.skyblockResourcePackHandling = false;
      }
    };

    bot._client.on("resource_pack_send", acceptSkyblockResourcePack);
    bot._client.on("add_resource_pack", acceptSkyblockResourcePack);
    bot._client.on("resource_pack_push", acceptSkyblockResourcePack);

    bot.on("resourcePack", () => {
      // Handled through raw resource pack packets because newer packets include a UUID.
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