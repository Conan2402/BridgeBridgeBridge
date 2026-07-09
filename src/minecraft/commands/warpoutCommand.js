const { delay } = require("../../contracts/helperFunctions.js");
const minecraftCommand = require("../../contracts/minecraftCommand.js");

class warpoutCommand extends minecraftCommand {
  /** @param {import("minecraft-protocol").Client} minecraft */
  constructor(minecraft) {
    super(minecraft);
    this.name = "warpout";
    this.aliases = ["warp"];
    this.description = "Warp player out of the game";
    this.options = [];
    this.isOnCooldown = false;
  }

  waitForSkyBlockJoin(timeoutMs = 45000) {
    return new Promise((resolve) => {
      let resolved = false;
      let sawConfiguration = false;
      let sawSkyblockTransferMessage = false;
      let sawResourcePack = false;

      const cleanup = () => {
        bot.removeListener("messagestr", messageListener);
        bot.removeListener("end", endListener);
        bot.removeListener("kicked", kickedListener);

        if (bot?._client) {
          bot._client.removeListener("state", stateListener);
          bot._client.removeListener("end", endListener);
          bot._client.removeListener("packet", packetListener);
        }

        clearTimeout(timeout);
      };

      const finish = (result) => {
        if (resolved) {
          return;
        }

        resolved = true;
        cleanup();
        resolve({
          ...result,
          debug: {
            sawConfiguration,
            sawSkyblockTransferMessage,
            sawResourcePack,
            state: bot?._client?.state ?? "unknown"
          }
        });
      };

      const messageListener = (message) => {
        message = message.toString();

        if (message.includes("Sending to server")) {
          sawSkyblockTransferMessage = true;
        }

        if (message.includes("You were kicked while joining that server!")) {
          finish({
            success: false,
            reason: "SkyBlock join failed: kicked while joining that server."
          });
          return;
        }

        if (message.includes("You tried to rejoin too fast")) {
          finish({
            success: false,
            reason: "SkyBlock join failed: tried to rejoin too fast."
          });
          return;
        }

        if (message.includes("You cannot join SkyBlock from here!") || message.includes("Use /lobby first!")) {
          finish({
            success: false,
            reason: "SkyBlock join failed: not in a valid lobby."
          });
          return;
        }

        if (message.includes("You are sending commands too fast") || message.includes("Woah slow down")) {
          finish({
            success: false,
            reason: "SkyBlock join failed: commands too fast."
          });
        }
      };

      const stateListener = (newState, oldState) => {
        if (oldState === "play" && newState === "configuration") {
          sawConfiguration = true;
          return;
        }

        if (sawConfiguration && oldState === "configuration" && newState === "play") {
          setTimeout(() => {
            if (bot?._client?.state === "play") {
              finish({
                success: true,
                reason: "SkyBlock join reached play state."
              });
            }
          }, 500);
        }
      };

      const packetListener = (data, meta) => {
        const packetName = meta?.name;

        if (
          packetName === "resource_pack_send" ||
          packetName === "add_resource_pack" ||
          packetName === "resource_pack_push"
        ) {
          sawResourcePack = true;
        }

        if (packetName === "login" && sawConfiguration) {
          setTimeout(() => {
            if (bot?._client?.state === "play") {
              finish({
                success: true,
                reason: "SkyBlock join received login packet after configuration."
              });
            }
          }, 500);
        }

        if (packetName === "kick_disconnect" || packetName === "disconnect") {
          finish({
            success: false,
            reason: `SkyBlock join failed: disconnect packet (${JSON.stringify(data)}).`
          });
        }
      };

      const endListener = (reason) => {
        finish({
          success: false,
          reason: `SkyBlock join failed: client disconnected (${reason || "unknown reason"}).`
        });
      };

      const kickedListener = (reason) => {
        finish({
          success: false,
          reason: `SkyBlock join failed: kicked (${reason || "unknown reason"}).`
        });
      };

      const timeout = setTimeout(() => {
        finish({
          success: false,
          reason:
            `SkyBlock join failed: timeout. ` +
            `state=${bot?._client?.state ?? "unknown"}, ` +
            `sawConfiguration=${sawConfiguration}, ` +
            `sawSkyblockTransferMessage=${sawSkyblockTransferMessage}, ` +
            `sawResourcePack=${sawResourcePack}.`
        });
      }, timeoutMs);

      bot.on("messagestr", messageListener);
      bot.on("end", endListener);
      bot.on("kicked", kickedListener);

      if (bot?._client) {
        bot._client.on("state", stateListener);
        bot._client.on("end", endListener);
        bot._client.on("packet", packetListener);
      }
    });
  }

  /**
   * @param {string} player
   * @param {string} message
   * */
  async onCommand(player, message) {
    const safeSend = (text) => {
      if (!bot || !bot._client || bot._client.state !== "play") {
        console.log("Minecraft > Skipped command response because bot is not in play state:", text);
        return;
      }

      this.send(text);
    };

    const safeChat = (command) => {
      if (!bot || !bot._client || bot._client.state !== "play") {
        console.log("Minecraft > Skipped chat command because bot is not in play state:", command);
        return false;
      }

      bot.chat(command);
      return true;
    };

    try {
      if (this.isOnCooldown) {
        return safeSend(`${player} Command is on cooldown`);
      }

      this.isOnCooldown = true;

      const user = this.getArgs(message)[0];

      if (user === undefined) {
        throw "Please provide a username!";
      }

      if (!bot || !bot._client || bot._client.state !== "play") {
        this.isOnCooldown = false;
        return safeSend(`SkyBlock join failed: bot is not in play state. state=${bot?._client?.state ?? "unknown"}`);
      }

      safeChat("/lobby megawalls");

      await delay(750);

      if (!bot || !bot._client || bot._client.state !== "play") {
        this.isOnCooldown = false;
        return safeSend(`SkyBlock join failed: bot left play state after /lobby megawalls. state=${bot?._client?.state ?? "unknown"}`);
      }

      if (typeof bot.armSkyblockResourcePackAcceptance === "function") {
        bot.armSkyblockResourcePackAcceptance(45000);
      } else {
        console.warn("Minecraft > bot.armSkyblockResourcePackAcceptance is not available.");
      }

      const skyblockJoinPromise = this.waitForSkyBlockJoin(45000);

      safeChat("/play skyblock");

      const skyblockJoinResult = await skyblockJoinPromise;

      if (!skyblockJoinResult.success) {
        this.isOnCooldown = false;
        console.log("Minecraft > SkyBlock join failed:", stringifyResult(skyblockJoinResult));
        safeSend(skyblockJoinResult.reason);
        return;
      }

      await delay(500);

      if (!bot || !bot._client || bot._client.state !== "play") {
        this.isOnCooldown = false;
        return safeSend(`SkyBlock join failed: expected play state before party invite, got ${bot?._client?.state ?? "unknown"}.`);
      }

      const warpoutListener = async (message) => {
        message = message.toString();

        if (message.includes("You cannot invite that player since they're not online.")) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend(`${user} is offline!`);
        } else if (message.includes("You cannot invite that player")) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend(`${user} has party requests disabled!`);
        } else if (message.includes("invited") && message.includes("to the party! They have 60 seconds to accept.")) {
          safeSend(`Partying ${user}...`);
        } else if (message.includes(" joined the party.")) {
          safeChat("/p warp");
        } else if (
          message.includes("warped to your server") ||
          message.includes("You summoned") ||
          message.includes("joined the lobby!")
        ) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend(`Successfully warped ${user}!`);
          safeChat("/p disband");
          await delay(1500);
          safeChat("/limbo");
        } else if (message.includes(" cannot warp from Limbo")) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend(`${user} cannot be warped from Limbo! Disbanding party..`);
          safeChat("/p disband");
        } else if (message.includes(" is not allowed on your server!")) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend(`${user} is not allowed on my server! Disbanding party..`);
          safeChat("/p leave");
          await delay(1500);
          safeSend("\u00a7");
        } else if (message.includes("You are not allowed to invite players.")) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend("Somehow I'm not allowed to invite players? Disbanding party..");
          safeChat("/p disband");
          await delay(1500);
          safeChat("/limbo");
        } else if (message.includes("You are not allowed to disband this party.")) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend("Somehow I'm not allowed to disband this party? Leaving party..");
          safeChat("/p leave");
          await delay(1500);
          safeChat("/limbo");
        } else if (message.includes("You can't party warp into limbo!")) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend("Somehow I'm inside in limbo? Disbanding party..");
          safeChat("/p disband");
        } else if (message.includes("Couldn't find a player with that name!")) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend("Couldn't find a player with that name!");
          safeChat("/p disband");
        } else if (message.includes("You cannot party yourself!")) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend("I cannot party myself!");
        } else if (message.includes("didn't warp correctly!")) {
          bot.removeListener("message", warpoutListener);
          this.isOnCooldown = false;
          safeSend(`${user} didn't warp correctly! Please try again..`);
          safeChat("/p disband");
        }
      };

      bot.on("message", warpoutListener);

      safeChat(`/p invite ${user}`);

      setTimeout(() => {
        bot.removeListener("message", warpoutListener);

        if (this.isOnCooldown === true) {
          safeSend("Party expired.");
          safeChat("/p disband");
          safeChat("/limbo");

          this.isOnCooldown = false;
        }
      }, 30000);
    } catch (error) {
      safeSend(`${player} [ERROR] ${error || "Something went wrong.."}`);
      this.isOnCooldown = false;
      console.warn("Minecraft > warpoutCommand error:", error);
    }
  }
}

function stringifyResult(result) {
  try {
    return JSON.stringify(result);
  } catch (error) {
    return String(result);
  }
}

module.exports = warpoutCommand;