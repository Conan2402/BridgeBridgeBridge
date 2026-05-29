const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const LINKED_FILE = path.join(DATA_DIR, "linked.json");
const LINKED_PROFILES_FILE = path.join(DATA_DIR, "linkedProfiles.json");

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(LINKED_FILE)) {
    fs.writeFileSync(LINKED_FILE, JSON.stringify({}, null, 2));
  }

  if (!fs.existsSync(LINKED_PROFILES_FILE)) {
    fs.writeFileSync(LINKED_PROFILES_FILE, JSON.stringify({}, null, 2));
  }
}

function readJson(file, fallback) {
  ensureDataFiles();

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDataFiles();

  const tempFile = `${file}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, file);
}

function setVerifiedAccount({ uuid, discordUser, username }) {
  const linked = readJson(LINKED_FILE, {});
  const profiles = readJson(LINKED_PROFILES_FILE, {});

  linked[uuid] = discordUser.id;

  profiles[discordUser.id] = {
    discordId: discordUser.id,
    discordUsername: discordUser.username,
    uuid,
    username,
    updatedAt: Date.now()
  };

  writeJson(LINKED_FILE, linked);
  writeJson(LINKED_PROFILES_FILE, profiles);
}

function getByDiscordId(discordId) {
  const profiles = readJson(LINKED_PROFILES_FILE, {});
  const profile = profiles[discordId];

  if (profile?.username && profile?.uuid) {
    return profile;
  }

  return null;
}

function removeByDiscordId(discordId) {
  const linked = readJson(LINKED_FILE, {});
  const profiles = readJson(LINKED_PROFILES_FILE, {});
  const profile = profiles[discordId];

  if (!profile) {
    return null;
  }

  if (profile.uuid) {
    delete linked[profile.uuid];
  }

  delete profiles[discordId];

  writeJson(LINKED_FILE, linked);
  writeJson(LINKED_PROFILES_FILE, profiles);

  return profile;
}

module.exports = {
  setVerifiedAccount,
  getByDiscordId,
  removeByDiscordId
};