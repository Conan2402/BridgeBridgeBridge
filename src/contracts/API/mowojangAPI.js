// @ts-ignore
const { get } = require("axios");

const uuidCache = new Map();
const usernameCache = new Map();

const CACHE_TIME = 12 * 60 * 60 * 1000; // 12 Stunden
const REQUEST_TIMEOUT = 7000;

const API_SOURCES = {
  MOJANG: "mojang",
  MOWOJANG: "mowojang"
};

function createApiError(message, details = {}) {
  const error = new Error(message);

  error.source = details.source;
  error.status = details.status;
  error.url = details.url;
  error.code = details.code;
  error.responseData = details.responseData;
  error.originalError = details.originalError;

  return error;
}

function normalizeAxiosError(error, source, url, fallbackMessage) {
  const status = error?.response?.status;
  const responseData = error?.response?.data;
  const code = error?.code;

  if (status === 404 || responseData === "Not found") {
    return createApiError("Invalid username or UUID.", {
      source,
      status,
      url,
      code,
      responseData,
      originalError: error
    });
  }

  if (status === 429) {
    return createApiError(`${source} rate limit reached. Please try again later.`, {
      source,
      status,
      url,
      code,
      responseData,
      originalError: error
    });
  }

  if (code === "ECONNABORTED") {
    return createApiError(`${source} request timed out.`, {
      source,
      status,
      url,
      code,
      responseData,
      originalError: error
    });
  }

  if (code === "ENOTFOUND" || code === "ECONNRESET" || code === "ETIMEDOUT") {
    return createApiError(`Could not reach ${source}.`, {
      source,
      status,
      url,
      code,
      responseData,
      originalError: error
    });
  }

  return createApiError(error?.message || fallbackMessage, {
    source,
    status,
    url,
    code,
    responseData,
    originalError: error
  });
}

async function requestJson(url, source) {
  try {
    const response = await get(url, {
      timeout: REQUEST_TIMEOUT,
      validateStatus: status => status >= 200 && status < 500
    });

    if (response.status === 429) {
      throw createApiError(`${source} rate limit reached. Please try again later.`, {
        source,
        status: response.status,
        url,
        responseData: response.data
      });
    }

    if (response.status === 404) {
      throw createApiError("Invalid username or UUID.", {
        source,
        status: response.status,
        url,
        responseData: response.data
      });
    }

    if (response.status < 200 || response.status >= 300) {
      throw createApiError(`${source} returned HTTP ${response.status}.`, {
        source,
        status: response.status,
        url,
        responseData: response.data
      });
    }

    return response.data;
  } catch (error) {
    if (error?.source) {
      throw error;
    }

    throw normalizeAxiosError(error, source, url, `Failed to request ${source}.`);
  }
}

function logApiError(error) {
  console.error("[Mojang API Error]", {
    message: error?.message,
    source: error?.source,
    status: error?.status,
    url: error?.url,
    code: error?.code,
    responseData: error?.responseData
  });
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{2,16}$/.test(username);
}

function cleanUUID(uuid) {
  return String(uuid).replace(/-/g, "").toLowerCase();
}

function isUUID(value) {
  return /^[0-9a-fA-F]{32}$/.test(cleanUUID(value));
}

/**
 * Get UUID from username using official Mojang API.
 * Falls back to mowojang only if Mojang request fails due to network/service issue.
 *
 * @param {string} username
 * @returns {Promise<string>}
 */
async function getUUID(username) {
  const cleanUsername = String(username).trim();
  const cacheKey = cleanUsername.toLowerCase();

  if (!isValidUsername(cleanUsername)) {
    throw createApiError("Invalid username.", {
      source: "local-validation"
    });
  }

  const cached = uuidCache.get(cacheKey);

  if (cached && cached.last_save + CACHE_TIME > Date.now()) {
    return cached.id;
  }

  const mojangUrl = `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(cleanUsername)}`;
  const mowojangUrl = `https://mowojang.matdoes.dev/${encodeURIComponent(cleanUsername)}`;

  try {
    const data = await requestJson(mojangUrl, API_SOURCES.MOJANG);

    if (!data || !data.id) {
      throw createApiError("Invalid username.", {
        source: API_SOURCES.MOJANG,
        url: mojangUrl,
        responseData: data
      });
    }

    uuidCache.set(cacheKey, {
      last_save: Date.now(),
      id: data.id
    });

    return data.id;
  } catch (mojangError) {
    logApiError(mojangError);

    // Bei ungültigem Username nicht fallbacken.
    // Wenn Mojang sagt 404, dann ist der Name ungültig.
    if (mojangError?.status === 404 || mojangError?.message === "Invalid username or UUID.") {
      throw mojangError;
    }

    // Fallback auf mowojang, falls Mojang nicht erreichbar / timeout / 429 / 5xx etc.
    try {
      const data = await requestJson(mowojangUrl, API_SOURCES.MOWOJANG);

      if (!data || data.errorMessage || !data.id) {
        throw createApiError(data?.errorMessage || "Invalid username.", {
          source: API_SOURCES.MOWOJANG,
          url: mowojangUrl,
          responseData: data
        });
      }

      uuidCache.set(cacheKey, {
        last_save: Date.now(),
        id: data.id
      });

      return data.id;
    } catch (mowojangError) {
      logApiError(mowojangError);

      throw createApiError(
        `Could not fetch UUID for ${cleanUsername}. Mojang failed with "${mojangError.message}", fallback failed with "${mowojangError.message}".`,
        {
          source: "mojang+mowojang",
          originalError: {
            mojang: mojangError,
            mowojang: mowojangError
          }
        }
      );
    }
  }
}

/**
 * Get username from UUID using official Mojang sessionserver.
 * Falls back to mowojang only if Mojang request fails due to network/service issue.
 *
 * @param {string} uuid
 * @returns {Promise<string>}
 */
async function getUsername(uuid) {
  const normalizedUUID = cleanUUID(uuid);

  if (!isUUID(normalizedUUID)) {
    throw createApiError("Invalid UUID.", {
      source: "local-validation"
    });
  }

  const cached = usernameCache.get(normalizedUUID);

  if (cached && cached.last_save + CACHE_TIME > Date.now()) {
    return cached.username;
  }

  const mojangUrl = `https://sessionserver.mojang.com/session/minecraft/profile/${encodeURIComponent(normalizedUUID)}`;
  const mowojangUrl = `https://mowojang.matdoes.dev/${encodeURIComponent(normalizedUUID)}`;

  try {
    const data = await requestJson(mojangUrl, API_SOURCES.MOJANG);

    if (!data || !data.name) {
      throw createApiError("Invalid UUID.", {
        source: API_SOURCES.MOJANG,
        url: mojangUrl,
        responseData: data
      });
    }

    usernameCache.set(normalizedUUID, {
      last_save: Date.now(),
      username: data.name
    });

    return data.name;
  } catch (mojangError) {
    logApiError(mojangError);

    // Bei ungültiger UUID nicht fallbacken.
    if (mojangError?.status === 404 || mojangError?.message === "Invalid username or UUID.") {
      throw mojangError;
    }

    try {
      const data = await requestJson(mowojangUrl, API_SOURCES.MOWOJANG);

      if (!data || data.errorMessage || !data.name) {
        throw createApiError(data?.errorMessage || "Invalid UUID.", {
          source: API_SOURCES.MOWOJANG,
          url: mowojangUrl,
          responseData: data
        });
      }

      usernameCache.set(normalizedUUID, {
        last_save: Date.now(),
        username: data.name
      });

      return data.name;
    } catch (mowojangError) {
      logApiError(mowojangError);

      throw createApiError(
        `Could not fetch username for ${normalizedUUID}. Mojang failed with "${mojangError.message}", fallback failed with "${mowojangError.message}".`,
        {
          source: "mojang+mowojang",
          originalError: {
            mojang: mojangError,
            mowojang: mowojangError
          }
        }
      );
    }
  }
}

/**
 * Resolve username or UUID to both username and UUID.
 *
 * @param {string} input
 * @returns {Promise<{ username: string, uuid: string }>}
 */
async function resolveUsernameOrUUID(input) {
  const value = String(input).trim();

  if (!value) {
    throw createApiError("Invalid username or UUID.", {
      source: "local-validation"
    });
  }

  if (isUUID(value)) {
    const uuid = cleanUUID(value);
    const username = await getUsername(uuid);

    return {
      username,
      uuid
    };
  }

  const uuid = await getUUID(value);

  return {
    username: value,
    uuid
  };
}

module.exports = { getUUID, getUsername, resolveUsernameOrUUID };