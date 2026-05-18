const { getSkyblockCalendar } = require("../../../API/functions/getCalendar.js");
const minecraftCommand = require("../../contracts/minecraftCommand.js");
const config = require("../../../config.json");
const axios = require("axios");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let interval = null;
let sentCache = new Set();

function startEventNotifier(bot) {
  const notificationConfig = config.minecraft?.skyblockEventsNotifications;

  if (!notificationConfig?.enabled) {
    return;
  }

  if (!bot) {
    return;
  }

  if (interval) {
    return;
  }

  runEventCheck(bot);

  interval = setInterval(() => {
    runEventCheck(bot);
  }, 60000);
}

function stopEventNotifier() {
  if (!interval) {
    return;
  }

  clearInterval(interval);
  interval = null;
  sentCache.clear();
}

async function runEventCheck(bot) {
  try {
    if (!bot) {
      return;
    }

    const eventBOT = new minecraftCommand(bot);
    eventBOT.officer = false;

    const notificationConfig = config.minecraft?.skyblockEventsNotifications;
    const notifiers = notificationConfig?.notifiers || {};
    const customTime = notificationConfig?.customTime || {};

    const calendar = await getSkyblockCalendar();

    if (!calendar?.events) {
      return;
    }

    const eventKeys = Object.keys(calendar.events);

    for (const eventKey of eventKeys) {
      const eventData = calendar.events[eventKey];

      if (notifiers[eventKey] === false) {
        continue;
      }

      const nextEvent = eventData?.events?.[0];

      if (!nextEvent?.start_timestamp) {
        continue;
      }

      const startTimestamp = nextEvent.start_timestamp;
      const diffMs = startTimestamp - Date.now();

      if (diffMs < 0) {
        continue;
      }

      const minutes = Math.floor(diffMs / 1000 / 60);
      const configuredTimes = getCustomTimes(customTime, eventKey);

      let extraInfo = "";

      if (eventKey === "JACOBS_CONTEST") {
        extraInfo = await getJacobExtraInfo(startTimestamp);
      }

      const eventName = eventData.name || eventKey;

      if (configuredTimes.includes(minutes.toString())) {
        const cacheKey = `${eventKey}-${startTimestamp}-${minutes}`;

        if (!sentCache.has(cacheKey)) {
          sentCache.add(cacheKey);

          sendEventMessage(
            eventBOT,
            `[EVENT] ${eventName}${extraInfo}: Starting in ${minutes}m!`
          );

          await delay(1500);
        }
      }

      if (diffMs <= 60000 && diffMs > 0) {
        const cacheKey = `${eventKey}-${startTimestamp}-now`;

        if (!sentCache.has(cacheKey)) {
          sentCache.add(cacheKey);

          sendEventMessage(
            eventBOT,
            `[EVENT] ${eventName}${extraInfo}: Starting now!`
          );

          await delay(1500);
        }
      }
    }

    cleanSentCache();
  } catch {
    //
  }
}

function getCustomTimes(customTime, eventKey) {
  if (!customTime || !eventKey) {
    return [];
  }

  return Object.keys(customTime).filter((minutes) => {
    const events = customTime[minutes];

    if (!Array.isArray(events)) {
      return false;
    }

    return events.includes(eventKey);
  });
}

async function getJacobExtraInfo(startTimestamp) {
  try {
    const { data } = await axios.get("https://dawjaw.net/jacobs");

    if (!Array.isArray(data)) {
      return "";
    }

    const jacobCrops = data.find(
      (crop) => crop.time >= Math.floor(startTimestamp / 1000)
    );

    if (jacobCrops?.crops !== undefined) {
      return ` (${jacobCrops.crops.join(", ")})`;
    }

    return "";
  } catch {
    return "";
  }
}

function sendEventMessage(eventBOT, message) {
  try {
    if (!eventBOT || typeof eventBOT.send !== "function") {
      return;
    }

    eventBOT.send(message);
  } catch {
    //
  }
}

function cleanSentCache() {
  if (sentCache.size < 500) {
    return;
  }

  sentCache = new Set();
}

module.exports = {
  startEventNotifier,
  stopEventNotifier
};