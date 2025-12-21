import { existsSync, readFileSync, writeFileSync } from "fs";

/**
 * Logger utility for consistent, formatted console output
 */
export const logger = {
  /**
   * Log success message
   * @param {string} message
   */
  success(message) {
    console.log(`✅ ${message}`);
  },

  /**
   * Log error message
   * @param {string} message
   */
  error(message) {
    console.error(`❌ ${message}`);
  },

  /**
   * Log warning message
   * @param {string} message
   */
  warn(message) {
    console.log(`⚠️ ${message}`);
  },

  /**
   * Log info message
   * @param {string} message
   */
  info(message) {
    console.log(`ℹ️  ${message}`);
  },

  /**
   * Log section divider
   */
  divider() {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  },

  /**
   * Log generic message
   * @param {string} message
   */
  log(message) {
    console.log(message);
  },
};

/**
 * File I/O utility for JSON operations
 */
export const fileOps = {
  /**
   * Read and parse JSON file
   * @param {string} filePath
   * @param {string} encoding
   * @returns {object|null}
   */
  readJSON(filePath, encoding = "utf-8") {
    try {
      if (!existsSync(filePath)) {
        return null;
      }
      const data = readFileSync(filePath, encoding);
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to read JSON from ${filePath}: ${error.message}`);
    }
  },

  /**
   * Write object as JSON to file
   * @param {string} filePath
   * @param {object} data
   * @param {boolean} pretty
   */
  writeJSON(filePath, data, pretty = true) {
    try {
      const jsonString = pretty
        ? JSON.stringify(data, null, 2)
        : JSON.stringify(data);
      writeFileSync(filePath, jsonString);
    } catch (error) {
      throw new Error(`Failed to write JSON to ${filePath}: ${error.message}`);
    }
  },

  /**
   * Check if file exists
   * @param {string} filePath
   * @returns {boolean}
   */
  exists(filePath) {
    return existsSync(filePath);
  },
};

/**
 * Configuration status logging
 * @param {string} featureName - Name of the feature (e.g., "Twitch configuration")
 * @param {number} loadedCount - Number of servers with this configuration
 * @param {string[]} loadedServers - Array of server info strings
 */
export function logConfigurationStatus(
  featureName,
  loadedCount,
  loadedServers
) {
  if (loadedCount > 0) {
    logger.log(
      `✅ Loaded ${featureName} for ${loadedCount} server(s):\n   ${loadedServers.join(
        "\n   "
      )}`
    );
    logger.success(`${featureName.split(" ")[0]} enabled`);
  } else {
    logger.warn(
      `${featureName.split(" ")[0]} disabled (no servers configured)`
    );
  }
}

/**
 * Save configuration with consistent error handling
 * @param {string} filePath - Path to save the config file
 * @param {object} data - Data to save
 * @param {string} featureName - Feature name for logging
 * @param {string} guildId - Guild ID for logging
 */
export function saveConfigFile(filePath, data, featureName, guildId) {
  try {
    fileOps.writeJSON(filePath, data);
    logger.success(`Saved ${featureName} for server ${guildId}`);
  } catch (error) {
    logger.error(
      `Failed to save ${featureName} for server ${guildId}: ${error.message}`
    );
  }
}
