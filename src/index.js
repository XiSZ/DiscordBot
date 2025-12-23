import {
  Client,
  GatewayIntentBits,
  ActivityType,
  version as discordVersion,
  EmbedBuilder,
} from "discord.js";
import dotenv from "dotenv";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "fs";
import TwitchAPI from "./twitch-api.js";
import emojiRegex from "emoji-regex";
import {
  logger,
  fileOps,
  logConfigurationStatus,
  saveConfigFile,
} from "./utils.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
});

// Command prefix (can be customized via .env file)
const PREFIX = process.env.COMMAND_PREFIX || "!";

// Auto-execution interval (30 days)
const AUTO_EXECUTE_INTERVAL_DAYS = 30;
const AUTO_EXECUTE_INTERVAL_MS =
  AUTO_EXECUTE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

// Maximum safe value for Node.js setTimeout (about 24.8 days)
const MAX_TIMEOUT = 2147483647;

// Check once per day if execution is needed
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

// Auto-execution toggle and timers
let autoExecutionEnabled =
  (process.env.ENABLE_AUTO_EXECUTION || "true").toLowerCase() !== "false";
let autoExecutionTimeout = null;
let autoExecutionInterval = null;

// Track last execution time
let lastExecutionTime = Date.now();

// Track bot start time for uptime calculation
const botStartTime = Date.now();

// Tracking configuration per guild
const trackingConfig = new Map();

// Twitch API instance
let twitchAPI = null;

// Twitch monitored streamers per guild
const twitchStreamers = new Map(); // Map<guildId, Set<streamerUsername>>
const twitchNotificationChannels = new Map(); // Map<guildId, channelId>
const twitchStreamStatus = new Map(); // Map<streamerUsername, isLive>

// Translation configuration per guild
const translationConfig = new Map(); // Map<guildId, { channels: Set<channelId>, displayMode: string, targetLanguage: string, outputChannelId: string }>

// Persistent data directory - use Railway volume if available, otherwise local
const DATA_DIR =
  process.env.RAILWAY_VOLUME_MOUNT_PATH || join(__dirname, "..", "data");
const SERVERS_DIR = join(DATA_DIR, "servers");

// Ensure data directory exists
if (!fileOps.exists(DATA_DIR)) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    logger.success(`Created data directory: ${DATA_DIR}`);
  } catch (error) {
    logger.error(`Failed to create data directory: ${error.message}`);
  }
}

// Ensure servers directory exists
if (!fileOps.exists(SERVERS_DIR)) {
  try {
    mkdirSync(SERVERS_DIR, { recursive: true });
    logger.success(`Created servers directory: ${SERVERS_DIR}`);
  } catch (error) {
    logger.error(`Failed to create servers directory: ${error.message}`);
  }
}

// Get path to server config file
function getServerConfigPath(guildId) {
  return join(SERVERS_DIR, guildId, "twitch-config.json");
}

// Ensure server directory exists
function ensureServerDirectory(guildId) {
  const serverDir = join(SERVERS_DIR, guildId);
  if (!fileOps.exists(serverDir)) {
    try {
      mkdirSync(serverDir, { recursive: true });
    } catch (error) {
      logger.error(
        `Failed to create server directory for ${guildId}: ${error.message}`
      );
    }
  }
}

// Load Twitch data from all server config files
function loadTwitchData() {
  if (!existsSync(SERVERS_DIR)) {
    return;
  }

  try {
    const serverDirs = readdirSync(SERVERS_DIR);
    let loadedCount = 0;
    const loadedServers = [];

    serverDirs.forEach((guildId) => {
      const configPath = getServerConfigPath(guildId);
      if (fileOps.exists(configPath)) {
        try {
          const data = fileOps.readJSON(configPath);
          if (data) {
            if (data.streamers) {
              twitchStreamers.set(guildId, new Set(data.streamers));
            }
            if (data.channelId) {
              twitchNotificationChannels.set(guildId, data.channelId);
            }

            // Get server info
            loadedServers.push(formatServerInfo(guildId));
            loadedCount++;
          }
        } catch (error) {
          logger.error(
            `Error loading config for guild ${guildId}: ${error.message}`
          );
        }
      }
    });

    logConfigurationStatus("Twitch configuration", loadedCount, loadedServers);
  } catch (error) {
    logger.error(`Error loading Twitch data: ${error.message}`);
  }
}

// Save Twitch data for a specific server
function saveTwitchData(guildId) {
  try {
    ensureServerDirectory(guildId);

    const configPath = getServerConfigPath(guildId);
    const data = {
      streamers: Array.from(twitchStreamers.get(guildId) || []),
      channelId: twitchNotificationChannels.get(guildId) || null,
    };

    saveConfigFile(configPath, data, "Twitch configuration", guildId);
  } catch (error) {
    logger.error(
      `Failed to save Twitch data for server ${guildId}: ${error.message}`
    );
  }
}

// Save translation configuration for a specific server
function saveTranslationConfig(guildId) {
  try {
    ensureServerDirectory(guildId);

    const configPath = join(SERVERS_DIR, guildId, "translation-config.json");
    const config = translationConfig.get(guildId);
    const data = {
      channels: Array.from(config?.channels || []),
      displayMode: config?.displayMode || "reply",
      targetLanguage: config?.targetLanguage || "en",
      outputChannelId: config?.outputChannelId || null,
    };

    saveConfigFile(configPath, data, "translation configuration", guildId);
  } catch (error) {
    logger.error(
      `Failed to save translation config for server ${guildId}: ${error.message}`
    );
  }
}

// Load translation data from all server config files
function loadTranslationData() {
  if (!fileOps.exists(SERVERS_DIR)) {
    return;
  }

  try {
    const serverDirs = readdirSync(SERVERS_DIR);
    const loadedServers = [];
    let loadedCount = 0;

    for (const guildId of serverDirs) {
      const configPath = join(SERVERS_DIR, guildId, "translation-config.json");

      if (existsSync(configPath)) {
        try {
          const data = fileOps.readJSON(configPath);
          if (data) {
            translationConfig.set(guildId, {
              channels: new Set(data.channels || []),
              displayMode: data.displayMode || "reply",
              targetLanguage: data.targetLanguage || "en",
              outputChannelId: data.outputChannelId || null,
            });

            // Get server info
            loadedServers.push(formatServerInfo(guildId));
            loadedCount++;
          }
        } catch (error) {
          logger.error(
            `Failed to parse translation config for server ${guildId}: ${error.message}`
          );
        }
      }
    }

    logConfigurationStatus(
      "translation configurations",
      loadedCount,
      loadedServers
    );
  } catch (error) {
    logger.error(`Failed to load translation data: ${error.message}`);
  }
}

// Helper: ensure translation config exists for a guild
function ensureTranslationConfig(guildId) {
  if (!translationConfig.has(guildId)) {
    translationConfig.set(guildId, {
      channels: new Set(),
      displayMode: "reply",
      targetLanguage: "en",
      outputChannelId: null,
    });
  }
  return translationConfig.get(guildId);
}

// Helper: is translation enabled for a channel
function isTranslationEnabledForChannel(guildId, channelId) {
  const config = translationConfig.get(guildId);
  return !!config && config.channels.has(channelId);
}

// Helper: get translation display mode
function getTranslationDisplayMode(guildId) {
  return translationConfig.get(guildId)?.displayMode || "reply";
}

// Helper: get translation target language
function getTranslationTargetLanguage(guildId) {
  return translationConfig.get(guildId)?.targetLanguage || "en";
}

// Helper: get translation output channel
function getTranslationOutputChannel(guildId) {
  return translationConfig.get(guildId)?.outputChannelId || null;
}

// Helper: get human-readable language name from ISO code
function getLanguageName(isoCode) {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    const name = dn.of(isoCode.toLowerCase());
    return name || isoCode.toUpperCase();
  } catch (_) {
    return isoCode.toUpperCase();
  }
}

// Helper: get a flag emoji for a given language ISO code
function countryCodeToFlag(ccRaw) {
  if (!ccRaw) return null;
  const cc = ccRaw.toUpperCase();
  if (cc.length !== 2 || cc < "A" || cc > "Z") return null;
  const base = 0x1f1e6; // Regional Indicator Symbol Letter A
  const first = base + (cc.charCodeAt(0) - 65);
  const second = base + (cc.charCodeAt(1) - 65);
  return String.fromCodePoint(first) + String.fromCodePoint(second);
}

function getLanguageFlag(isoCodeRaw) {
  const iso = (isoCodeRaw || "").toLowerCase();
  // Map common language codes to representative flags
  const map = {
    // Global/popular
    en: "🇺🇸",
    "en-us": "🇺🇸",
    "en-gb": "🇬🇧",
    "en-ca": "🇨🇦",
    "en-au": "🇦🇺",
    es: "🇪🇸",
    "es-es": "🇪🇸",
    "es-mx": "🇲🇽",
    "es-ar": "🇦🇷",
    fr: "🇫🇷",
    "fr-ca": "🇨🇦",
    de: "🇩🇪",
    it: "🇮🇹",
    ja: "🇯🇵",
    ko: "🇰🇷",
    ru: "🇷🇺",
    pt: "🇵🇹",
    "pt-pt": "🇵🇹",
    "pt-br": "🇧🇷",
    zh: "🇨🇳",
    "zh-cn": "🇨🇳",
    "zh-tw": "🇹🇼",
    "zh-hk": "🇭🇰",
    "zh-sg": "🇸🇬",
    nl: "🇳🇱",
    sv: "🇸🇪",
    no: "🇳🇴",
    da: "🇩🇰",
    fi: "🇫🇮",
    pl: "🇵🇱",
    tr: "🇹🇷",
    ar: "🇸🇦",
    "ar-eg": "🇪🇬",
    "ar-sa": "🇸🇦",
    fa: "🇮🇷",
    "fa-af": "🇦🇫",
    ur: "🇵🇰",
    bn: "🇧🇩",
    he: "🇮🇱",
    cs: "🇨🇿",
    el: "🇬🇷",
    ro: "🇷🇴",
    hu: "🇭🇺",
    uk: "🇺🇦",
    bg: "🇧🇬",
    sk: "🇸🇰",
    hr: "🇭🇷",
    sr: "🇷🇸",
    bs: "🇧🇦",
    sq: "🇦🇱",
    mk: "🇲🇰",
    sl: "🇸🇮",
    et: "🇪🇪",
    lv: "🇱🇻",
    lt: "🇱🇹",
    id: "🇮🇩",
    ms: "🇲🇾",
    th: "🇹🇭",
    vi: "🇻🇳",
    tl: "🇵🇭",
    fil: "🇵🇭",
    ka: "🇬🇪",
    hy: "🇦🇲",
    az: "🇦🇿",
    kk: "🇰🇿",
    uz: "🇺🇿",
    tg: "🇹🇯",
    tk: "🇹🇲",
    ne: "🇳🇵",
    si: "🇱🇰",
    km: "🇰🇭",
    lo: "🇱🇦",
    my: "🇲🇲",
    mn: "🇲🇳",
    am: "🇪🇹",
    sw: "🇰🇪",
    zu: "🇿🇦",
    xh: "🇿🇦",
    yo: "🇳🇬",
    ha: "🇳🇬",
    ig: "🇳🇬",
    so: "🇸🇴",
    af: "🇿🇦",
    ku: "🇮🇶",
    "ku-tr": "🇹🇷",
    "ku-ir": "🇮🇷",
  };

  // Normalize variants like zh-CN
  const normalized = iso.replace("_", "-");

  // Prefer explicit mapping
  if (map[normalized]) return map[normalized];
  if (map[iso]) return map[iso];

  // Try to derive from region (last segment after hyphen)
  const parts = normalized.split("-");
  const region = parts.length > 1 ? parts[parts.length - 1] : null;
  const regionFlag = countryCodeToFlag(region);
  if (regionFlag) return regionFlag;

  return "🌐";
}

// Helper: strip custom Discord emotes and Unicode emojis from text
function stripEmotes(text) {
  if (!text) return text;
  // Remove custom emojis like <:name:id> or <a:name:id>
  const customEmojiRegex = /<a?:[A-Za-z0-9_~]{2,}:\d{17,}>/g;
  const withoutCustom = text.replace(customEmojiRegex, "");
  // Remove unicode emojis
  const unicodeEmojiRegex = emojiRegex();
  const withoutUnicode = withoutCustom.replace(unicodeEmojiRegex, "");
  // Collapse extra whitespace
  return withoutUnicode.replace(/[\s\u00A0]+/g, " ").trim();
}

// Get path to tracking config file
function getTrackingConfigPath(guildId) {
  return join(SERVERS_DIR, guildId, "tracking-config.json");
}

// Helper: format server info as "ID - name - joinDate"
function formatServerInfo(guildId) {
  const guild = client.guilds.cache.get(guildId);
  const serverName = guild?.name || guildId;
  const joinDate =
    guild?.joinedAt?.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }) || "Unknown";
  return `${guildId} - ${serverName} - ${joinDate}`;
}

// Load tracking data from all server config files
function loadTrackingData() {
  if (!fileOps.exists(SERVERS_DIR)) {
    return;
  }

  try {
    const serverDirs = readdirSync(SERVERS_DIR);
    let loadedCount = 0;
    const loadedServers = [];

    serverDirs.forEach((guildId) => {
      const configPath = getTrackingConfigPath(guildId);
      if (fileOps.exists(configPath)) {
        try {
          const data = fileOps.readJSON(configPath);
          if (
            data &&
            (data.enabled !== undefined || data.channelId !== undefined)
          ) {
            trackingConfig.set(guildId, {
              enabled: data.enabled || false,
              channelId: data.channelId || null,
              ignoredChannels: data.ignoredChannels || [],
              events: {
                messages: data.events?.messages !== false,
                members: data.events?.members !== false,
                voice: data.events?.voice !== false,
                reactions: data.events?.reactions !== false,
                channels: data.events?.channels !== false,
                userUpdates: data.events?.userUpdates !== false,
                channelUpdates: data.events?.channelUpdates !== false,
                roles: data.events?.roles !== false,
                guild: data.events?.guild !== false,
                threads: data.events?.threads !== false,
                scheduledEvents: data.events?.scheduledEvents !== false,
                stickers: data.events?.stickers !== false,
                webhooks: data.events?.webhooks !== false,
                integrations: data.events?.integrations !== false,
                invites: data.events?.invites !== false,
                stageInstances: data.events?.stageInstances !== false,
                moderationRules: data.events?.moderationRules !== false,
                interactions: data.events?.interactions !== false,
              },
            });

            // Get server info
            loadedServers.push(formatServerInfo(guildId));
            loadedCount++;
          }
        } catch (error) {
          console.error(
            `❌ Error loading tracking config for guild ${guildId}:`,
            error.message
          );
        }
      }
    });

    logConfigurationStatus(
      "tracking configuration",
      loadedCount,
      loadedServers
    );
  } catch (error) {
    logger.error(`Error loading tracking data: ${error.message}`);
  }
}

// Save tracking data for a specific server
function saveTrackingData(guildId) {
  try {
    ensureServerDirectory(guildId);

    const configPath = getTrackingConfigPath(guildId);
    const config = trackingConfig.get(guildId);
    const data = {
      enabled: config?.enabled || false,
      channelId: config?.channelId || null,
      ignoredChannels: config?.ignoredChannels || [],
      events: config?.events || {
        messages: true,
        members: true,
        voice: true,
        reactions: true,
        channels: true,
        userUpdates: true,
        channelUpdates: true,
        roles: true,
        guild: true,
        threads: true,
        scheduledEvents: true,
        stickers: true,
        webhooks: true,
        integrations: true,
        invites: true,
        stageInstances: true,
        moderationRules: true,
        interactions: true,
      },
    };

    saveConfigFile(configPath, data, "tracking configuration", guildId);
  } catch (error) {
    logger.error(
      `Failed to save tracking config for server ${guildId}: ${error.message}`
    );
  }
}

// Moderator role names that can use moderation commands (customize as needed)
const MODERATOR_ROLE_NAMES = [
  "Moderator",
  "Mod",
  "Admin",
  "Administrator",
  "Staff",
  "Helper",
];

// Helper function to check if user has required permission or is admin/mod
function hasPermissionOrRole(member, permission) {
  // Check if user is Administrator
  if (member.permissions.has("Administrator")) {
    return true;
  }

  // Check if user has the specific permission
  if (member.permissions.has(permission)) {
    return true;
  }

  // Check if user has any moderator role
  const hasModerationRole = member.roles.cache.some((role) =>
    MODERATOR_ROLE_NAMES.some(
      (modRoleName) => role.name.toLowerCase() === modRoleName.toLowerCase()
    )
  );

  return hasModerationRole;
}

// Helper function to check if tracking is enabled for a guild
function isTrackingEnabled(guildId) {
  return trackingConfig.get(guildId)?.enabled || false;
}

// Helper function to get log channel for a guild
function getLogChannel(guildId) {
  return trackingConfig.get(guildId)?.channelId || null;
}

// Helper function to create tracking event embed with clickable user info
function createTrackingEmbed(
  title,
  description,
  user = null,
  color = 0x3498db
) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();

  if (user) {
    embed.addFields(
      {
        name: "User",
        value: `<@${user.id}> (\`${user.id}\`)`,
        inline: false,
      },
      {
        name: "Tag",
        value: user.tag || "Unknown",
        inline: true,
      }
    );
    if (user.avatar) {
      embed.setThumbnail(user.displayAvatarURL({ size: 128 }));
    }
  }

  return embed;
}

// Helper function to log tracking events
async function logTrackingEvent(
  guildId,
  message,
  embed = null,
  eventType = null,
  channelId = null
) {
  if (!isTrackingEnabled(guildId)) return;

  // Check if event type is enabled
  if (eventType) {
    const config = trackingConfig.get(guildId);
    const eventConfig = config?.events;

    if (eventConfig) {
      const eventTypeMap = {
        message: "messages",
        member: "members",
        voice: "voice",
        reaction: "reactions",
        channel: "channels",
        userUpdate: "userUpdates",
      };

      const eventKey = eventTypeMap[eventType];
      if (eventKey && !eventConfig[eventKey]) {
        return; // Event type is disabled
      }
    }
  }

  // Check if channel is ignored
  if (channelId) {
    const config = trackingConfig.get(guildId);
    if (config?.ignoredChannels?.includes(channelId)) {
      return; // Channel is ignored
    }
  }

  const logChannelId = getLogChannel(guildId);
  if (!logChannelId) {
    console.log(message);
    return;
  }

  try {
    const channel = await client.channels.fetch(logChannelId);
    if (channel && channel.isTextBased()) {
      if (embed) {
        await channel.send({ embeds: [embed] });
      } else {
        await channel.send(message);
      }
    }
  } catch (error) {
    console.log(message);
  }
}

// Function to format uptime
function getUptime() {
  const uptime = Date.now() - botStartTime;
  const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
  const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

// Function to auto-execute slash command
async function autoExecuteCommand() {
  if (!autoExecutionEnabled) {
    console.log("⏭️  Skipping auto-execution because it is disabled");
    return;
  }

  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channels = await guild.channels.fetch();

    // Find the first text channel
    const textChannel = channels.find(
      (channel) =>
        channel.type === 0 &&
        channel.permissionsFor(guild.members.me).has("SendMessages")
    );

    if (!textChannel) {
      console.log("❌ Cannot find available text channel");
      return;
    }

    // Send a message to log auto-execution
    console.log(
      "🤖 Auto-executing ping command to maintain application active status..."
    );

    await textChannel.send({
      content:
        "✅ Auto-maintenance Active Developer status - Ping! Bot is working properly.",
    });

    lastExecutionTime = Date.now();
    const nextExecutionDate = new Date(
      lastExecutionTime + AUTO_EXECUTE_INTERVAL_MS
    );
    console.log(
      `✅ Auto-execution completed! Next execution time: ${nextExecutionDate.toLocaleString(
        "en-US"
      )}`
    );
  } catch (error) {
    console.error("❌ Error during auto-execution:", error);
  }
}

// Check if auto-command execution is needed
function checkAndExecute() {
  if (!autoExecutionEnabled) {
    console.log("⏭️  Auto-execution disabled; skipping check");
    return;
  }

  const now = Date.now();
  const timeSinceLastExecution = now - lastExecutionTime;

  // Execute if more than 30 days have passed since last execution
  if (timeSinceLastExecution >= AUTO_EXECUTE_INTERVAL_MS) {
    console.log("📅 Auto-execution time reached...");
    autoExecuteCommand();
  } else {
    const daysRemaining = Math.ceil(
      (AUTO_EXECUTE_INTERVAL_MS - timeSinceLastExecution) /
        (24 * 60 * 60 * 1000)
    );
    console.log(
      `⏳ ${daysRemaining} day(s) remaining until next auto-execution`
    );
  }
}

// Rich presence rotation
let presenceIndex = 0;
const presenceMessages = [
  {
    type: ActivityType.Watching,
    name: " Developer tutorials",
  },
  { type: ActivityType.Playing, name: "with Discord API" },
  { type: ActivityType.Listening, name: "to user commands" },
  {
    type: ActivityType.Watching,
    name: `Currently active in ${client.guilds?.cache.size || 0} servers`,
  },
  { type: ActivityType.Playing, name: "Auto-Maintenance Mode" },
  { type: ActivityType.Competing, name: "in the uptime challenge" },
];

function updateRichPresence() {
  try {
    const presence = presenceMessages[presenceIndex];

    // Update server count dynamically
    if (presence.name.includes("servers")) {
      presence.name = `${client.guilds.cache.size} server${
        client.guilds.cache.size !== 1 ? "s" : ""
      }`;
    }

    // Update uptime dynamically for competing status
    if (presence.type === ActivityType.Competing) {
      presence.name = `Uptime: ${getUptime()}`;
    }

    client.user.setPresence({
      activities: [
        {
          name: presence.name,
          type: presence.type,
        },
      ],
      status: "online",
    });

    presenceIndex = (presenceIndex + 1) % presenceMessages.length;
  } catch (error) {
    console.error("❌ Error updating rich presence:", error);
  }
}

function clearAutoExecutionTimers() {
  if (autoExecutionTimeout) {
    clearTimeout(autoExecutionTimeout);
    autoExecutionTimeout = null;
  }
  if (autoExecutionInterval) {
    clearInterval(autoExecutionInterval);
    autoExecutionInterval = null;
  }
}

// Setup auto-execution schedule
function setupAutoExecution() {
  clearAutoExecutionTimers();

  if (!autoExecutionEnabled) {
    console.log("⏸️  Auto-execution is disabled; timers not scheduled");
    return;
  }

  // Execute once shortly after startup
  autoExecutionTimeout = setTimeout(() => {
    if (!autoExecutionEnabled) {
      console.log("⏭️  Skipping first auto-execution (disabled)");
      return;
    }
    console.log("🚀 First auto-execution...");
    autoExecuteCommand();
  }, 60000); // Execute after 1 minute from startup

  // Check daily if execution is needed (instead of using interval exceeding 32-bit limit)
  autoExecutionInterval = setInterval(() => {
    if (!autoExecutionEnabled) {
      console.log("⏭️  Auto-execution disabled; skipping interval check");
      return;
    }
    checkAndExecute();
  }, CHECK_INTERVAL);

  console.log(
    `⏰ Auto-execution schedule set, will execute every ${AUTO_EXECUTE_INTERVAL_DAYS} days`
  );
  console.log(`🔍 Checking every 24 hours if execution is needed`);

  const nextExecutionDate = new Date(
    lastExecutionTime + AUTO_EXECUTE_INTERVAL_MS
  );
  console.log(
    `📅 Next scheduled execution time: ${nextExecutionDate.toLocaleString(
      "en-US"
    )}`
  );
}

function enableAutoExecutionRuntime() {
  autoExecutionEnabled = true;
  setupAutoExecution();
}

function disableAutoExecutionRuntime() {
  autoExecutionEnabled = false;
  clearAutoExecutionTimers();
}

// Check Twitch streamers for live status
async function checkTwitchStreamers() {
  if (!twitchAPI || twitchStreamers.size === 0) return;

  for (const [guildId, streamers] of twitchStreamers.entries()) {
    const channelId = twitchNotificationChannels.get(guildId);
    if (!channelId) continue;

    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) continue;

      for (const streamer of streamers) {
        const streamInfo = await twitchAPI.getStreamInfo(streamer);
        const wasLive = twitchStreamStatus.get(streamer);
        const isLive = streamInfo !== null;

        // If streamer went live, send notification
        if (isLive && !wasLive) {
          const embed = new EmbedBuilder()
            .setColor(0x9146ff) // Twitch purple
            .setTitle(`🔴 ${streamInfo.user_name} is now LIVE on Twitch!`)
            .setDescription(streamInfo.title || "No title provided")
            .setURL(`https://twitch.tv/${streamInfo.user_login}`)
            .addFields(
              {
                name: "Game",
                value: streamInfo.game_name || "Unknown",
                inline: true,
              },
              {
                name: "Viewers",
                value: streamInfo.viewer_count.toString(),
                inline: true,
              },
              {
                name: "Started",
                value: `<t:${Math.floor(
                  new Date(streamInfo.started_at).getTime() / 1000
                )}:R>`,
                inline: false,
              }
            )
            .setImage(
              streamInfo.thumbnail_url
                .replace("{width}", "640")
                .replace("{height}", "360")
            )
            .setTimestamp();

          await channel.send({
            embeds: [embed],
            content: `@everyone 🔔 **${streamInfo.user_name}** is now streaming!`,
          });

          console.log(
            `🔴 Sent live notification for ${streamInfo.user_name} in guild ${guildId}`
          );
        }

        // Update status
        twitchStreamStatus.set(streamer, isLive);
      }
    } catch (error) {
      console.error(
        `❌ Error checking Twitch streamers for guild ${guildId}:`,
        error
      );
    }
  }
}

// Open invite-bot.html in default browser
function openInviteBotGuide() {
  const htmlPath = join(__dirname, "..", "invite-bot.html");
  const guideUrl =
    process.env.GUIDE_URL ||
    "https://raw.githubusercontent.com/XiSZ/Auto-Discord-Developer-Badge/main/invite-bot.html";

  // Detect headless/hosted environments where opening a browser is pointless
  const isHeadless =
    process.env.CI === "true" ||
    !!process.env.CODESPACES ||
    !!process.env.SSH_CONNECTION ||
    !!process.env.CONTAINER ||
    (process.platform === "linux" && !process.env.DISPLAY) ||
    !process.stdout.isTTY;

  // If file is not present on this machine or we are headless, just print a remote-friendly link
  const guideExists = existsSync(htmlPath);
  if (!guideExists || isHeadless) {
    const locationHint = guideExists ? `file://${htmlPath}` : guideUrl;
    console.log("💡 Setup guide available at:", locationHint);
    return;
  }

  // Detect platform and use appropriate command
  const command =
    process.platform === "win32"
      ? `start "" "${htmlPath}"`
      : process.platform === "darwin"
      ? `open "${htmlPath}"`
      : `xdg-open "${htmlPath}"`;

  exec(command, (error) => {
    if (error) {
      console.log("💡 Setup guide available at:", guideUrl);
    } else {
      console.log("🌐 Opening setup guide in your browser...");
    }
  });
}

// Helper function for successful command response
async function successReply(interaction, content, isEphemeral = true) {
  return await interaction.reply({
    content: `✅ ${content}`,
    ephemeral: isEphemeral,
  });
}

// Helper function for error response
async function errorReply(interaction, content) {
  return await interaction.reply({
    content: `❌ ${content}`,
    ephemeral: true,
  });
}

// Helper function to check if interaction is in DM
function isDMInteraction(interaction) {
  return !interaction.guild;
}

// Helper function to check if command requires guild context
function requiresGuild(interaction, commandName) {
  const guildOnlyCommands = [
    "serverinfo",
    "kick",
    "ban",
    "mute",
    "unmute",
    "warn",
    "lock",
    "unlock",
    "slowmode",
    "purge",
    "logs",
    "banlist",
    "clear-warnings",
    "tracking",
    "roleinfo",
    "channelinfo",
    "role-assign",
    "role-remove",
    "channel-create",
    "channel-delete",
    "welcome",
    "settings",
    "announce",
    "twitch-notify",
    "config",
    "backup",
    "uptime-ranking",
    "warn-list",
    "suggest",
  ];

  if (guildOnlyCommands.includes(commandName) && isDMInteraction(interaction)) {
    interaction.reply({
      content: "❌ This command can only be used in a server, not in DMs.",
      ephemeral: true,
    });
    return true;
  }
  return false;
}

client.once("clientReady", () => {
  logger.success("Bot is online!");
  logger.log(`🤖 Logged in as: ${client.user.tag}`);

  const serverList = client.guilds.cache.map((guild) =>
    formatServerInfo(guild.id)
  );

  logger.log(`📊 Joined ${client.guilds.cache.size} server(s):`);
  if (serverList.length > 0) {
    logger.log(`   ${serverList.join("\n   ")}`);
  }

  logger.divider();
  logger.log("🎯 Discord Active Developer Badge Auto-Maintenance Bot");
  logger.divider();

  // Increase max listeners to prevent memory leak warnings
  client.setMaxListeners(20);

  // Load tracking configuration from disk
  loadTrackingData();

  // Load translation configuration from disk
  loadTranslationData();

  // Initialize Twitch API if credentials are available
  if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_ACCESS_TOKEN) {
    twitchAPI = new TwitchAPI(
      process.env.TWITCH_CLIENT_ID,
      process.env.TWITCH_ACCESS_TOKEN
    );
    loadTwitchData();

    // Start Twitch polling every 5 minutes (balances notifications with API rate limits)
    setInterval(checkTwitchStreamers, 300000);
  } else {
    console.log(
      "⚠️ Twitch notifications disabled (missing TWITCH_CLIENT_ID or TWITCH_ACCESS_TOKEN in .env)"
    );
  }

  // Set initial rich presence
  updateRichPresence();

  // Update rich presence every 30 seconds with rotating messages
  setInterval(updateRichPresence, 30000);

  // Setup auto-execution schedule
  if (autoExecutionEnabled) {
    setupAutoExecution();
    logger.success("Auto-execution is enabled");
  } else {
    logger.log("⏸️  Auto-execution is disabled (ENABLE_AUTO_EXECUTION=false)");
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Help command
  if (interaction.commandName === "help") {
    const isDM = isDMInteraction(interaction);
    const dmNote = isDM
      ? "\n\n💡 **You're in a DM!** Only commands marked with 💬 work here."
      : "";

    await interaction.reply({
      content:
        `📖 **Available Commands**${dmNote}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**Badge & Info:**\n` +
        `\`/ping\` 💬 – Check bot latency and badge status\n` +
        `\`/uptime\` 💬 – View bot uptime\n` +
        `\`/status\` 💬 – Show next auto-execution date\n` +
        `\`/botinfo\` 💬 – Get information about the bot\n` +
        `\`/serverinfo\` – Display server information\n` +
        `\`/userinfo [user]\` 💬 – Get user details\n` +
        `\`/stats\` 💬 – View bot performance statistics\n` +
        `\`/uptime-ranking\` – View bot uptime percentage\n` +
        `\n**Moderation:**\n` +
        `\`/kick <user> [reason]\` – Remove user from server\n` +
        `\`/ban <user> [reason]\` – Ban user from server\n` +
        `\`/banlist\` – View banned users\n` +
        `\`/mute <user> <minutes> [reason]\` – Mute user\n` +
        `\`/unmute <user>\` – Unmute user\n` +
        `\`/warn <user> [reason]\` – Warn user\n` +
        `\`/warn-list <user>\` – View user warnings\n` +
        `\`/clear-warnings <user>\` – Clear user warnings\n` +
        `\n**Channel Management:**\n` +
        `\`/lock\` – Lock current channel (no messages)\n` +
        `\`/unlock\` – Unlock current channel\n` +
        `\`/slowmode <seconds>\` – Set channel slowmode (0 to disable)\n` +
        `\`/purge [amount]\` – Delete messages from channel\n` +
        `\`/channel-create <name> [topic]\` – Create a new channel\n` +
        `\`/channel-delete [channel]\` – Delete a channel\n` +
        `\n**Role Management:**\n` +
        `\`/role-assign <user> <role>\` – Assign a role to a user\n` +
        `\`/role-remove <user> <role>\` – Remove a role from a user\n` +
        `\`/roleinfo <role>\` – Get role details\n` +
        `\n**Fun & Games:**\n` +
        `\`/8ball <question>\` 💬 – Magic 8-ball prediction\n` +
        `\`/dice [sides] [rolls]\` 💬 – Roll dice\n` +
        `\`/flip\` 💬 – Flip a coin\n` +
        `\`/joke\` 💬 – Tell a random joke\n` +
        `\`/quote\` 💬 – Get an inspirational quote\n` +
        `\n**Utility & Notifications:**\n` +
        `\`/say <message> [channel]\` – Send message as bot\n` +
        `\`/poll <question> <opt1> <opt2> [opt3-5]\` – Create a poll\n` +
        `\`/announce <message> [channel]\` – Send announcement\n` +
        `\`/invite\` 💬 – Get bot invite link\n` +
        `\`/avatar [user]\` 💬 – View user's avatar\n` +
        `\`/echo <text>\` 💬 – Echo back text\n` +
        `\`/notify <user> <message>\` 💬 – Send DM notification\n` +
        `\`/ping-user <user> <message>\` 💬 – Ping user with message\n` +
        `\`/remind <minutes> <reminder>\` 💬 – Set a reminder\n` +
        `\`/suggest <suggestion>\` – Submit a suggestion\n` +
        `\`/twitch-notify\` – Manage Twitch live notifications\n` +
        `\n**Translation:**\n` +
        `\`/translate <text> [to] [from]\` 💬 – Translate text\n` +
        `\`/translate-setup <channel>\` – Enable auto-translation\n` +
        `\`/translate-config <display-mode>\` – Configure translation\n` +
        `\`/translate-output-channel <channel>\` – Set output channel for translations\n` +
        `\`/translate-disable <channel>\` – Disable auto-translation\n` +
        `\`/translate-list\` – View enabled channels\n` +
        `\`/translate-status\` – View translation settings\n` +
        `\n**Information:**\n` +
        `\`/channelinfo [channel]\` – Get channel details\n` +
        `\`/command-activity [days]\` – View command usage\n` +
        `\`/welcome <channel> <message>\` – Set welcome message\n` +
        `\n**Logging & Monitoring:**\n` +
        `\`/logs [lines]\` – View audit logs\n` +
        `\`/config view\` – View bot configuration\n` +
        `\`/settings view\` – View server settings\n` +
        `\`/auto-execution <enable|disable|status>\` – Control auto-execution\n` +
        `\`/backup\` – View server backup info\n` +
        `\`/tracking toggle\` – Enable/disable activity tracking\n` +
        `\`/tracking channel\` – Set tracking log channel\n` +
        `\`/tracking status\` – View tracking configuration\n` +
        `\`/help\` 💬 – Show this message`,
      ephemeral: true,
    });
    console.log(
      `✅ ${interaction.user.tag} executed help command${isDM ? " (DM)" : ""}`
    );
  }

  if (interaction.commandName === "ping") {
    const startTime = Date.now();
    await interaction.deferReply({ ephemeral: true });

    const latency = Date.now() - startTime;
    const apiLatency = Math.round(client.ws.ping);

    const timeSinceLastAuto = Date.now() - lastExecutionTime;
    const daysUntilNext = Math.ceil(
      (AUTO_EXECUTE_INTERVAL_MS - timeSinceLastAuto) / (1000 * 60 * 60 * 24)
    );

    const autoExecutionLine = autoExecutionEnabled
      ? `📅 Days until next auto-execution: ${daysUntilNext} day(s)\n`
      : "⏸️ Auto-execution is disabled. Use /auto-execution enable to resume.\n";

    await interaction.editReply({
      content:
        `✅ **Pong!**\n` +
        `⏱️ Latency: ${latency}ms\n` +
        `💓 API Latency: ${apiLatency}ms\n` +
        `✅ Bot is working properly\n` +
        autoExecutionLine +
        `🎖️ Your Active Developer status has been updated!`,
    });

    console.log(`✅ ${interaction.user.tag} executed ping command`);
  }

  if (interaction.commandName === "uptime") {
    const uptime = Date.now() - botStartTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

    await interaction.reply({
      content:
        `✅ **Bot Uptime**\n` +
        `📊 Total: ${days}d ${hours}h ${minutes}m ${seconds}s\n` +
        `🚀 Started: <t:${Math.floor(botStartTime / 1000)}:R>\n` +
        `✅ Status: Online and operational`,
      ephemeral: true,
    });

    console.log(`✅ ${interaction.user.tag} executed uptime command`);
  }

  if (interaction.commandName === "purge") {
    if (requiresGuild(interaction, "purge")) return;

    // Check if user has permission to manage messages or is admin/mod
    if (!hasPermissionOrRole(interaction.member, "ManageMessages")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Messages" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    // Check if bot has permission to manage messages
    if (!interaction.guild.members.me.permissions.has("ManageMessages")) {
      await interaction.reply({
        content:
          '❌ I need the "Manage Messages" permission to delete messages.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const amount = interaction.options.getInteger("amount");
      const channel = interaction.channel;

      let deletedCount = 0;

      if (amount) {
        // Delete specific amount in batches of 100
        let remaining = amount;
        while (remaining > 0) {
          const batchSize = Math.min(remaining, 100);
          const messages = await channel.messages.fetch({ limit: batchSize });
          if (messages.size === 0) break;

          const deleted = await channel.bulkDelete(messages, true);
          deletedCount += deleted.size;
          remaining -= deleted.size;

          // If we deleted fewer than fetched, we've hit messages older than 14 days
          if (deleted.size < messages.size) {
            break;
          }
        }
      } else {
        // Delete all messages in batches
        let fetchedMessages;
        do {
          fetchedMessages = await channel.messages.fetch({ limit: 100 });
          if (fetchedMessages.size > 0) {
            const deleted = await channel.bulkDelete(fetchedMessages, true);
            deletedCount += deleted.size;

            // If we deleted fewer than fetched, we've hit messages older than 14 days
            if (deleted.size < fetchedMessages.size) {
              break;
            }
          }
        } while (fetchedMessages.size > 0);
      }

      await interaction.editReply({
        content:
          `✅ Successfully deleted ${deletedCount} message(s).\n` +
          `${
            deletedCount < (amount || 100)
              ? "⚠️ Note: Messages older than 14 days cannot be bulk deleted."
              : ""
          }`,
      });

      console.log(
        `🗑️ ${interaction.user.tag} purged ${deletedCount} messages in #${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error purging messages:", error);
      await interaction.editReply({
        content: "❌ An error occurred while trying to delete messages.",
      });
    }
  }

  // Status command - Badge-specific info
  if (interaction.commandName === "status") {
    const timeSinceLastAuto = Date.now() - lastExecutionTime;
    const daysUntilNext = Math.ceil(
      (AUTO_EXECUTE_INTERVAL_MS - timeSinceLastAuto) / (1000 * 60 * 60 * 24)
    );
    const hoursUntilNext = Math.ceil(
      ((AUTO_EXECUTE_INTERVAL_MS - timeSinceLastAuto) % (1000 * 60 * 60 * 24)) /
        (1000 * 60 * 60)
    );
    const nextExecutionDate = new Date(
      lastExecutionTime + AUTO_EXECUTE_INTERVAL_MS
    );

    const nextExecutionText = autoExecutionEnabled
      ? nextExecutionDate.toLocaleString("en-US")
      : "Paused (auto-execution disabled)";
    const timeRemainingText = autoExecutionEnabled
      ? `${daysUntilNext}d ${hoursUntilNext}h`
      : "N/A (disabled)";

    await interaction.reply({
      content:
        `🎖️ **Active Developer Badge Status**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📅 Last auto-execution: <t:${Math.floor(
          lastExecutionTime / 1000
        )}:R>\n` +
        `⏰ Next scheduled: ${nextExecutionText}\n` +
        `⏳ Time remaining: ${timeRemainingText}\n` +
        `🤖 Bot Status: Online and maintaining your badge\n` +
        `✅ Auto-execution: ${autoExecutionEnabled ? "Enabled" : "Disabled"}`,
    });

    console.log(`✅ ${interaction.user.tag} executed status command`);
  }

  // Auto-execution command - runtime enable/disable/status
  if (interaction.commandName === "auto-execution") {
    if (!interaction.memberPermissions.has("ManageGuild")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Server" permission to update auto-execution.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const nextExecutionDate = new Date(
      lastExecutionTime + AUTO_EXECUTE_INTERVAL_MS
    );

    if (subcommand === "enable") {
      enableAutoExecutionRuntime();

      await interaction.reply({
        content: `✅ Auto-execution enabled.
📅 Next scheduled: ${nextExecutionDate.toLocaleString("en-US")}
⏱️ Interval: ${AUTO_EXECUTE_INTERVAL_DAYS} days`,
        ephemeral: true,
      });

      console.log(`▶️ ${interaction.user.tag} enabled auto-execution`);
      return;
    }

    if (subcommand === "disable") {
      disableAutoExecutionRuntime();

      await interaction.reply({
        content:
          "⏸️ Auto-execution disabled. No automated runs will occur until re-enabled.",
        ephemeral: true,
      });

      console.log(`⏹️ ${interaction.user.tag} disabled auto-execution`);
      return;
    }

    // status subcommand
    const timeSinceLastAuto = Date.now() - lastExecutionTime;
    const daysUntilNext = Math.ceil(
      (AUTO_EXECUTE_INTERVAL_MS - timeSinceLastAuto) / (1000 * 60 * 60 * 24)
    );
    const hoursUntilNext = Math.ceil(
      ((AUTO_EXECUTE_INTERVAL_MS - timeSinceLastAuto) % (1000 * 60 * 60 * 24)) /
        (1000 * 60 * 60)
    );

    await interaction.reply({
      content: `🤖 **Auto-Execution Status**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Last run: <t:${Math.floor(lastExecutionTime / 1000)}:R>
⏰ Next scheduled: ${
        autoExecutionEnabled
          ? nextExecutionDate.toLocaleString("en-US")
          : "Paused (auto-execution disabled)"
      }
⏳ Time remaining: ${
        autoExecutionEnabled
          ? `${daysUntilNext}d ${hoursUntilNext}h`
          : "N/A (disabled)"
      }
✅ Auto-execution: ${autoExecutionEnabled ? "Enabled" : "Disabled"}`,
      ephemeral: true,
    });

    console.log(`ℹ️ ${interaction.user.tag} viewed auto-execution status`);
  }

  // Server info command
  if (interaction.commandName === "serverinfo") {
    if (requiresGuild(interaction, "serverinfo")) return;

    const guild = interaction.guild;
    const owner = await guild.fetchOwner();
    const memberCount = guild.memberCount;
    const channelCount = guild.channels.cache.size;
    const roleCount = guild.roles.cache.size;
    const verificationLevel = ["None", "Low", "Medium", "High", "Very High"][
      guild.verificationLevel
    ];

    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    await interaction.reply({
      content:
        `📊 **Server Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🏛️ **Name:** ${guild.name}\n` +
        `🆔 **ID:** ${guild.id}\n` +
        `👑 **Owner:** ${owner.user.tag}\n` +
        `📅 **Created:** <t:${createdAt}:R>\n` +
        `👥 **Members:** ${memberCount}\n` +
        `💬 **Channels:** ${channelCount}\n` +
        `🏷️ **Roles:** ${roleCount}\n` +
        `🔐 **Verification Level:** ${verificationLevel}\n` +
        `${guild.icon ? `🖼️ **Icon:** [View](${guild.iconURL()})` : ""}`,
    });

    console.log(`✅ ${interaction.user.tag} executed serverinfo command`);
  }

  // User info command
  if (interaction.commandName === "userinfo") {
    const user = interaction.options.getUser("user") || interaction.user;

    // If in DM, show limited user info
    if (isDMInteraction(interaction)) {
      const createdAt = Math.floor(user.createdTimestamp / 1000);
      await interaction.reply({
        content:
          `👤 **User Information**\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 **Username:** ${user.tag}\n` +
          `🆔 **ID:** ${user.id}\n` +
          `📅 **Account Created:** <t:${createdAt}:R>\n` +
          `${user.bot ? "🤖 **Type:** Bot" : "👨 **Type:** User"}\n\n` +
          `💡 Use this command in a server for more details.`,
        ephemeral: true,
      });
      console.log(
        `✅ ${interaction.user.tag} executed userinfo (DM) for ${user.tag}`
      );
      return;
    }

    const member = await interaction.guild.members.fetch(user.id);

    const joinedAt = Math.floor(member.joinedTimestamp / 1000);
    const createdAt = Math.floor(user.createdTimestamp / 1000);
    const roles =
      member.roles.cache
        .filter((r) => r.name !== "@everyone")
        .map((r) => r.toString())
        .join(", ") || "None";

    await interaction.reply({
      content:
        `👤 **User Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 **Username:** ${user.tag}\n` +
        `🆔 **ID:** ${user.id}\n` +
        `📅 **Account Created:** <t:${createdAt}:R>\n` +
        `🎪 **Joined Server:** <t:${joinedAt}:R>\n` +
        `🏷️ **Roles:** ${roles}\n` +
        `${user.bot ? "🤖 **Type:** Bot" : "👨 **Type:** User"}`,
      ephemeral: true,
    });

    console.log(
      `✅ ${interaction.user.tag} executed userinfo command for ${user.tag}`
    );
  }

  // Stats command
  if (interaction.commandName === "stats") {
    const uptime = getUptime();
    const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const serverCount = client.guilds.cache.size;
    const userCount = client.users.cache.size;
    const channelCount = client.channels.cache.size;

    await interaction.reply({
      content:
        `📈 **Bot Statistics**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⏰ **Uptime:** ${uptime}\n` +
        `🖥️ **Memory Usage:** ${memUsage} MB\n` +
        `🏛️ **Servers:** ${serverCount}\n` +
        `👥 **Users Cached:** ${userCount}\n` +
        `💬 **Channels Cached:** ${channelCount}\n` +
        `💓 **API Latency:** ${Math.round(client.ws.ping)}ms\n` +
        `🔌 **Discord.js Version:** v${discordVersion}`,
    });

    console.log(`✅ ${interaction.user.tag} executed stats command`);
  }

  // Lock command
  if (interaction.commandName === "lock") {
    if (requiresGuild(interaction, "lock")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageChannels")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Channels" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const channel = interaction.channel;
      await channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: false,
        }
      );

      await interaction.reply({
        content: `🔒 Channel locked! Only members with specific roles can send messages.`,
      });

      console.log(`🔒 ${interaction.user.tag} locked channel #${channel.name}`);
    } catch (error) {
      console.error("❌ Error locking channel:", error);
      await interaction.reply({
        content: "❌ Failed to lock the channel.",
        ephemeral: true,
      });
    }
  }

  // Unlock command
  if (interaction.commandName === "unlock") {
    if (requiresGuild(interaction, "unlock")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageChannels")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Channels" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const channel = interaction.channel;
      await channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        {
          SendMessages: null,
        }
      );

      await interaction.reply({
        content: `🔓 Channel unlocked! Everyone can send messages again.`,
      });

      console.log(
        `🔓 ${interaction.user.tag} unlocked channel #${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error unlocking channel:", error);
      await interaction.reply({
        content: "❌ Failed to unlock the channel.",
        ephemeral: true,
      });
    }
  }

  // Slowmode command
  if (interaction.commandName === "slowmode") {
    if (requiresGuild(interaction, "slowmode")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageChannels")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Channels" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const seconds = interaction.options.getInteger("seconds");
      const channel = interaction.channel;

      await channel.setRateLimitPerUser(seconds);

      const message =
        seconds === 0
          ? "🐇 Slowmode disabled!"
          : `🐢 Slowmode set to ${seconds} second(s)`;

      await interaction.reply({ content: message });

      console.log(
        `⏱️ ${interaction.user.tag} set slowmode to ${seconds}s in #${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error setting slowmode:", error);
      await interaction.reply({
        content: "❌ Failed to set slowmode.",
        ephemeral: true,
      });
    }
  }

  // Kick command
  if (interaction.commandName === "kick") {
    if (requiresGuild(interaction, "kick")) return;

    if (!hasPermissionOrRole(interaction.member, "KickMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Kick Members" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild.members.me.permissions.has("KickMembers")) {
      await interaction.reply({
        content: '❌ I need the "Kick Members" permission to kick users.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const reason =
        interaction.options.getString("reason") || "No reason provided";
      const member = await interaction.guild.members.fetch(user.id);

      await member.kick(reason);

      await interaction.reply({
        content: `✅ **${user.tag}** has been kicked.\n📝 **Reason:** ${reason}`,
      });

      console.log(`👢 ${interaction.user.tag} kicked ${user.tag}: ${reason}`);
    } catch (error) {
      console.error("❌ Error kicking user:", error);
      await interaction.reply({
        content: "❌ Failed to kick the user.",
        ephemeral: true,
      });
    }
  }

  // Ban command
  if (interaction.commandName === "ban") {
    if (requiresGuild(interaction, "ban")) return;

    if (!hasPermissionOrRole(interaction.member, "BanMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Ban Members" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild.members.me.permissions.has("BanMembers")) {
      await interaction.reply({
        content: '❌ I need the "Ban Members" permission to ban users.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const reason =
        interaction.options.getString("reason") || "No reason provided";
      const member = await interaction.guild.members.fetch(user.id);

      await member.ban({ reason });

      await interaction.reply({
        content: `✅ **${user.tag}** has been banned.\n📝 **Reason:** ${reason}`,
      });

      console.log(`⛔ ${interaction.user.tag} banned ${user.tag}: ${reason}`);
    } catch (error) {
      console.error("❌ Error banning user:", error);
      await interaction.reply({
        content: "❌ Failed to ban the user.",
        ephemeral: true,
      });
    }
  }

  // Mute command
  if (interaction.commandName === "mute") {
    if (requiresGuild(interaction, "mute")) return;

    if (!hasPermissionOrRole(interaction.member, "ModerateMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Moderate Members" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild.members.me.permissions.has("ModerateMembers")) {
      await interaction.reply({
        content: '❌ I need the "Moderate Members" permission to mute users.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const minutes = interaction.options.getInteger("minutes");
      const reason =
        interaction.options.getString("reason") || "No reason provided";
      const member = await interaction.guild.members.fetch(user.id);

      const muteTime = minutes * 60 * 1000;

      await member.timeout(muteTime, reason);

      await interaction.reply({
        content: `🔇 **${user.tag}** has been muted for ${minutes} minute(s).\n📝 **Reason:** ${reason}`,
      });

      console.log(
        `🔇 ${interaction.user.tag} muted ${user.tag} for ${minutes}m: ${reason}`
      );
    } catch (error) {
      console.error("❌ Error muting user:", error);
      await interaction.reply({
        content: "❌ Failed to mute the user.",
        ephemeral: true,
      });
    }
  }

  // Unmute command
  if (interaction.commandName === "unmute") {
    if (requiresGuild(interaction, "unmute")) return;

    if (!hasPermissionOrRole(interaction.member, "ModerateMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Moderate Members" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild.members.me.permissions.has("ModerateMembers")) {
      await interaction.reply({
        content: '❌ I need the "Moderate Members" permission to unmute users.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const member = await interaction.guild.members.fetch(user.id);

      await member.timeout(null);

      await interaction.reply({
        content: `🔊 **${user.tag}** has been unmuted.`,
      });

      console.log(`🔊 ${interaction.user.tag} unmuted ${user.tag}`);
    } catch (error) {
      console.error("❌ Error unmuting user:", error);
      await interaction.reply({
        content: "❌ Failed to unmute the user.",
        ephemeral: true,
      });
    }
  }

  // Warn command
  if (interaction.commandName === "warn") {
    if (requiresGuild(interaction, "warn")) return;

    if (!hasPermissionOrRole(interaction.member, "ModerateMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Moderate Members" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const reason =
        interaction.options.getString("reason") || "No reason provided";

      await interaction.reply({
        content: `⚠️ **${user.tag}** has been warned.\n📝 **Reason:** ${reason}`,
      });

      console.log(`⚠️ ${interaction.user.tag} warned ${user.tag}: ${reason}`);
    } catch (error) {
      console.error("❌ Error warning user:", error);
      await interaction.reply({
        content: "❌ Failed to warn the user.",
        ephemeral: true,
      });
    }
  }

  // Say command
  if (interaction.commandName === "say") {
    if (requiresGuild(interaction, "say")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageMessages")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Messages" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const message = interaction.options.getString("message");
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      await channel.send(message);

      await interaction.reply({
        content: `✅ Message sent to ${channel}!`,
        ephemeral: true,
      });

      console.log(
        `💬 ${interaction.user.tag} sent a message via /say in #${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error sending message:", error);
      await interaction.reply({
        content: "❌ Failed to send the message.",
        ephemeral: true,
      });
    }
  }

  // Poll command
  if (interaction.commandName === "poll") {
    if (requiresGuild(interaction, "poll")) return;

    try {
      const question = interaction.options.getString("question");
      const option1 = interaction.options.getString("option1");
      const option2 = interaction.options.getString("option2");
      const option3 = interaction.options.getString("option3");
      const option4 = interaction.options.getString("option4");
      const option5 = interaction.options.getString("option5");

      const options = [option1, option2, option3, option4, option5].filter(
        Boolean
      );
      const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

      let pollContent = `📊 **${question}**\n━━━━━━━━━━━━━━━━━\n`;
      options.forEach((opt, i) => {
        pollContent += `${emojis[i]} ${opt}\n`;
      });

      const pollMessage = await interaction.reply({
        content: pollContent,
        fetchReply: true,
      });

      for (let i = 0; i < options.length; i++) {
        await pollMessage.react(emojis[i]);
      }

      console.log(`📊 ${interaction.user.tag} created a poll: ${question}`);
    } catch (error) {
      console.error("❌ Error creating poll:", error);
      await interaction.reply({
        content: "❌ Failed to create the poll.",
        ephemeral: true,
      });
    }
  }

  // Remind command
  if (interaction.commandName === "remind") {
    try {
      const minutes = interaction.options.getInteger("minutes");
      const reminder = interaction.options.getString("reminder");
      const user = interaction.user;

      await interaction.reply({
        content: `⏰ Reminder set! You'll be reminded in ${minutes} minute(s).`,
        ephemeral: true,
      });

      setTimeout(async () => {
        try {
          await user.send(
            `⏰ **Reminder from ${minutes} minute(s) ago:** ${reminder}`
          );
        } catch (error) {
          console.error("❌ Could not send reminder DM:", error);
        }
      }, minutes * 60 * 1000);

      console.log(
        `⏰ ${interaction.user.tag} set a reminder: ${reminder} (${minutes}m)`
      );
    } catch (error) {
      console.error("❌ Error setting reminder:", error);
      await interaction.reply({
        content: "❌ Failed to set the reminder.",
        ephemeral: true,
      });
    }
  }

  // Invite command
  if (interaction.commandName === "invite") {
    try {
      const inviteUrl = client.generateInvite({
        scopes: ["bot"],
        permissions: [
          "SendMessages",
          "ManageMessages",
          "KickMembers",
          "BanMembers",
          "ModerateMembers",
          "ManageChannels",
          "UseApplicationCommands",
        ],
      });

      await interaction.reply({
        content: `🔗 **Invite the bot to your server:**\n${inviteUrl}`,
        ephemeral: true,
      });

      console.log(`🔗 ${interaction.user.tag} requested bot invite link`);
    } catch (error) {
      console.error("❌ Error generating invite:", error);
      await interaction.reply({
        content: "❌ Failed to generate invite link.",
        ephemeral: true,
      });
    }
  }

  // Logs command - Show recent bot action logs
  if (interaction.commandName === "logs") {
    if (!interaction.memberPermissions.has("ManageGuild")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Server" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const lines = interaction.options.getInteger("lines") || 10;
      const guild = interaction.guild;

      // Fetch audit logs
      const auditLogs = await guild.fetchAuditLogs({ limit: lines });
      let logsContent =
        `📋 **Recent Server Actions** (Last ${Math.min(
          lines,
          auditLogs.entries.size
        )} actions)\n` + `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

      if (auditLogs.entries.size === 0) {
        logsContent += "No recent actions found.";
      } else {
        auditLogs.entries.forEach((log) => {
          const action = log.action;
          const executor = log.executor.tag;
          const target = log.target?.tag || log.targetId || "Unknown";
          const reason = log.reason || "No reason";

          logsContent += `**${action}** - ${executor} → ${target}\n`;
          logsContent += `   📝 Reason: ${reason}\n`;
        });
      }

      await interaction.reply({
        content: logsContent,
        ephemeral: true,
      });

      console.log(`📋 ${interaction.user.tag} viewed server audit logs`);
    } catch (error) {
      console.error("❌ Error fetching logs:", error);
      await interaction.reply({
        content: "❌ Failed to fetch audit logs.",
        ephemeral: true,
      });
    }
  }

  // Config command - Show/update bot settings
  if (interaction.commandName === "config") {
    if (!interaction.memberPermissions.has("ManageGuild")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Server" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      try {
        const guildId = interaction.guild.id;
        const nextExecDate = new Date(
          lastExecutionTime + AUTO_EXECUTE_INTERVAL_MS
        );

        const configContent =
          `⚙️ **Bot Configuration for ${interaction.guild.name}**\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 **Guild ID:** ${guildId}\n` +
          `🤖 **Auto-Execution:** ${
            autoExecutionEnabled ? "✅ Enabled" : "❌ Disabled"
          }\n` +
          `📅 **Next Execution:** ${
            autoExecutionEnabled
              ? nextExecDate.toLocaleString("en-US")
              : "Paused (auto-execution disabled)"
          }\n` +
          `⏱️ **Execution Interval:** ${AUTO_EXECUTE_INTERVAL_DAYS} days\n` +
          `💓 **API Latency:** ${Math.round(client.ws.ping)}ms`;

        await interaction.reply({
          content: configContent,
          ephemeral: true,
        });

        console.log(`⚙️ ${interaction.user.tag} viewed bot configuration`);
      } catch (error) {
        console.error("❌ Error viewing config:", error);
        await interaction.reply({
          content: "❌ Failed to fetch configuration.",
          ephemeral: true,
        });
      }
    }
  }

  // Backup command - Show backup info
  if (interaction.commandName === "backup") {
    if (!interaction.memberPermissions.has("ManageGuild")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Server" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const guild = interaction.guild;
      const memberCount = guild.memberCount;
      const channelCount = guild.channels.cache.size;
      const roleCount = guild.roles.cache.size;

      const backupInfo =
        `💾 **Server Backup Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🏛️ **Server:** ${guild.name}\n` +
        `👥 **Members:** ${memberCount}\n` +
        `💬 **Channels:** ${channelCount}\n` +
        `🏷️ **Roles:** ${roleCount}\n` +
        `📊 **Total Data Points:** ${
          memberCount + channelCount + roleCount
        }\n` +
        `\n💡 **Note:** This is informational only. For full server backups, consider using dedicated backup bots or server management tools.`;

      await interaction.reply({
        content: `✅ ${backupInfo}`,
        ephemeral: true,
      });

      console.log(`💾 ${interaction.user.tag} viewed backup information`);
    } catch (error) {
      console.error("❌ Error fetching backup info:", error);
      await interaction.reply({
        content: "❌ Failed to fetch backup information.",
        ephemeral: true,
      });
    }
  }

  // Avatar command - Show user's avatar
  if (interaction.commandName === "avatar") {
    try {
      const user = interaction.options.getUser("user") || interaction.user;
      const avatarUrl = user.displayAvatarURL({ size: 512 });

      await interaction.reply({
        content: `✅ **${user.username}'s Avatar:**\n${avatarUrl}`,
        ephemeral: true,
      });

      console.log(`👤 ${interaction.user.tag} viewed ${user.tag}'s avatar`);
    } catch (error) {
      console.error("❌ Error fetching avatar:", error);
      await interaction.reply({
        content: "❌ Failed to fetch avatar.",
        ephemeral: true,
      });
    }
  }

  // Notify command - Send DM to a user
  if (interaction.commandName === "notify") {
    try {
      const user = interaction.options.getUser("user");
      const message = interaction.options.getString("message");

      await user.send(
        `📬 **Notification from ${interaction.user.tag}:**\n${message}`
      );

      await interaction.reply({
        content: `✅ Notification sent to ${user}!`,
        ephemeral: true,
      });

      console.log(
        `📬 ${interaction.user.tag} sent notification to ${user.tag}`
      );
    } catch (error) {
      console.error("❌ Error sending notification:", error);
      await interaction.reply({
        content: "❌ Failed to send notification (user may have DMs disabled).",
        ephemeral: true,
      });
    }
  }

  // Echo command - Repeat text (fun command)
  if (interaction.commandName === "echo") {
    try {
      const text = interaction.options.getString("text");

      await interaction.reply({
        content: `✅ **Echo:** ${text}`,
        ephemeral: true,
      });

      console.log(`🔊 ${interaction.user.tag} echoed: ${text}`);
    } catch (error) {
      console.error("❌ Error echoing text:", error);
      await interaction.reply({
        content: "❌ Failed to echo text.",
        ephemeral: true,
      });
    }
  }

  // Role info command - Get role information
  if (interaction.commandName === "roleinfo") {
    try {
      const role = interaction.options.getRole("role");
      const createdAt = Math.floor(role.createdTimestamp / 1000);
      const memberCount = interaction.guild.members.cache.filter((m) =>
        m.roles.cache.has(role.id)
      ).size;

      const roleInfo =
        `🏷️ **Role Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**Name:** ${role.name}\n` +
        `**ID:** ${role.id}\n` +
        `**Color:** ${role.hexColor}\n` +
        `**Created:** <t:${createdAt}:R>\n` +
        `**Members:** ${memberCount}\n` +
        `**Position:** ${role.position}\n` +
        `**Managed:** ${role.managed ? "Yes" : "No"}\n` +
        `**Mentionable:** ${role.mentionable ? "Yes" : "No"}`;

      await interaction.reply({
        content: `✅ ${roleInfo}`,
        ephemeral: true,
      });

      console.log(
        `🏷️ ${interaction.user.tag} viewed info for role: ${role.name}`
      );
    } catch (error) {
      console.error("❌ Error fetching role info:", error);
      await interaction.reply({
        content: "❌ Failed to fetch role information.",
        ephemeral: true,
      });
    }
  }

  // Channel info command - Get channel information
  if (interaction.commandName === "channelinfo") {
    try {
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;
      const createdAt = Math.floor(channel.createdTimestamp / 1000);

      let channelInfo =
        `💬 **Channel Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `**Name:** ${channel.name}\n` +
        `**Type:** ${channel.type === 0 ? "Text" : "Voice"}\n` +
        `**ID:** ${channel.id}\n` +
        `**Created:** <t:${createdAt}:R>`;

      if (channel.type === 0) {
        channelInfo += `\n**Topic:** ${channel.topic || "None"}`;
      }

      await interaction.reply({
        content: `✅ ${channelInfo}`,
        ephemeral: true,
      });

      console.log(
        `💬 ${interaction.user.tag} viewed info for channel: ${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error fetching channel info:", error);
      await interaction.reply({
        content: "❌ Failed to fetch channel information.",
        ephemeral: true,
      });
    }
  }

  // Uptime ranking command - Show bot uptime percentage
  if (interaction.commandName === "uptime-ranking") {
    try {
      const uptime = Date.now() - botStartTime;
      const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
      const percentage = ((uptime / (30 * 24 * 60 * 60 * 1000)) * 100).toFixed(
        2
      );

      const uptimeRank =
        `⏰ **30-Day Uptime Ranking**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 **Total Uptime:** ${days}d ${hours}h ${minutes}m ${seconds}s\n` +
        `📈 **Uptime %:** ${Math.min(100, percentage)}%\n` +
        `🎯 **Rating:** ${
          uptime > 25 * 24 * 60 * 60 * 1000
            ? "⭐⭐⭐ Excellent"
            : uptime > 20 * 24 * 60 * 60 * 1000
            ? "⭐⭐ Good"
            : "⭐ Fair"
        }`;

      await interaction.reply({
        content: `✅ ${uptimeRank}`,
        ephemeral: true,
      });

      console.log(`⏰ ${interaction.user.tag} checked uptime ranking`);
    } catch (error) {
      console.error("❌ Error fetching uptime ranking:", error);
      await interaction.reply({
        content: "❌ Failed to fetch uptime ranking.",
        ephemeral: true,
      });
    }
  }

  // Ban list command - Show banned users
  if (interaction.commandName === "banlist") {
    if (!interaction.memberPermissions.has("BanMembers")) {
      await interaction.reply({
        content:
          '❌ You need the "Ban Members" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const bans = await interaction.guild.bans.fetch();

      if (bans.size === 0) {
        await interaction.reply({
          content: "✅ No banned users in this server.",
          ephemeral: true,
        });
        return;
      }

      let banListContent = `⛔ **Ban List (${bans.size} total)**\n━━━━━━━━━━━━━━━━━━━\n`;
      let count = 0;

      for (const [, ban] of bans) {
        if (count >= 20) {
          banListContent += `\n... and ${bans.size - 20} more`;
          break;
        }
        banListContent += `• **${ban.user.tag}** - ${
          ban.reason || "No reason"
        }\n`;
        count++;
      }

      await interaction.reply({
        content: `✅ ${banListContent}`,
        ephemeral: true,
      });

      console.log(`⛔ ${interaction.user.tag} viewed ban list`);
    } catch (error) {
      console.error("❌ Error fetching ban list:", error);
      await interaction.reply({
        content: "❌ Failed to fetch ban list.",
        ephemeral: true,
      });
    }
  }

  // Clear warnings command - Reset warn count (admin)
  if (interaction.commandName === "clear-warnings") {
    if (!interaction.memberPermissions.has("Administrator")) {
      await interaction.reply({
        content:
          '❌ You need the "Administrator" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");

      await interaction.reply({
        content: `✅ Warnings cleared for ${user}! (Note: This bot doesn't track persistent warnings. Use a dedicated warning bot for that.)`,
        ephemeral: true,
      });

      console.log(
        `🔄 ${interaction.user.tag} cleared warnings for ${user.tag}`
      );
    } catch (error) {
      console.error("❌ Error clearing warnings:", error);
      await interaction.reply({
        content: "❌ Failed to clear warnings.",
        ephemeral: true,
      });
    }
  }

  // Tracking command
  if (interaction.commandName === "tracking") {
    if (!interaction.memberPermissions.has("Administrator")) {
      await interaction.reply({
        content:
          '❌ You need the "Administrator" permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === "toggle") {
      const enabled = interaction.options.getBoolean("enabled");

      if (!trackingConfig.has(guildId)) {
        trackingConfig.set(guildId, { enabled: false, channelId: null });
      }

      trackingConfig.get(guildId).enabled = enabled;
      saveTrackingData(guildId);

      await interaction.reply({
        content: `✅ Guild activity tracking has been **${
          enabled ? "enabled" : "disabled"
        }**.${
          enabled && !trackingConfig.get(guildId).channelId
            ? "\n💡 Tip: Set a log channel with `/tracking channel` to send logs to a specific channel."
            : ""
        }`,
        ephemeral: true,
      });

      console.log(
        `🔄 ${interaction.user.tag} ${
          enabled ? "enabled" : "disabled"
        } tracking in ${interaction.guild.name}`
      );
    } else if (subcommand === "channel") {
      const channel = interaction.options.getChannel("channel");

      if (!channel.isTextBased()) {
        await interaction.reply({
          content: "❌ Please select a text channel.",
          ephemeral: true,
        });
        return;
      }

      if (!trackingConfig.has(guildId)) {
        trackingConfig.set(guildId, { enabled: false, channelId: null });
      }

      trackingConfig.get(guildId).channelId = channel.id;
      saveTrackingData(guildId);

      await interaction.reply({
        content: `✅ Tracking logs will now be sent to ${channel}.${
          !trackingConfig.get(guildId).enabled
            ? "\n💡 Tip: Enable tracking with `/tracking toggle enabled:True`"
            : ""
        }`,
        ephemeral: true,
      });

      console.log(
        `🔄 ${interaction.user.tag} set tracking channel to #${channel.name} in ${interaction.guild.name}`
      );
    } else if (subcommand === "status") {
      const config = trackingConfig.get(guildId);
      const enabled = config?.enabled || false;
      const channelId = config?.channelId;
      const channel = channelId
        ? await client.channels.fetch(channelId).catch(() => null)
        : null;
      const ignoredChannels = config?.ignoredChannels || [];
      const events = config?.events || {
        messages: true,
        members: true,
        voice: true,
        reactions: true,
        channels: true,
        userUpdates: true,
        channelUpdates: true,
        roles: true,
        guild: true,
        threads: true,
        scheduledEvents: true,
        stickers: true,
        webhooks: true,
        integrations: true,
        invites: true,
        stageInstances: true,
        moderationRules: true,
        interactions: true,
      };

      const ignoredChannelsStr =
        ignoredChannels.length > 0
          ? ignoredChannels.map((id) => `<#${id}>`).join(", ")
          : "None";

      const eventStatus = [
        `Messages: ${events.messages ? "✅" : "❌"}`,
        `Members: ${events.members ? "✅" : "❌"}`,
        `Voice: ${events.voice ? "✅" : "❌"}`,
        `Reactions: ${events.reactions ? "✅" : "❌"}`,
        `Channels: ${events.channels ? "✅" : "❌"}`,
        `User Updates: ${events.userUpdates ? "✅" : "❌"}`,
        `Channel Updates: ${events.channelUpdates ? "✅" : "❌"}`,
        `Roles: ${events.roles ? "✅" : "❌"}`,
        `Guild: ${events.guild ? "✅" : "❌"}`,
        `Threads: ${events.threads ? "✅" : "❌"}`,
        `Scheduled Events: ${events.scheduledEvents ? "✅" : "❌"}`,
        `Stickers: ${events.stickers ? "✅" : "❌"}`,
        `Webhooks: ${events.webhooks ? "✅" : "❌"}`,
        `Integrations: ${events.integrations ? "✅" : "❌"}`,
        `Invites: ${events.invites ? "✅" : "❌"}`,
        `Stage Instances: ${events.stageInstances ? "✅" : "❌"}`,
        `Moderation Rules: ${events.moderationRules ? "✅" : "❌"}`,
        `Interactions: ${events.interactions ? "✅" : "❌"}`,
      ].join("\n");

      await interaction.reply({
        content:
          `📊 **Tracking Status for ${interaction.guild.name}**\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🔘 **Status:** ${enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
          `📢 **Log Channel:** ${
            channel ? `${channel}` : "❌ Not set (logs to console)"
          }\n` +
          `🚫 **Ignored Channels:** ${ignoredChannelsStr}\n\n` +
          `📋 **Event Types:**\n${eventStatus}`,
        ephemeral: true,
      });
    } else if (subcommand === "ignore-channel") {
      const channel = interaction.options.getChannel("channel");

      if (!trackingConfig.has(guildId)) {
        trackingConfig.set(guildId, {
          enabled: false,
          channelId: null,
          ignoredChannels: [],
          events: {
            messages: true,
            members: true,
            voice: true,
            reactions: true,
            channels: true,
            userUpdates: true,
          },
        });
      }

      const config = trackingConfig.get(guildId);
      const ignoredChannels = config.ignoredChannels || [];
      const index = ignoredChannels.indexOf(channel.id);

      if (index > -1) {
        ignoredChannels.splice(index, 1);
        await interaction.reply({
          content: `✅ ${channel} has been **removed** from the tracking ignore list.`,
          ephemeral: true,
        });
        console.log(
          `🔄 ${interaction.user.tag} removed ${channel.name} from ignore list in ${interaction.guild.name}`
        );
      } else {
        ignoredChannels.push(channel.id);
        await interaction.reply({
          content: `✅ ${channel} has been **added** to the tracking ignore list.`,
          ephemeral: true,
        });
        console.log(
          `🔄 ${interaction.user.tag} added ${channel.name} to ignore list in ${interaction.guild.name}`
        );
      }

      config.ignoredChannels = ignoredChannels;
      saveTrackingData(guildId);
    } else if (subcommand === "events") {
      if (!trackingConfig.has(guildId)) {
        trackingConfig.set(guildId, {
          enabled: false,
          channelId: null,
          ignoredChannels: [],
          events: {
            messages: true,
            members: true,
            voice: true,
            reactions: true,
            channels: true,
            userUpdates: true,
          },
        });
      }

      const config = trackingConfig.get(guildId);
      const events = config.events;
      let updatedAny = false;

      const eventOptions = [
        { key: "messages", option: "messages" },
        { key: "members", option: "members" },
        { key: "voice", option: "voice" },
        { key: "reactions", option: "reactions" },
        { key: "channels", option: "channels" },
        { key: "userUpdates", option: "user-updates" },
        { key: "channelUpdates", option: "channel-updates" },
        { key: "roles", option: "roles" },
        { key: "guild", option: "guild" },
        { key: "threads", option: "threads" },
        { key: "scheduledEvents", option: "scheduled-events" },
        { key: "stickers", option: "stickers" },
        { key: "webhooks", option: "webhooks" },
        { key: "integrations", option: "integrations" },
        { key: "invites", option: "invites" },
        { key: "stageInstances", option: "stage-instances" },
        { key: "moderationRules", option: "moderation-rules" },
        { key: "interactions", option: "interactions" },
      ];

      const changes = [];

      for (const { key, option } of eventOptions) {
        const value = interaction.options.getBoolean(option);
        if (value !== null) {
          events[key] = value;
          updatedAny = true;
          changes.push(`${key}: ${value ? "✅" : "❌"}`);
        }
      }

      if (!updatedAny) {
        await interaction.reply({
          content:
            "❌ No event options were provided. Use `/tracking events` with at least one option.",
          ephemeral: true,
        });
        return;
      }

      config.events = events;
      saveTrackingData(guildId);

      await interaction.reply({
        content: `✅ Tracking event preferences updated:\n${changes
          .map((c) => `• ${c}`)
          .join("\n")}`,
        ephemeral: true,
      });

      console.log(
        `🔄 ${interaction.user.tag} updated tracking events in ${interaction.guild.name}`
      );
    }
  }

  // Twitch notification command
  if (interaction.commandName === "twitch-notify") {
    if (!twitchAPI) {
      await interaction.reply({
        content:
          "❌ Twitch notifications are not configured. Please add `TWITCH_CLIENT_ID` and `TWITCH_ACCESS_TOKEN` to your .env file.",
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guild.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      const streamerName = interaction.options
        .getString("streamer")
        .toLowerCase();
      const notificationChannel =
        interaction.options.getChannel("channel") || interaction.channel;

      // Validate Twitch user exists
      const user = await twitchAPI.getUser(streamerName);
      if (!user) {
        await interaction.reply({
          content: `❌ Twitch user **${streamerName}** not found. Please check the username.`,
          ephemeral: true,
        });
        return;
      }

      // Initialize guild's streamer list if not exists
      if (!twitchStreamers.has(guildId)) {
        twitchStreamers.set(guildId, new Set());
      }

      const streamers = twitchStreamers.get(guildId);

      if (streamers.has(streamerName)) {
        await interaction.reply({
          content: `⚠️ **${user.display_name}** is already being monitored in this server.`,
          ephemeral: true,
        });
        return;
      }

      streamers.add(streamerName);
      twitchNotificationChannels.set(guildId, notificationChannel.id);
      saveTwitchData(guildId);

      await interaction.reply({
        content:
          `✅ Now monitoring **${user.display_name}** (${user.login})\n` +
          `📢 Notifications will be sent to ${notificationChannel}\n` +
          `🔍 Checking status every 60 seconds`,
        ephemeral: true,
      });

      console.log(
        `✅ Added Twitch streamer ${streamerName} to ${interaction.guild.name}`
      );
    } else if (subcommand === "remove") {
      const streamerName = interaction.options
        .getString("streamer")
        .toLowerCase();

      if (!twitchStreamers.has(guildId)) {
        await interaction.reply({
          content: "❌ No streamers are being monitored in this server.",
          ephemeral: true,
        });
        return;
      }

      const streamers = twitchStreamers.get(guildId);

      if (!streamers.has(streamerName)) {
        await interaction.reply({
          content: `❌ **${streamerName}** is not being monitored in this server.`,
          ephemeral: true,
        });
        return;
      }

      streamers.delete(streamerName);
      saveTwitchData(guildId);

      await interaction.reply({
        content: `✅ Stopped monitoring **${streamerName}**`,
        ephemeral: true,
      });

      console.log(
        `✅ Removed Twitch streamer ${streamerName} from ${interaction.guild.name}`
      );
    } else if (subcommand === "list") {
      const streamers = twitchStreamers.get(guildId);

      if (!streamers || streamers.size === 0) {
        await interaction.reply({
          content: "📭 No streamers are being monitored in this server.",
          ephemeral: true,
        });
        return;
      }

      const streamerList = Array.from(streamers).join(", ");
      const channel = twitchNotificationChannels.get(guildId);
      const notifChannel = channel
        ? await client.channels.fetch(channel).catch(() => null)
        : null;

      await interaction.reply({
        content:
          `📺 **Monitored Streamers for ${interaction.guild.name}**\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🎮 ${streamerList}\n` +
          `📢 Notification Channel: ${
            notifChannel ? notifChannel.toString() : "❌ Not set"
          }\n` +
          `Total: ${streamers.size}`,
        ephemeral: true,
      });
    } else if (subcommand === "channel") {
      const channel = interaction.options.getChannel("channel");

      if (!channel.isTextBased()) {
        await interaction.reply({
          content: "❌ Please select a text channel.",
          ephemeral: true,
        });
        return;
      }

      twitchNotificationChannels.set(guildId, channel.id);
      saveTwitchData(guildId);

      await interaction.reply({
        content: `✅ Twitch notifications will be sent to ${channel}`,
        ephemeral: true,
      });

      console.log(
        `🔄 ${interaction.user.tag} set Twitch notification channel to #${channel.name}`
      );
    }
  }

  // 8ball command
  if (interaction.commandName === "8ball") {
    const responses = [
      "Yes, definitely! ✅",
      "No, not at all. ❌",
      "Maybe, ask again later. 🤔",
      "It is certain. 🎱",
      "Very doubtful. 😕",
      "Signs point to yes. 👍",
      "Don't count on it. 👎",
      "Outlook good. 😊",
      "Ask again later. ⏳",
      "Better not tell you now. 🤐",
      "Absolutely! 🎉",
      "Concentrate and ask again. 🧠",
      "This is certain. 💯",
      "Outlook not so good. 😬",
      "Without a doubt. 🙌",
    ];

    const question = interaction.options.getString("question");
    const response = responses[Math.floor(Math.random() * responses.length)];

    await interaction.reply({
      content:
        `🎱 **Magic 8-Ball**\n` +
        `❓ **Question:** ${question}\n` +
        `🔮 **Answer:** ${response}`,
    });

    console.log(`🎱 ${interaction.user.tag} used 8ball: ${question}`);
  }

  // Dice command
  if (interaction.commandName === "dice") {
    const sides = interaction.options.getInteger("sides") || 6;
    const rolls = interaction.options.getInteger("rolls") || 1;

    let results = [];
    let total = 0;

    for (let i = 0; i < rolls; i++) {
      const roll = Math.floor(Math.random() * sides) + 1;
      results.push(roll);
      total += roll;
    }

    const resultText = rolls === 1 ? results[0].toString() : results.join(", ");

    await interaction.reply({
      content:
        `🎲 **Dice Roll**\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `🎲 **Results (d${sides}):** ${resultText}\n` +
        `📊 **Total:** ${total}\n` +
        `🔢 **Rolls:** ${rolls}`,
    });

    console.log(
      `🎲 ${interaction.user.tag} rolled ${rolls}d${sides}: ${resultText}`
    );
  }

  // Flip command
  if (interaction.commandName === "flip") {
    const flip = Math.random() > 0.5 ? "Heads" : "Tails";
    const emoji = flip === "Heads" ? "🪙" : "🪙";

    await interaction.reply({
      content: `${emoji} **Coin Flip**\n━━━━━━━━━━━━━━\nResult: **${flip}**`,
    });

    console.log(`🪙 ${interaction.user.tag} flipped a coin: ${flip}`);
  }

  // Quote command
  if (interaction.commandName === "quote") {
    const quotes = [
      "The only way to do great work is to love what you do. - Steve Jobs",
      "Innovation distinguishes between a leader and a follower. - Steve Jobs",
      "Life is what happens when you're busy making other plans. - John Lennon",
      "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
      "It is during our darkest moments that we must focus to see the light. - Aristotle",
      "The only impossible journey is the one you never begin. - Tony Robbins",
      "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
      "Believe you can and you're halfway there. - Theodore Roosevelt",
      "The best way to predict the future is to invent it. - Alan Kay",
      "Don't watch the clock; do what it does. Keep going. - Sam Levenson",
      "Quality is not an act, it is a habit. - Aristotle",
      "The way to get started is to quit talking and begin doing. - Walt Disney",
      "Don't let yesterday take up too much of today. - Will Rogers",
      "You learn more from failure than from success. - Unknown",
      "It's not whether you get knocked down, it's whether you get up. - Vince Lombardi",
    ];

    const quote = quotes[Math.floor(Math.random() * quotes.length)];

    await interaction.reply({
      content: `✨ **Inspirational Quote**\n━━━━━━━━━━━━━━━━━━\n"${quote}"`,
    });

    console.log(`✨ ${interaction.user.tag} requested a quote`);
  }

  // Joke command
  if (interaction.commandName === "joke") {
    const jokes = [
      "Why don't scientists trust atoms? Because they make up everything!",
      "Why did the scarecrow win an award? He was outstanding in his field!",
      "I'm reading a book about anti-gravity. It's impossible to put down!",
      "Why don't eggs tell jokes? They'd crack each other up!",
      "What do you call a fish wearing a bowtie? Sofishticated!",
      "Why did the programmer quit his job? He didn't get arrays!",
      "How many programmers does it take to change a light bulb? None, that's a hardware problem!",
      "Why do Java developers wear glasses? Because they don't C#!",
      "Why did the coffee file a police report? It got mugged!",
      "What's the object-oriented way to become wealthy? Inheritance!",
      "Why don't skeletons fight each other? They don't have the guts!",
      "What do you call a bear with no teeth? A gummy bear!",
      "Why did the math book look sad? Because it had too many problems!",
      "What did the ocean say to the beach? Nothing, it just waved!",
      "Why don't oysters share their pearls? They're shellfish!",
    ];

    const joke = jokes[Math.floor(Math.random() * jokes.length)];

    await interaction.reply({
      content: `😂 **Joke**\n━━━━━━━━━\n${joke}`,
    });

    console.log(`😂 ${interaction.user.tag} requested a joke`);
  }

  // Warn list command
  if (interaction.commandName === "warn-list") {
    const user = interaction.options.getUser("user");

    await interaction.reply({
      content:
        `⚠️ **Warnings for ${user.tag}**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 User: ${user.toString()}\n` +
        `🆔 ID: ${user.id}\n` +
        `📊 Total Warnings: 0\n\n` +
        `💡 *Note: Detailed warning history would require a database. This is a placeholder.*`,
      ephemeral: true,
    });

    console.log(`⚠️ ${interaction.user.tag} viewed warnings for ${user.tag}`);
  }

  // Role assign command
  if (interaction.commandName === "role-assign") {
    if (requiresGuild(interaction, "role-assign")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageRoles")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Roles" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      const member = await interaction.guild.members.fetch(user.id);

      if (member.roles.cache.has(role.id)) {
        await interaction.reply({
          content: `⚠️ **${user.tag}** already has the **${role.name}** role.`,
          ephemeral: true,
        });
        return;
      }

      await member.roles.add(role);

      await interaction.reply({
        content: `✅ Assigned **${role.name}** to **${user.tag}**`,
      });

      console.log(
        `✅ ${interaction.user.tag} assigned ${role.name} to ${user.tag}`
      );
    } catch (error) {
      console.error("❌ Error assigning role:", error);
      await interaction.reply({
        content: "❌ Failed to assign the role.",
        ephemeral: true,
      });
    }
  }

  // Role remove command
  if (interaction.commandName === "role-remove") {
    if (requiresGuild(interaction, "role-remove")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageRoles")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Roles" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const user = interaction.options.getUser("user");
      const role = interaction.options.getRole("role");
      const member = await interaction.guild.members.fetch(user.id);

      if (!member.roles.cache.has(role.id)) {
        await interaction.reply({
          content: `⚠️ **${user.tag}** does not have the **${role.name}** role.`,
          ephemeral: true,
        });
        return;
      }

      await member.roles.remove(role);

      await interaction.reply({
        content: `✅ Removed **${role.name}** from **${user.tag}**`,
      });

      console.log(
        `✅ ${interaction.user.tag} removed ${role.name} from ${user.tag}`
      );
    } catch (error) {
      console.error("❌ Error removing role:", error);
      await interaction.reply({
        content: "❌ Failed to remove the role.",
        ephemeral: true,
      });
    }
  }

  // Channel create command
  if (interaction.commandName === "channel-create") {
    if (requiresGuild(interaction, "channel-create")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageChannels")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Channels" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const name = interaction.options.getString("name");
      const topic = interaction.options.getString("topic");

      const channel = await interaction.guild.channels.create({
        name: name,
        type: 0,
        topic: topic || undefined,
      });

      await interaction.reply({
        content:
          `✅ Created channel ${channel.toString()}\n` +
          `📝 Name: ${channel.name}\n` +
          `🔗 Topic: ${topic || "None"}`,
      });

      console.log(
        `✅ ${interaction.user.tag} created channel #${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error creating channel:", error);
      await interaction.reply({
        content: "❌ Failed to create the channel.",
        ephemeral: true,
      });
    }
  }

  // Channel delete command
  if (interaction.commandName === "channel-delete") {
    if (requiresGuild(interaction, "channel-delete")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageChannels")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Channels" permission or a Moderator role to use this command.',
        ephemeral: true,
      });
      return;
    }

    try {
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      if (channel.isDMBased()) {
        await interaction.reply({
          content: "❌ Cannot delete DM channels.",
          ephemeral: true,
        });
        return;
      }

      const channelName = channel.name;
      await channel.delete();

      await interaction.reply({
        content: `✅ Deleted channel #${channelName}`,
      });

      console.log(`🗑️ ${interaction.user.tag} deleted channel #${channelName}`);
    } catch (error) {
      console.error("❌ Error deleting channel:", error);
      await interaction.reply({
        content: "❌ Failed to delete the channel.",
        ephemeral: true,
      });
    }
  }

  // Welcome command
  if (interaction.commandName === "welcome") {
    if (requiresGuild(interaction, "welcome")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageGuild")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Server" permission to set welcome messages.',
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel");
    const message = interaction.options.getString("message");

    await interaction.reply({
      content:
        `✅ Welcome message configured!\n` +
        `📢 Channel: ${channel.toString()}\n` +
        `📝 Message: ${message}\n` +
        `💡 *Note: Welcome messages require event listener setup in code.*`,
      ephemeral: true,
    });

    console.log(
      `${interaction.user.tag} configured welcome message for #${channel.name}`
    );
  }

  // Settings command
  if (interaction.commandName === "settings") {
    if (requiresGuild(interaction, "settings")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageGuild")) {
      await interaction.reply({
        content: '❌ You need the "Manage Server" permission to view settings.',
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      const guild = interaction.guild;
      const config = trackingConfig.get(guild.id);

      await interaction.reply({
        content:
          `⚙️ **Server Settings**\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🏛️ **Server:** ${guild.name}\n` +
          `📊 **Activity Tracking:** ${
            config?.enabled ? "✅ Enabled" : "❌ Disabled"
          }\n` +
          `📢 **Log Channel:** ${
            config?.channelId ? `<#${config.channelId}>` : "Not configured"
          }\n` +
          `🔇 **Ignored Channels:** ${
            config?.ignoredChannels?.length || 0
          } channel(s)`,
        ephemeral: true,
      });

      console.log(`⚙️ ${interaction.user.tag} viewed server settings`);
    }
  }

  // Announce command
  if (interaction.commandName === "announce") {
    if (requiresGuild(interaction, "announce")) return;

    if (!hasPermissionOrRole(interaction.member, "ManageMessages")) {
      await interaction.reply({
        content:
          '❌ You need the "Manage Messages" permission to make announcements.',
        ephemeral: true,
      });
      return;
    }

    try {
      const message = interaction.options.getString("message");
      const channel =
        interaction.options.getChannel("channel") || interaction.channel;

      await channel.send({
        content: `📢 **ANNOUNCEMENT**\n━━━━━━━━━━━━━━━\n${message}\n\n*Posted by ${interaction.user.tag}*`,
      });

      await interaction.reply({
        content: `✅ Announcement sent to ${channel}!`,
        ephemeral: true,
      });

      console.log(
        `📢 ${interaction.user.tag} made an announcement in #${channel.name}`
      );
    } catch (error) {
      console.error("❌ Error sending announcement:", error);
      await interaction.reply({
        content: "❌ Failed to send the announcement.",
        ephemeral: true,
      });
    }
  }

  // Ping user command
  if (interaction.commandName === "ping-user") {
    const user = interaction.options.getUser("user");
    const message = interaction.options.getString("message");

    try {
      await user.send(
        `🔔 **Message from ${interaction.user.tag} in ${interaction.guild.name}**\n━━━━━━━━━━━━━━━━━\n${message}`
      );

      await interaction.reply({
        content: `✅ Message sent to **${user.tag}**!`,
        ephemeral: true,
      });

      console.log(`🔔 ${interaction.user.tag} pinged ${user.tag}`);
    } catch (error) {
      console.error("❌ Error sending DM:", error);
      await interaction.reply({
        content: `❌ Could not send message to **${user.tag}**. They may have DMs disabled.`,
        ephemeral: true,
      });
    }
  }

  // Bot info command
  if (interaction.commandName === "botinfo") {
    await interaction.reply({
      content:
        `🤖 **Bot Information**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📛 **Name:** ${client.user.username}\n` +
        `🆔 **ID:** ${client.user.id}\n` +
        `⏰ **Uptime:** ${getUptime()}\n` +
        `🏛️ **Servers:** ${client.guilds.cache.size}\n` +
        `👥 **Users:** ${client.users.cache.size}\n` +
        `💬 **Channels:** ${client.channels.cache.size}\n` +
        `💓 **API Latency:** ${Math.round(client.ws.ping)}ms\n` +
        `🔌 **Discord.js Version:** v${discordVersion}\n` +
        `🎖️ **Purpose:** Maintain Discord Active Developer Badge`,
      ephemeral: true,
    });

    console.log(`🤖 ${interaction.user.tag} requested bot info`);
  }

  // Suggest command
  if (interaction.commandName === "suggest") {
    if (requiresGuild(interaction, "suggest")) return;

    const suggestion = interaction.options.getString("suggestion");

    // Send to server owner or log
    try {
      const owner = await interaction.guild.fetchOwner();
      await owner.send(
        `💡 **New Suggestion** from ${interaction.user.tag} (${interaction.guild.name})\n━━━━━━━━━━━━━━━━━\n${suggestion}`
      );
    } catch (error) {
      console.log("Could not send suggestion to owner, logging instead");
    }

    await interaction.reply({
      content: `✅ Your suggestion has been submitted to the server administrators!`,
      ephemeral: true,
    });

    console.log(
      `💡 ${interaction.user.tag} submitted a suggestion: ${suggestion}`
    );
  }

  // Command activity command
  if (interaction.commandName === "command-activity") {
    const days = interaction.options.getInteger("days") || 7;

    await interaction.reply({
      content:
        `📊 **Command Activity (Last ${days} days)**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔝 **Top Commands:**\n` +
        `1️⃣ /ping - 45 uses\n` +
        `2️⃣ /help - 32 uses\n` +
        `3️⃣ /userinfo - 28 uses\n` +
        `4️⃣ /status - 25 uses\n` +
        `5️⃣ /stats - 18 uses\n\n` +
        `💡 *Note: Detailed command tracking requires database logging.*`,
      ephemeral: true,
    });

    console.log(
      `📊 ${interaction.user.tag} viewed command activity for ${days} days`
    );
  }

  // ============================================
  // TRANSLATION COMMANDS
  // ============================================

  // Translate setup command
  if (interaction.commandName === "translate-setup") {
    if (requiresGuild(interaction, "translate-setup")) return;

    const channel = interaction.options.getChannel("channel");
    const targetLanguage =
      interaction.options.getString("target-language") || "en";
    const guildId = interaction.guild.id;

    // Ensure config exists
    const config = ensureTranslationConfig(guildId);
    config.channels.add(channel.id);
    if (targetLanguage) config.targetLanguage = targetLanguage;

    // Save configuration
    saveTranslationConfig(guildId);

    await interaction.reply({
      content: `✅ Auto-translation enabled for ${channel}\n🌐 Target language: **${targetLanguage.toUpperCase()}**\n📤 Display mode: **${
        config.displayMode
      }**`,
      ephemeral: true,
    });

    console.log(
      `🌐 ${interaction.user.tag} enabled translation in ${channel.name} (${guildId})`
    );
  }

  // Translate config command
  if (interaction.commandName === "translate-config") {
    if (requiresGuild(interaction, "translate-config")) return;

    const displayMode = interaction.options.getString("display-mode");
    const defaultLanguage = interaction.options.getString("default-language");
    const guildId = interaction.guild.id;

    // Ensure config exists
    const config = ensureTranslationConfig(guildId);
    if (displayMode) config.displayMode = displayMode;
    if (defaultLanguage) config.targetLanguage = defaultLanguage;

    // Save configuration
    saveTranslationConfig(guildId);

    await interaction.reply({
      content:
        `✅ Translation settings updated!\n` +
        `📤 Display mode: **${config.displayMode}**\n` +
        `🌐 Default language: **${config.targetLanguage.toUpperCase()}**`,
      ephemeral: true,
    });

    console.log(
      `⚙️ ${interaction.user.tag} updated translation config for guild ${guildId}`
    );
  }

  // Translate output channel command
  if (interaction.commandName === "translate-output-channel") {
    if (requiresGuild(interaction, "translate-output-channel")) return;

    const outputChannel = interaction.options.getChannel("channel");
    const guildId = interaction.guild.id;

    // Ensure config exists
    const config = ensureTranslationConfig(guildId);
    config.outputChannelId = outputChannel.id;

    // Save configuration
    saveTranslationConfig(guildId);

    await interaction.reply({
      content: `✅ Translation output channel set to ${outputChannel}\n💡 All translations from enabled channels will be sent here.`,
      ephemeral: true,
    });

    console.log(
      `🌐 ${interaction.user.tag} set translation output channel to ${outputChannel.name} (${guildId})`
    );
  }

  // Translate disable command
  if (interaction.commandName === "translate-disable") {
    if (requiresGuild(interaction, "translate-disable")) return;

    const channel = interaction.options.getChannel("channel");
    const guildId = interaction.guild.id;

    const config = translationConfig.get(guildId);
    if (!config || !config.channels.has(channel.id)) {
      await interaction.reply({
        content: `❌ Auto-translation is not enabled for ${channel}`,
        ephemeral: true,
      });
      return;
    }

    config.channels.delete(channel.id);
    saveTranslationConfig(guildId);

    await interaction.reply({
      content: `✅ Auto-translation disabled for ${channel}`,
      ephemeral: true,
    });

    console.log(
      `🌐 ${interaction.user.tag} disabled translation in ${channel.name} (${guildId})`
    );
  }

  // Translate list command
  if (interaction.commandName === "translate-list") {
    if (requiresGuild(interaction, "translate-list")) return;

    const guildId = interaction.guild.id;
    const config = translationConfig.get(guildId);

    if (!config || config.channels.size === 0) {
      await interaction.reply({
        content: `📋 No channels have auto-translation enabled.\n💡 Use \`/translate-setup\` to enable it!`,
        ephemeral: true,
      });
      return;
    }

    const channelList = Array.from(config.channels)
      .map((id) => `• <#${id}>`)
      .join("\n");

    const outputChannel = config.outputChannelId
      ? `<#${config.outputChannelId}>`
      : "(same as source channels)";

    await interaction.reply({
      content:
        `📋 **Auto-Translation Enabled Channels:**\n${channelList}\n\n` +
        `⚙️ **Settings:**\n` +
        `📤 Display mode: **${config.displayMode}**\n` +
        `🌐 Target language: **${config.targetLanguage.toUpperCase()}**\n` +
        `📍 Output channel: **${outputChannel}**`,
      ephemeral: true,
    });
  }

  // Translate status command
  if (interaction.commandName === "translate-status") {
    if (requiresGuild(interaction, "translate-status")) return;

    const guildId = interaction.guild.id;
    const config = ensureTranslationConfig(guildId);

    const channelList = Array.from(config.channels);
    const channelsText =
      channelList.length > 0
        ? channelList.map((id) => `• <#${id}>`).join("\n")
        : "(none)";

    const outputChannel = config.outputChannelId
      ? `<#${config.outputChannelId}>`
      : "(same as source channels)";

    const targetLang = getTranslationTargetLanguage(guildId).toUpperCase();
    const displayMode = getTranslationDisplayMode(guildId);

    await interaction.reply({
      content:
        `🌐 **Translation Status**\n` +
        `📤 Display mode: **${displayMode}**\n` +
        `🎯 Target language: **${targetLang}**\n` +
        `📍 Output channel: **${outputChannel}**\n\n` +
        `📋 **Enabled Channels:**\n${channelsText}`,
      ephemeral: true,
    });
  }

  // Manual translate command
  if (interaction.commandName === "translate") {
    const text = interaction.options.getString("text");
    const toLang = interaction.options.getString("to") || "en";
    const fromLang = interaction.options.getString("from");

    await interaction.deferReply();

    try {
      // Dynamically import Google Translate
      const translate = (await import("@iamtraction/google-translate")).default;

      const options = { to: toLang };
      if (fromLang) options.from = fromLang;

      const cleaned = stripEmotes(text);
      const result = await translate(cleaned || text, options);

      const sourceIso = result.from.language.iso;
      const sourceName = getLanguageName(sourceIso);
      const sourceFlag = getLanguageFlag(sourceIso);
      const targetName = getLanguageName(toLang);
      const targetFlag = getLanguageFlag(toLang);

      const embed = new EmbedBuilder()
        .setColor(0x4285f4)
        .setTitle("🌐 Translation")
        .addFields(
          {
            name: `Original (${sourceFlag} ${sourceName} — ${sourceIso.toUpperCase()})`,
            value: text.substring(0, 1024),
          },
          {
            name: `Translation (${targetFlag} ${targetName} — ${toLang.toUpperCase()})`,
            value: result.text.substring(0, 1024),
          }
        )
        .setFooter({ text: "Powered by Google Translate" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      console.log(
        `🌐 ${interaction.user.tag} translated text: ${result.from.language.iso} → ${toLang}`
      );
    } catch (error) {
      console.error("Translation error:", error);
      await interaction.editReply({
        content: `❌ Translation failed. Please check the language codes and try again.\n💡 Common codes: en, es, de, fr, it, ja, ko, zh-CN, pt, ru`,
      });
    }
  }

  // Track interactions (slash commands, buttons, select menus)
  if (interaction.guild && interaction.user) {
    let eventName = "Unknown Interaction";
    let description = "";

    if (interaction.isCommand()) {
      eventName = "💬 Slash Command Used";
      description = `**Command:** \`/${interaction.commandName}\``;
    } else if (interaction.isButton()) {
      eventName = "🔘 Button Clicked";
      description = `**Button ID:** \`${interaction.customId}\``;
    } else if (
      interaction.isStringSelectMenu() ||
      interaction.isUserSelectMenu() ||
      interaction.isRoleSelectMenu() ||
      interaction.isChannelSelectMenu()
    ) {
      eventName = "📋 Select Menu Used";
      description = `**Menu Type:** ${interaction.customId}`;
    }

    if (eventName !== "Unknown Interaction") {
      const embed = createTrackingEmbed(
        eventName,
        description,
        interaction.user,
        0x3498db
      );
      await logTrackingEvent(
        interaction.guild.id,
        null,
        embed,
        "interactions",
        interaction.channelId
      );
    }
  }
});

// Prefix command handler
client.on("messageCreate", async (message) => {
  // Ignore bot messages and messages without the prefix
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  // Extract the command and arguments
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  if (!command) return;

  // Prefix command: help
  if (command === "help") {
    const helpContent =
      `📖 **Available Commands**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `**Slash Commands (use /command):**\n` +
      `\`/ping\` – Check bot latency and badge status\n` +
      `\`/uptime\` – View bot uptime\n` +
      `\`/status\` – Show next auto-execution date\n` +
      `\`/serverinfo\` – Display server information\n` +
      `\`/userinfo [user]\` – Get user details\n` +
      `\`/stats\` – View bot performance statistics\n` +
      `\`/uptime-ranking\` – View bot uptime percentage\n` +
      `\n**Moderation:**\n` +
      `\`/kick <user> [reason]\` – Remove user from server\n` +
      `\`/ban <user> [reason]\` – Ban user from server\n` +
      `\`/mute <user> <minutes> [reason]\` – Mute user\n` +
      `\`/unmute <user>\` – Unmute user\n` +
      `\`/warn <user> [reason]\` – Warn user\n` +
      `\`/purge [amount]\` – Delete messages from channel\n` +
      `\`/slowmode <seconds>\` – Set channel slowmode (0 to disable)\n` +
      `\`/lock\` – Lock current channel\n` +
      `\`/unlock\` – Unlock current channel\n` +
      `\n**Utility & Notifications:**\n` +
      `\`/say <message> [channel]\` – Send message as bot\n` +
      `\`/poll <question> <opt1> <opt2> [opt3-5]\` – Create a poll\n` +
      `\`/remind <minutes> <reminder>\` – Set a reminder\n` +
      `\`/invite\` – Get bot invite link\n` +
      `\`/avatar [user]\` – View user's avatar\n` +
      `\`/echo <text>\` – Echo back text\n` +
      `\`/notify <user> <message>\` – Send DM notification\n` +
      `\`/twitch-notify\` – Manage Twitch live notifications\n` +
      `\n**Information:**\n` +
      `\`/roleinfo <role>\` – Get role details\n` +
      `\`/channelinfo [channel]\` – Get channel details\n` +
      `\n**Logging & Monitoring:**\n` +
      `\`/logs [lines]\` – View audit logs\n` +
      `\`/config view\` – View bot configuration\n` +
      `\`/backup\` – View server backup info\n` +
      `\`/banlist\` – View banned users\n` +
      `\`/clear-warnings <user>\` – Clear user warnings\n` +
      `\`/tracking toggle\` – Enable/disable activity tracking\n` +
      `\`/tracking channel\` – Set tracking log channel\n` +
      `\`/tracking status\` – View tracking configuration\n` +
      `\n**Prefix Commands (use ${PREFIX}command):**\n` +
      `\`${PREFIX}help\` – Show this message\n` +
      `\`${PREFIX}ping\` – Quick ping response\n` +
      `\`${PREFIX}uptime\` – Show bot uptime\n` +
      `\`${PREFIX}prefix\` – Show current command prefix`;

    try {
      await message.reply({ content: helpContent });
      console.log(`📖 ${message.author.tag} used prefix command: help`);
    } catch (error) {
      console.error("❌ Error sending help:", error);
    }
  }

  // Prefix command: ping
  else if (command === "ping") {
    const startTime = Date.now();
    const sentMessage = await message.reply({
      content: `🏓 Pong! Calculating latency...`,
    });

    const latency = Date.now() - startTime;
    const apiLatency = Math.round(client.ws.ping);

    try {
      await sentMessage.edit({
        content:
          `🏓 **Pong!**\n` +
          `⏱️ Message Latency: ${latency}ms\n` +
          `💓 API Latency: ${apiLatency}ms\n` +
          `✅ Bot is working properly`,
      });

      console.log(`🏓 ${message.author.tag} used prefix command: ping`);
    } catch (error) {
      console.error("❌ Error editing ping response:", error);
    }
  }

  // Prefix command: uptime
  else if (command === "uptime") {
    const uptime = Date.now() - botStartTime;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

    try {
      await message.reply({
        content:
          `✅ **Bot Uptime**\n` +
          `📊 Total: ${days}d ${hours}h ${minutes}m ${seconds}s\n` +
          `🚀 Started: <t:${Math.floor(botStartTime / 1000)}:R>\n` +
          `✅ Status: Online and operational`,
      });

      console.log(`⏰ ${message.author.tag} used prefix command: uptime`);
    } catch (error) {
      console.error("❌ Error sending uptime:", error);
    }
  }

  // Prefix command: prefix (show current prefix)
  else if (command === "prefix") {
    try {
      await message.reply({
        content:
          `📋 **Current Command Prefix:** \`${PREFIX}\`\n` +
          `\n💡 You can change this in the \`.env\` file by setting:\n` +
          `\`\`\`\nCOMMAND_PREFIX=${PREFIX}\n\`\`\`\n` +
          `Then restart the bot for changes to take effect.`,
      });

      console.log(`📋 ${message.author.tag} checked the command prefix`);
    } catch (error) {
      console.error("❌ Error sending prefix info:", error);
    }
  }

  // Unknown command response
  else {
    try {
      await message.reply({
        content: `❌ Unknown command \`${PREFIX}${command}\`. Use \`${PREFIX}help\` for available commands.`,
      });
    } catch (error) {
      console.error("❌ Error sending unknown command message:", error);
    }
  }
});

// ============================================
// AUTO-TRANSLATION
// ============================================

// Detect and translate non-English messages
client.on("messageCreate", async (message) => {
  // Ignore bot messages, DMs, and messages without content
  if (message.author.bot || !message.guild || !message.content) return;

  const guildId = message.guild.id;
  const channelId = message.channel.id;

  // Check if auto-translation is enabled for this channel
  if (!isTranslationEnabledForChannel(guildId, channelId)) return;

  try {
    // Dynamically import Google Translate
    const translate = (await import("@iamtraction/google-translate")).default;

    // Detect language and translate
    const targetLang = getTranslationTargetLanguage(guildId);
    const cleaned = stripEmotes(message.content);
    if (!cleaned) return;
    const result = await translate(cleaned, { to: targetLang });

    // Only respond if source language is different from target
    if (result.from.language.iso !== targetLang) {
      const displayMode = getTranslationDisplayMode(guildId);
      const outputChannelId = getTranslationOutputChannel(guildId);
      const translatedText = result.text;
      const sourceLang = result.from.language.iso.toUpperCase();
      const sourceName = getLanguageName(result.from.language.iso);
      const sourceFlag = getLanguageFlag(result.from.language.iso);

      // Determine where to send the translation
      let targetChannel = message.channel;
      if (outputChannelId) {
        try {
          targetChannel = await message.guild.channels.fetch(outputChannelId);
          if (!targetChannel) {
            console.error(
              `Output channel ${outputChannelId} not found in guild ${guildId}`
            );
            targetChannel = message.channel;
          }
        } catch (error) {
          console.error(
            `Failed to fetch output channel ${outputChannelId}: ${error.message}`
          );
          targetChannel = message.channel;
        }
      }

      if (displayMode === "embed") {
        const embed = new EmbedBuilder()
          .setColor(0x4285f4)
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL(),
          })
          .setDescription(
            `**Original (${sourceFlag} ${sourceName} — ${sourceLang}):**\n${message.content}\n\n**Translation:**\n${translatedText}`
          )
          .setFooter({
            text: `Translated by Google Translate • ${sourceLang} → ${targetLang.toUpperCase()}`,
          })
          .setTimestamp();

        // Add channel info if sending to different channel
        if (outputChannelId) {
          embed.addFields({
            name: "Source Channel",
            value: `<#${message.channel.id}>`,
            inline: true,
          });
        }

        await targetChannel.send({ embeds: [embed] });
      } else if (displayMode === "thread") {
        // Create a thread for the translation
        const thread = await targetChannel.threads.create({
          name: `Translation (${sourceLang} → ${targetLang.toUpperCase()})`,
          autoArchiveDuration: 60,
        });

        let threadMessage = `🌐 **Translation (from ${sourceFlag} ${sourceName} — ${sourceLang}):**\n${translatedText}`;
        if (outputChannelId) {
          threadMessage += `\n\n**Source:** ${message.author.username} in <#${message.channel.id}>`;
        }

        await thread.send(threadMessage);
      } else {
        // Default: reply mode
        let replyText = `🌐 **Translation (from ${sourceFlag} ${sourceName} — ${sourceLang} → ${targetLang.toUpperCase()}):**\n${translatedText}`;

        // If sending to output channel, mention the original author
        if (outputChannelId) {
          replyText = `${message.author} in <#${message.channel.id}>:\n\n${replyText}`;
        }

        if (outputChannelId) {
          await targetChannel.send(replyText);
        } else {
          await message.reply(replyText);
        }
      }
    }
  } catch (error) {
    console.error(`❌ Translation error in guild ${guildId}:`, error);
    // Silently fail - don't spam channels with error messages
  }
});

// ============================================
// GUILD ACTIVITY TRACKING
// ============================================

// Track sent messages
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  const embed = createTrackingEmbed(
    "💬 Message Sent",
    `**Channel:** <#${message.channel.id}>\n**Content:** ${
      message.content?.substring(0, 200) || "(no content)"
    }${message.content?.length > 200 ? "..." : ""}`,
    message.author,
    0x3498db
  );
  await logTrackingEvent(
    message.guild.id,
    null,
    embed,
    "message",
    message.channel.id
  );
});

// Track message deletions
client.on("messageDelete", async (message) => {
  if (message.partial || !message.guild) return;
  const embed = createTrackingEmbed(
    "🗑️ Message Deleted",
    `**Channel:** #${message.channel.name}\n**Content:** ${
      message.content?.substring(0, 200) || "(no content)"
    }${message.content?.length > 200 ? "..." : ""}`,
    message.author,
    0xe74c3c
  );
  await logTrackingEvent(
    message.guild.id,
    null,
    embed,
    "message",
    message.channel.id
  );
});

// Track bulk message deletions
client.on("messageDeleteBulk", async (messages) => {
  const channel = messages.first()?.channel;
  if (!channel?.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("🗑️ Bulk Messages Deleted")
    .setDescription(
      `**Channel:** #${channel.name}\n**Count:** ${messages.size} messages deleted`
    )
    .setColor(0xe74c3c)
    .setTimestamp();
  await logTrackingEvent(channel.guild.id, null, embed, "channel", channel.id);
});

// Track message edits
client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (oldMessage.partial || newMessage.partial || !newMessage.guild) return;
  if (oldMessage.content === newMessage.content) return; // Ignore embed updates

  const embed = createTrackingEmbed(
    "✏️ Message Edited",
    `**Channel:** #${newMessage.channel.name}\n**Old Content:** \`\`\`${
      oldMessage.content?.substring(0, 200) || "(no content)"
    }${
      oldMessage.content?.length > 200 ? "..." : ""
    }\`\`\`\n**New Content:** \`\`\`${
      newMessage.content?.substring(0, 200) || "(no content)"
    }${newMessage.content?.length > 200 ? "..." : ""}\`\`\``,
    newMessage.author,
    0xf39c12
  );
  await logTrackingEvent(
    newMessage.guild.id,
    null,
    embed,
    "message",
    newMessage.channel.id
  );
});

// Track members joining
client.on("guildMemberAdd", async (member) => {
  const embed = createTrackingEmbed(
    "➕ Member Joined",
    `**Account Created:** ${member.user.createdAt.toLocaleString()}\n**Join Timestamp:** <t:${Math.floor(
      Date.now() / 1000
    )}:F>`,
    member.user,
    0x2ecc71
  );
  await logTrackingEvent(member.guild.id, null, embed, "member", null);
});

// Track members leaving
client.on("guildMemberRemove", async (member) => {
  const embed = createTrackingEmbed(
    "➖ Member Left",
    `**Leave Timestamp:** <t:${Math.floor(Date.now() / 1000)}:F>`,
    member.user,
    0xe74c3c
  );
  await logTrackingEvent(member.guild.id, null, embed, "member", null);
});

// Track member updates (nickname, roles, avatar, etc.)
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const changes = [];

  if (oldMember.nickname !== newMember.nickname) {
    changes.push(
      `Nickname: "${oldMember.nickname || "None"}" → "${
        newMember.nickname || "None"
      }"`
    );
  }

  // Track server avatar changes
  if (oldMember.avatar !== newMember.avatar) {
    const oldAvatar = oldMember.avatarURL({ size: 128 }) || "None";
    const newAvatar = newMember.avatarURL({ size: 128 }) || "None";
    changes.push(`Server Avatar: Changed`);
    const embed = createTrackingEmbed(
      "🖼️ Server Avatar Changed",
      `**Old Avatar:** [Link](${oldAvatar})\n**New Avatar:** [Link](${newAvatar})`,
      newMember.user,
      0x9b59b6
    );
    await logTrackingEvent(newMember.guild.id, null, embed, "member", null);
  }

  const addedRoles = newMember.roles.cache.filter(
    (role) => !oldMember.roles.cache.has(role.id)
  );
  const removedRoles = oldMember.roles.cache.filter(
    (role) => !newMember.roles.cache.has(role.id)
  );

  if (addedRoles.size > 0) {
    const rolesList = addedRoles.map((r) => `<@&${r.id}>`).join(", ");
    changes.push(`Added roles: ${rolesList}`);
    const embed = createTrackingEmbed(
      "🎭 Roles Claimed",
      `**Roles Added:** ${rolesList}`,
      newMember.user,
      0x3498db
    );
    await logTrackingEvent(newMember.guild.id, null, embed, "member", null);
  }
  if (removedRoles.size > 0) {
    const rolesList = removedRoles.map((r) => `<@&${r.id}>`).join(", ");
    changes.push(`Removed roles: ${rolesList}`);
    const embed = createTrackingEmbed(
      "🎭 Roles Removed",
      `**Roles Removed:** ${rolesList}`,
      newMember.user,
      0xe74c3c
    );
    await logTrackingEvent(newMember.guild.id, null, embed, "member", null);
  }

  if (changes.length > 0 && !addedRoles.size && !removedRoles.size) {
    const embed = createTrackingEmbed(
      "👤 Member Updated",
      changes.join("\n"),
      newMember.user,
      0x95a5a6
    );
    await logTrackingEvent(newMember.guild.id, null, embed, "member", null);
  }
});

// Track user profile updates (global avatar, username, discriminator)
client.on("userUpdate", async (oldUser, newUser) => {
  const changes = [];

  if (oldUser.username !== newUser.username) {
    changes.push(`Username: "${oldUser.username}" → "${newUser.username}"`);
  }

  if (oldUser.discriminator !== newUser.discriminator) {
    changes.push(
      `Discriminator: #${oldUser.discriminator} → #${newUser.discriminator}`
    );
  }

  if (oldUser.avatar !== newUser.avatar) {
    const oldAvatar = oldUser.displayAvatarURL({ size: 128 });
    const newAvatar = newUser.displayAvatarURL({ size: 128 });
    changes.push(`Global Avatar: Changed`);

    // Log to all guilds where bot and user both exist
    for (const [guildId, guild] of client.guilds.cache) {
      if (guild.members.cache.has(newUser.id)) {
        const embed = createTrackingEmbed(
          "🖼️ Global Avatar Changed",
          `**Old Avatar:** [Link](${oldAvatar})\n**New Avatar:** [Link](${newAvatar})`,
          newUser,
          0x9b59b6
        );
        await logTrackingEvent(guildId, null, embed, "userUpdate", null);
      }
    }
  }

  if (oldUser.banner !== newUser.banner) {
    changes.push(`Banner: Changed`);
  }

  if (changes.length > 0 && !changes.some((c) => c.includes("Avatar"))) {
    // Log username/discriminator changes to all mutual guilds
    for (const [guildId, guild] of client.guilds.cache) {
      if (guild.members.cache.has(newUser.id)) {
        const embed = createTrackingEmbed(
          "👤 User Profile Updated",
          changes.join("\n"),
          newUser,
          0xf39c12
        );
        await logTrackingEvent(guildId, null, embed, "userUpdate", null);
      }
    }
  }
});

// Track voice channel activity
client.on("voiceStateUpdate", async (oldState, newState) => {
  const member = newState.member;
  if (!newState.guild) return;

  if (!oldState.channel && newState.channel) {
    const embed = createTrackingEmbed(
      "🔊 Voice Channel Joined",
      `**Channel:** <#${newState.channel.id}>`,
      member.user,
      0x3498db
    );
    await logTrackingEvent(
      newState.guild.id,
      null,
      embed,
      "voice",
      newState.channel.id
    );
  } else if (oldState.channel && !newState.channel) {
    const embed = createTrackingEmbed(
      "🔇 Voice Channel Left",
      `**Channel:** <#${oldState.channel.id}>`,
      member.user,
      0x95a5a6
    );
    await logTrackingEvent(
      oldState.guild.id,
      null,
      embed,
      "voice",
      oldState.channel.id
    );
  } else if (
    oldState.channel &&
    newState.channel &&
    oldState.channel.id !== newState.channel.id
  ) {
    const embed = createTrackingEmbed(
      "🔀 Voice Channel Switched",
      `**From:** <#${oldState.channel.id}>\n**To:** <#${newState.channel.id}>`,
      member.user,
      0xf39c12
    );
    await logTrackingEvent(
      newState.guild.id,
      null,
      embed,
      "voice",
      newState.channel.id
    );
  }

  // Track mute/unmute
  if (oldState.serverMute !== newState.serverMute) {
    const embed = createTrackingEmbed(
      newState.serverMute ? "🔇 Server Muted" : "🔊 Server Unmuted",
      `**Status:** ${newState.serverMute ? "Muted" : "Unmuted"}`,
      member.user,
      newState.serverMute ? 0xe74c3c : 0x2ecc71
    );
    await logTrackingEvent(
      newState.guild.id,
      null,
      embed,
      "voice",
      newState.channel?.id || null
    );
  }

  if (oldState.serverDeaf !== newState.serverDeaf) {
    const embed = createTrackingEmbed(
      newState.serverDeaf ? "🔇 Server Deafened" : "🔊 Server Undeafened",
      `**Status:** ${newState.serverDeaf ? "Deafened" : "Undeafened"}`,
      member.user,
      newState.serverDeaf ? 0xe74c3c : 0x2ecc71
    );
    await logTrackingEvent(
      newState.guild.id,
      null,
      embed,
      "voice",
      newState.channel?.id || null
    );
  }
});

// Track reactions
client.on("messageReactionAdd", async (reaction, user) => {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      return;
    }
  }
  if (!reaction.message.guild) return;

  const embed = createTrackingEmbed(
    "👍 Reaction Added",
    `**Reaction:** ${reaction.emoji}\n**Channel:** <#${reaction.message.channel.id}>\n**Message:** [Jump to message](${reaction.message.url})`,
    user,
    0x3498db
  );
  await logTrackingEvent(
    reaction.message.guild.id,
    null,
    embed,
    "reaction",
    reaction.message.channel.id
  );
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      return;
    }
  }
  if (!reaction.message.guild) return;

  const embed = createTrackingEmbed(
    "👎 Reaction Removed",
    `**Reaction:** ${reaction.emoji}\n**Channel:** <#${reaction.message.channel.id}>\n**Message:** [Jump to message](${reaction.message.url})`,
    user,
    0x95a5a6
  );
  await logTrackingEvent(
    reaction.message.guild.id,
    null,
    embed,
    "reaction",
    reaction.message.channel.id
  );
});

// Track channel creation
client.on("channelCreate", async (channel) => {
  if (!channel.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("➕ Channel Created")
    .setDescription(
      `**Channel:** <#${channel.id}>\n**Type:** ${
        channel.type
      }\n**Created:** <t:${Math.floor(Date.now() / 1000)}:F>`
    )
    .setColor(0x2ecc71)
    .setTimestamp();
  await logTrackingEvent(channel.guild.id, null, embed, "channel", channel.id);
});

// Track channel deletion
client.on("channelDelete", async (channel) => {
  if (!channel.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("➖ Channel Deleted")
    .setDescription(
      `**Channel:** ${channel.name}\n**Type:** ${
        channel.type
      }\n**Deleted:** <t:${Math.floor(Date.now() / 1000)}:F>`
    )
    .setColor(0xe74c3c)
    .setTimestamp();
  await logTrackingEvent(channel.guild.id, null, embed, "channel", channel.id);
});

// Track channel updates
client.on("channelUpdate", async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;

  const changes = [];
  if (oldChannel.name !== newChannel.name) {
    changes.push(`Name: "${oldChannel.name}" → "${newChannel.name}"`);
  }
  if (oldChannel.topic !== newChannel.topic) {
    changes.push(
      `Topic: "${oldChannel.topic || "None"}" → "${newChannel.topic || "None"}"`
    );
  }

  if (changes.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("✏️ Channel Updated")
      .setDescription(
        `**Channel:** <#${newChannel.id}>\n${changes
          .map((c) => `• ${c}`)
          .join("\n")}`
      )
      .setColor(0xf39c12)
      .setTimestamp();
    await logTrackingEvent(
      newChannel.guild.id,
      null,
      embed,
      "channelUpdates",
      newChannel.id
    );
  }
});

// Track role creation
client.on("roleCreate", async (role) => {
  if (!role.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("➕ Role Created")
    .setDescription(
      `**Role:** <@&${role.id}>\n**Color:** ${
        role.hexColor
      }\n**Mentionable:** ${role.mentionable ? "Yes" : "No"}`
    )
    .setColor(0x2ecc71)
    .setTimestamp();
  await logTrackingEvent(role.guild.id, null, embed, "roles", null);
});

// Track role deletion
client.on("roleDelete", async (role) => {
  if (!role.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("➖ Role Deleted")
    .setDescription(`**Role:** ${role.name}\n**ID:** \`${role.id}\``)
    .setColor(0xe74c3c)
    .setTimestamp();
  await logTrackingEvent(role.guild.id, null, embed, "roles", null);
});

// Track role updates
client.on("roleUpdate", async (oldRole, newRole) => {
  if (!newRole.guild) return;
  const changes = [];

  if (oldRole.name !== newRole.name) {
    changes.push(`Name: "${oldRole.name}" → "${newRole.name}"`);
  }
  if (oldRole.color !== newRole.color) {
    changes.push(`Color: ${oldRole.hexColor} → ${newRole.hexColor}`);
  }
  if (oldRole.mentionable !== newRole.mentionable) {
    changes.push(
      `Mentionable: ${oldRole.mentionable ? "Yes" : "No"} → ${
        newRole.mentionable ? "Yes" : "No"
      }`
    );
  }

  if (changes.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("✏️ Role Updated")
      .setDescription(
        `**Role:** <@&${newRole.id}>\n${changes
          .map((c) => `• ${c}`)
          .join("\n")}`
      )
      .setColor(0xf39c12)
      .setTimestamp();
    await logTrackingEvent(newRole.guild.id, null, embed, "roles", null);
  }
});

// Track guild updates
client.on("guildUpdate", async (oldGuild, newGuild) => {
  const changes = [];

  if (oldGuild.name !== newGuild.name) {
    changes.push(`Name: "${oldGuild.name}" → "${newGuild.name}"`);
  }
  if (oldGuild.icon !== newGuild.icon) {
    changes.push(`Icon changed`);
  }
  if (oldGuild.banner !== newGuild.banner) {
    changes.push(`Banner changed`);
  }

  if (changes.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("🏛️ Guild Updated")
      .setDescription(
        `**Guild:** ${newGuild.name}\n${changes
          .map((c) => `• ${c}`)
          .join("\n")}`
      )
      .setColor(0x9b59b6)
      .setTimestamp();
    await logTrackingEvent(newGuild.id, null, embed, "guild", null);
  }
});

// Track thread creation
client.on("threadCreate", async (thread) => {
  if (!thread.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("➕ Thread Created")
    .setDescription(
      `**Thread:** <#${thread.id}>\n**Parent:** <#${thread.parentId}>\n**Type:** ${thread.type}`
    )
    .setColor(0x2ecc71)
    .setTimestamp();
  await logTrackingEvent(thread.guild.id, null, embed, "threads", thread.id);
});

// Track thread deletion
client.on("threadDelete", async (thread) => {
  if (!thread.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("➖ Thread Deleted")
    .setDescription(`**Thread:** ${thread.name}\n**ID:** \`${thread.id}\``)
    .setColor(0xe74c3c)
    .setTimestamp();
  await logTrackingEvent(thread.guild.id, null, embed, "threads", null);
});

// Track scheduled events
client.on("guildScheduledEventCreate", async (event) => {
  const embed = new EmbedBuilder()
    .setTitle("📅 Scheduled Event Created")
    .setDescription(
      `**Event:** ${event.name}\n**Time:** <t:${Math.floor(
        event.scheduledStartTimestamp / 1000
      )}:F>`
    )
    .setColor(0x3498db)
    .setTimestamp();
  await logTrackingEvent(event.guildId, null, embed, "scheduledEvents", null);
});

client.on("guildScheduledEventDelete", async (event) => {
  const embed = new EmbedBuilder()
    .setTitle("❌ Scheduled Event Deleted")
    .setDescription(`**Event:** ${event.name}`)
    .setColor(0xe74c3c)
    .setTimestamp();
  await logTrackingEvent(event.guildId, null, embed, "scheduledEvents", null);
});

client.on("guildScheduledEventUpdate", async (oldEvent, newEvent) => {
  const changes = [];
  if (oldEvent.name !== newEvent.name) {
    changes.push(`Name: "${oldEvent.name}" → "${newEvent.name}"`);
  }
  if (oldEvent.description !== newEvent.description) {
    changes.push(`Description changed`);
  }

  if (changes.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("✏️ Scheduled Event Updated")
      .setDescription(
        `**Event:** ${newEvent.name}\n${changes
          .map((c) => `• ${c}`)
          .join("\n")}`
      )
      .setColor(0xf39c12)
      .setTimestamp();
    await logTrackingEvent(
      newEvent.guildId,
      null,
      embed,
      "scheduledEvents",
      null
    );
  }
});

// Track webhooks
client.on("webhookUpdate", async (channel) => {
  if (!channel.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("🪝 Webhook Updated")
    .setDescription(`**Channel:** <#${channel.id}>`)
    .setColor(0x3498db)
    .setTimestamp();
  await logTrackingEvent(channel.guild.id, null, embed, "webhooks", channel.id);
});

// Track stickers
client.on("stickerCreate", async (sticker) => {
  const embed = new EmbedBuilder()
    .setTitle("➕ Sticker Created")
    .setDescription(`**Sticker:** ${sticker.name}\n**ID:** \`${sticker.id}\``)
    .setColor(0x2ecc71)
    .setTimestamp();
  await logTrackingEvent(sticker.guild.id, null, embed, "stickers", null);
});

client.on("stickerDelete", async (sticker) => {
  const embed = new EmbedBuilder()
    .setTitle("➖ Sticker Deleted")
    .setDescription(`**Sticker:** ${sticker.name}`)
    .setColor(0xe74c3c)
    .setTimestamp();
  await logTrackingEvent(sticker.guild.id, null, embed, "stickers", null);
});

client.on("stickerUpdate", async (oldSticker, newSticker) => {
  const changes = [];
  if (oldSticker.name !== newSticker.name) {
    changes.push(`Name: "${oldSticker.name}" → "${newSticker.name}"`);
  }
  if (oldSticker.description !== newSticker.description) {
    changes.push(`Description changed`);
  }

  if (changes.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("✏️ Sticker Updated")
      .setDescription(
        `**Sticker:** ${newSticker.name}\n${changes
          .map((c) => `• ${c}`)
          .join("\n")}`
      )
      .setColor(0xf39c12)
      .setTimestamp();
    await logTrackingEvent(newSticker.guild.id, null, embed, "stickers", null);
  }
});

// Track invites
client.on("inviteCreate", async (invite) => {
  if (!invite.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("➕ Invite Created")
    .setDescription(
      `**Channel:** <#${invite.channelId}>\n**Code:** \`${invite.code}\`\n**Creator:** ${invite.inviter}`
    )
    .setColor(0x2ecc71)
    .setTimestamp();
  await logTrackingEvent(
    invite.guild.id,
    null,
    embed,
    "invites",
    invite.channelId
  );
});

client.on("inviteDelete", async (invite) => {
  if (!invite.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("➖ Invite Deleted")
    .setDescription(`**Code:** \`${invite.code}\``)
    .setColor(0xe74c3c)
    .setTimestamp();
  await logTrackingEvent(invite.guild.id, null, embed, "invites", null);
});

// Track stage instances
client.on("stageInstanceCreate", async (stage) => {
  if (!stage.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("🎤 Stage Instance Created")
    .setDescription(`**Topic:** ${stage.topic}`)
    .setColor(0x2ecc71)
    .setTimestamp();
  await logTrackingEvent(
    stage.guild.id,
    null,
    embed,
    "stageInstances",
    stage.channelId
  );
});

client.on("stageInstanceDelete", async (stage) => {
  if (!stage.guild) return;
  const embed = new EmbedBuilder()
    .setTitle("🎤 Stage Instance Deleted")
    .setDescription(`**Topic:** ${stage.topic}`)
    .setColor(0xe74c3c)
    .setTimestamp();
  await logTrackingEvent(stage.guild.id, null, embed, "stageInstances", null);
});

client.on("stageInstanceUpdate", async (oldStage, newStage) => {
  const changes = [];
  if (oldStage.topic !== newStage.topic) {
    changes.push(`Topic: "${oldStage.topic}" → "${newStage.topic}"`);
  }

  if (changes.length > 0) {
    const embed = new EmbedBuilder()
      .setTitle("✏️ Stage Instance Updated")
      .setDescription(`${changes.map((c) => `• ${c}`).join("\n")}`)
      .setColor(0xf39c12)
      .setTimestamp();
    await logTrackingEvent(
      newStage.guild.id,
      null,
      embed,
      "stageInstances",
      null
    );
  }
});

// Track bans
client.on("guildBanAdd", async (ban) => {
  const msg = `🔨 [BAN] ${ban.user.tag} (${ban.user.id}) was banned${
    ban.reason ? `\n   Reason: ${ban.reason}` : ""
  }`;
  await logTrackingEvent(ban.guild.id, msg);
});

// Track unbans
client.on("guildBanRemove", async (ban) => {
  const msg = `✅ [UNBAN] ${ban.user.tag} (${ban.user.id}) was unbanned`;
  await logTrackingEvent(ban.guild.id, msg);
});

// Track when bot joins a server
client.on("guildCreate", async (guild) => {
  console.log(
    `🎉 [BOT JOIN] Bot joined new server: ${guild.name} (${guild.id})`
  );
  console.log(`   Members: ${guild.memberCount}`);
  console.log(`   Owner: ${(await guild.fetchOwner()).user.tag}`);
});

// Track when bot leaves a server
client.on("guildDelete", async (guild) => {
  console.log(
    `👋 [BOT LEAVE] Bot removed from server: ${guild.name} (${guild.id})`
  );
});

// Track invites created
client.on("inviteCreate", async (invite) => {
  if (!invite.guild) return;
  const msg = `📧 [INVITE CREATE] Invite created by ${
    invite.inviter?.tag || "Unknown"
  }\n   Code: ${invite.code} | Max uses: ${invite.maxUses || "∞"} | Expires: ${
    invite.expiresAt?.toLocaleString() || "Never"
  }`;
  await logTrackingEvent(invite.guild.id, msg);
});

// Track invites deleted
client.on("inviteDelete", async (invite) => {
  if (!invite.guild) return;
  const msg = `📧 [INVITE DELETE] Invite ${invite.code} deleted`;
  await logTrackingEvent(invite.guild.id, msg);
});

// ============================================
// END GUILD ACTIVITY TRACKING
// ============================================

// Error handling
client.on("error", (error) => {
  console.error("❌ Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Promise rejection:", error);
});

// Track if guide has been opened
let guideOpened = false;

// Open setup guide on startup
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🚀 Starting Discord Active Developer Badge Bot...");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
openInviteBotGuide();
guideOpened = true;

// Login bot
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error("❌ Unable to login bot:", error);
  console.log(
    "Please check if your DISCORD_TOKEN is correctly set in the .env file"
  );

  // Only open guide if it wasn't already opened
  if (!guideOpened) {
    console.log("\n📖 Opening setup guide to help you configure the bot...");
    openInviteBotGuide();
  } else {
    console.log("\n📖 Please check the setup guide in your browser for help.");
  }

  setTimeout(() => process.exit(1), 2000);
});
