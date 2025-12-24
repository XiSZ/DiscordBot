import express from "express";
import session from "express-session";
import FileStore from "session-file-store";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { exec } from "child_process";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;
const BOT_CONTROL_PORT = Number(process.env.BOT_CONTROL_PORT || 3210);
const CONTROL_TOKEN =
  process.env.CONTROL_TOKEN || process.env.SESSION_SECRET || "";

app.use(express.json());

// Helper to call bot control API
async function callBotControl(path, method = "GET", body = null) {
  const url = `http://127.0.0.1:${BOT_CONTROL_PORT}${path}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-control-token": CONTROL_TOKEN,
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  try {
    console.log(`[Dashboard] Calling bot control API: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(
        error.error || `Request failed with status ${response.status}`
      );
    }
    const data = await response.json();
    console.log(`[Dashboard] Control API response successful`);
    return data;
  } catch (error) {
    console.error(`[Dashboard] Control API error:`, error.message);
    throw error;
  }
}

// Public metadata for login screen
app.get("/api/meta", async (req, res) => {
  try {
    // Try to get bot info from control API
    let botInfo = null;
    try {
      botInfo = await callBotControl("/control/bot-info");
    } catch (error) {
      console.error("Failed to fetch bot info from control API:", error);
    }

    // If we got bot info, use it. Otherwise fall back to environment variables
    const response = {
      botName: botInfo?.username || process.env.BOT_NAME || "aB0T Dashboard",
      botAvatarUrl: botInfo?.avatarUrl || process.env.BOT_AVATAR_URL || null,
      botId: botInfo?.id || null,
      botTag: botInfo?.tag || null,
    };

    res.json(response);
  } catch (error) {
    res.json({
      botName: process.env.BOT_NAME || "aB0T Dashboard",
      botAvatarUrl: process.env.BOT_AVATAR_URL || null,
    });
  }
});

// Helpers for config paths
const DATA_DIR =
  process.env.RAILWAY_VOLUME_MOUNT_PATH || join(__dirname, "..", "data");
const DISCORD_API_BASE = "https://discord.com/api/v10";
const BADGE_SETTINGS_PATH = join(DATA_DIR, "badge-settings.json");
const DISABLED_COMMANDS_PATH = join(DATA_DIR, "disabled-commands.json");

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function readJSON(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

// Create session file store
const SessionFileStore = FileStore(session);
const sessionPath = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "sessions")
  : join(__dirname, "..", "sessions");

// Ensure sessions directory exists
if (!existsSync(sessionPath)) {
  mkdirSync(sessionPath, { recursive: true });
}

// Session configuration with file-based store
app.use(
  session({
    store: new SessionFileStore({
      path: sessionPath,
      ttl: 86400, // 24 hours in seconds
      retries: 0,
    }),
    secret: process.env.SESSION_SECRET || "your-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

// Passport configuration
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL:
        process.env.DASHBOARD_CALLBACK_URL ||
        (process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/auth/callback`
          : `http://localhost:${PORT}/auth/callback`),
      scope: ["identify", "guilds"],
    },
    (accessToken, refreshToken, profile, done) => {
      profile.accessToken = accessToken;
      return done(null, profile);
    }
  )
);

app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(join(__dirname, "..", "dashboard", "public")));

// Auth middleware
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not authenticated" });
}

// Routes
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/dashboard");
  }
  res.sendFile(join(__dirname, "..", "dashboard", "public", "index.html"));
});

app.get("/dashboard", isAuthenticated, (req, res) => {
  res.sendFile(join(__dirname, "..", "dashboard", "public", "dashboard.html"));
});

app.get("/auth/discord", passport.authenticate("discord"));

app.get(
  "/auth/callback",
  passport.authenticate("discord", {
    failureRedirect: "/",
  }),
  (req, res) => {
    res.redirect("/dashboard");
  }
);

app.get("/auth/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

app.get("/api/user", isAuthenticated, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    discriminator: req.user.discriminator,
    avatar: req.user.avatar,
  });
});

// Badge: status
app.get("/api/badge/status", isAuthenticated, (req, res) => {
  try {
    const defaults = {
      autoExecutionEnabled: true,
      lastExecutionTime: Date.now(),
      intervalDays: 30,
    };
    const data = readJSON(BADGE_SETTINGS_PATH, defaults);
    const next = new Date(
      (data.lastExecutionTime || Date.now()) +
        (data.intervalDays || 30) * 86400000
    );
    res.json({
      autoExecutionEnabled: !!data.autoExecutionEnabled,
      lastExecutionTime: data.lastExecutionTime || Date.now(),
      intervalDays: data.intervalDays || 30,
      nextExecutionISO: next.toISOString(),
      nextExecutionHuman: next.toLocaleString("en-US"),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Badge: update settings (enable/disable, optional intervalDays)
app.post("/api/badge/settings", isAuthenticated, (req, res) => {
  try {
    const { autoExecutionEnabled, intervalDays } = req.body || {};
    const current = readJSON(BADGE_SETTINGS_PATH, {
      autoExecutionEnabled: true,
      lastExecutionTime: Date.now(),
      intervalDays: 30,
    });
    if (typeof autoExecutionEnabled === "boolean")
      current.autoExecutionEnabled = autoExecutionEnabled;
    if (
      typeof intervalDays === "number" &&
      intervalDays >= 1 &&
      intervalDays <= 60
    )
      current.intervalDays = intervalDays;
    writeJSON(BADGE_SETTINGS_PATH, current);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Get user's guilds where they have manage server permission
app.get("/api/guilds", isAuthenticated, async (req, res) => {
  try {
    const guilds = req.user.guilds || [];
    // Filter guilds where user has MANAGE_GUILD permission (0x20)
    const manageableGuilds = guilds.filter(
      (guild) => (guild.permissions & 0x20) === 0x20
    );

    // Get bot guilds from control API
    let botGuilds = [];
    try {
      botGuilds = await callBotControl("/control/guilds");
      console.log(
        `[API] Successfully fetched ${botGuilds.length} bot guilds from control API`
      );
    } catch (error) {
      console.error(
        "[API] Failed to fetch bot guilds from control API:",
        error.message
      );
      // Continue without bot status if control API is unavailable
    }

    const botGuildIds = new Set(botGuilds.map((g) => g.id));
    console.log(
      `[API] Bot is in guilds: ${Array.from(botGuildIds).join(", ") || "none"}`
    );

    // Check which guilds the bot is in
    const guildsWithBotStatus = manageableGuilds.map((guild) => ({
      ...guild,
      botJoined: botGuildIds.has(guild.id),
    }));

    res.json(guildsWithBotStatus);
  } catch (error) {
    console.error("[API] Error in /api/guilds:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get bot guild info
app.get("/api/guild/:guildId/bot-status", isAuthenticated, async (req, res) => {
  try {
    const { guildId } = req.params;
    const guildInfo = await callBotControl(`/control/guild/${guildId}`);
    res.json(guildInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Leave guild
app.post("/api/guild/:guildId/leave", isAuthenticated, async (req, res) => {
  try {
    const { guildId } = req.params;
    const result = await callBotControl(
      `/control/guild/${guildId}/leave`,
      "POST"
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/guild/:guildId/config", isAuthenticated, async (req, res) => {
  try {
    const { guildId } = req.params;
    const configPath = join(
      DATA_DIR,
      "servers",
      guildId,
      "translation-config.json"
    );

    const config = readJSON(configPath, {
      channels: [],
      displayMode: "reply",
      targetLanguages: ["en"],
      outputChannelId: null,
    });

    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get translation stats for a guild
app.get("/api/guild/:guildId/stats", isAuthenticated, async (req, res) => {
  try {
    const { guildId } = req.params;
    const statsPath = join(
      DATA_DIR,
      "servers",
      guildId,
      "translation-stats.json"
    );

    const stats = readJSON(statsPath, {
      total: 0,
      byLanguagePair: {},
      byChannel: {},
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: List guild channels for selection
app.get("/api/guild/:guildId/channels", isAuthenticated, async (req, res) => {
  try {
    const { guildId } = req.params;

    // Verify permission
    const userGuilds = req.user.guilds || [];
    const hasPermission = userGuilds.some(
      (g) => g.id === guildId && (g.permissions & 0x20) === 0x20
    );

    if (!hasPermission) {
      return res
        .status(403)
        .json({ error: "No permission to manage this server" });
    }

    const botToken = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
    if (!botToken) {
      return res.status(500).json({
        error: "Bot token is not configured (set BOT_TOKEN or DISCORD_TOKEN)",
      });
    }

    const response = await fetch(
      `${DISCORD_API_BASE}/guilds/${guildId}/channels`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return res
        .status(response.status)
        .json({ error: `Failed to fetch channels: ${text || "Unknown"}` });
    }

    const channels = await response.json();
    const allowedTypes = new Set([0, 5, 15]); // Text, Announcement, Forum
    const filtered = channels
      .filter((ch) => allowedTypes.has(ch.type))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    res.json({
      channels: filtered.map((ch) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to load channels" });
  }
});

// API: Update translation configuration
app.post("/api/guild/:guildId/config", isAuthenticated, async (req, res) => {
  try {
    const { guildId } = req.params;
    const { displayMode, targetLanguages, outputChannelId, channels } =
      req.body;

    // Verify user has permission to manage this guild
    const userGuilds = req.user.guilds || [];
    const hasPermission = userGuilds.some(
      (g) => g.id === guildId && (g.permissions & 0x20) === 0x20
    );

    if (!hasPermission) {
      return res
        .status(403)
        .json({ error: "No permission to manage this server" });
    }

    // Load existing config
    const configPath = join(
      DATA_DIR,
      "servers",
      guildId,
      "translation-config.json"
    );

    let config = readJSON(configPath, {
      channels: [],
      displayMode: "reply",
      targetLanguages: ["en"],
      outputChannelId: null,
    });

    // Update config
    if (displayMode) config.displayMode = displayMode;
    if (targetLanguages) config.targetLanguages = targetLanguages;
    if (outputChannelId !== undefined) config.outputChannelId = outputChannelId;
    if (channels) {
      // Deduplicate channels and filter empties
      config.channels = Array.from(
        new Set((channels || []).filter((c) => !!c && `${c}`.trim().length > 0))
      );
    }

    // Ensure directory exists
    const configDir = dirname(configPath);
    ensureDir(configDir);

    // Save config
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

    res.json({ success: true, message: "Configuration updated successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get Twitch configuration for a guild
app.get(
  "/api/guild/:guildId/twitch-config",
  isAuthenticated,
  async (req, res) => {
    try {
      const { guildId } = req.params;

      // Verify permission
      const userGuilds = req.user.guilds || [];
      const hasPermission = userGuilds.some(
        (g) => g.id === guildId && (g.permissions & 0x20) === 0x20
      );
      if (!hasPermission) {
        return res
          .status(403)
          .json({ error: "No permission to manage this server" });
      }

      const configPath = join(
        DATA_DIR,
        "servers",
        guildId,
        "twitch-config.json"
      );
      const config = readJSON(configPath, { streamers: [], channelId: null });
      res.json({
        streamers: Array.isArray(config.streamers) ? config.streamers : [],
        channelId: config.channelId || null,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// API: Get Tracking configuration for a guild
app.get(
  "/api/guild/:guildId/tracking-config",
  isAuthenticated,
  async (req, res) => {
    try {
      const { guildId } = req.params;

      // Verify permission
      const userGuilds = req.user.guilds || [];
      const hasPermission = userGuilds.some(
        (g) => g.id === guildId && (g.permissions & 0x20) === 0x20
      );
      if (!hasPermission) {
        return res
          .status(403)
          .json({ error: "No permission to manage this server" });
      }

      const configPath = join(
        DATA_DIR,
        "servers",
        guildId,
        "tracking-config.json"
      );
      const defaults = {
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
      const config = readJSON(configPath, defaults);
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// API: Update Tracking configuration for a guild
app.post(
  "/api/guild/:guildId/tracking-config",
  isAuthenticated,
  async (req, res) => {
    try {
      const { guildId } = req.params;
      const { enabled, channelId, ignoredChannels, events } = req.body || {};

      // Verify permission
      const userGuilds = req.user.guilds || [];
      const hasPermission = userGuilds.some(
        (g) => g.id === guildId && (g.permissions & 0x20) === 0x20
      );
      if (!hasPermission) {
        return res
          .status(403)
          .json({ error: "No permission to manage this server" });
      }

      const configPath = join(
        DATA_DIR,
        "servers",
        guildId,
        "tracking-config.json"
      );
      const current = readJSON(configPath, {});
      const next = {
        enabled: !!enabled,
        channelId: channelId || null,
        ignoredChannels: Array.isArray(ignoredChannels)
          ? Array.from(new Set(ignoredChannels.filter(Boolean)))
          : [],
        events:
          typeof events === "object" && events !== null
            ? events
            : current.events || {},
      };
      writeJSON(configPath, next);
      res.json({ success: true, message: "Tracking configuration saved." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Trigger bot to reload Tracking config immediately
app.post("/api/tracking/reload", isAuthenticated, async (req, res) => {
  try {
    const r = await fetch(
      `http://127.0.0.1:${CONTROL_PORT}/control/reload-tracking`,
      {
        method: "POST",
        headers: CONTROL_TOKEN
          ? { "x-control-token": CONTROL_TOKEN }
          : undefined,
      }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json(data || { error: "Failed" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Update Twitch configuration for a guild
app.post(
  "/api/guild/:guildId/twitch-config",
  isAuthenticated,
  async (req, res) => {
    try {
      const { guildId } = req.params;
      const { streamers, channelId } = req.body || {};

      // Verify permission
      const userGuilds = req.user.guilds || [];
      const hasPermission = userGuilds.some(
        (g) => g.id === guildId && (g.permissions & 0x20) === 0x20
      );
      if (!hasPermission) {
        return res
          .status(403)
          .json({ error: "No permission to manage this server" });
      }

      const configPath = join(
        DATA_DIR,
        "servers",
        guildId,
        "twitch-config.json"
      );
      const next = {
        streamers: Array.from(
          new Set(
            (Array.isArray(streamers) ? streamers : [])
              .map((s) => String(s).trim())
              .filter(Boolean)
          )
        ),
        channelId: channelId || null,
      };
      writeJSON(configPath, next);
      res.json({ success: true, message: "Twitch configuration saved." });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Commands: list registered commands (global and optionally guild)
app.get("/api/commands", isAuthenticated, async (req, res) => {
  try {
    const botToken = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const { guildId } = req.query;
    if (!botToken || !clientId) {
      return res.status(500).json({ error: "Bot token or Client ID missing" });
    }

    const headers = { Authorization: `Bot ${botToken}` };
    const urls = [
      {
        scope: "global",
        url: `${DISCORD_API_BASE}/applications/${clientId}/commands`,
      },
    ];
    if (guildId) {
      // Verify user can manage the requested guild
      const userGuilds = req.user.guilds || [];
      const hasPermission = userGuilds.some(
        (g) => g.id === guildId && (g.permissions & 0x20) === 0x20
      );
      if (!hasPermission) {
        return res
          .status(403)
          .json({ error: "No permission to manage this server" });
      }
      urls.push({
        scope: "guild",
        url: `${DISCORD_API_BASE}/applications/${clientId}/guilds/${guildId}/commands`,
      });
    }

    // Disabled list
    const disabled = readJSON(DISABLED_COMMANDS_PATH, []);
    const disabledSet = new Set(
      Array.isArray(disabled) ? disabled : disabled?.names || []
    );

    const results = [];
    for (const { scope, url } of urls) {
      const r = await fetch(url, { headers });
      if (!r.ok) {
        const text = await r.text();
        return res
          .status(r.status)
          .json({ error: `Failed to fetch ${scope} commands: ${text}` });
      }
      const cmds = await r.json();
      results.push(
        ...cmds.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          scope,
          disabled: disabledSet.has(c.name),
        }))
      );
    }

    res.json({ commands: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Commands: toggle disabled state (runtime only)
app.post("/api/commands/disable", isAuthenticated, (req, res) => {
  try {
    const { name, disabled } = req.body || {};
    if (!name) return res.status(400).json({ error: "Missing command name" });
    const current = readJSON(DISABLED_COMMANDS_PATH, []);
    let set = new Set(Array.isArray(current) ? current : current?.names || []);
    if (disabled) set.add(name);
    else set.delete(name);
    writeJSON(DISABLED_COMMANDS_PATH, Array.from(set));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Commands: delete a registered command (global or guild)
app.post("/api/commands/delete", isAuthenticated, async (req, res) => {
  try {
    const botToken = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const { commandId, scope, guildId } = req.body || {};
    if (!botToken || !clientId) {
      return res.status(500).json({ error: "Bot token or Client ID missing" });
    }
    if (!commandId) return res.status(400).json({ error: "Missing commandId" });

    let url = `${DISCORD_API_BASE}/applications/${clientId}/commands/${commandId}`;
    if (scope === "guild") {
      if (!guildId)
        return res
          .status(400)
          .json({ error: "Missing guildId for guild scope" });
      url = `${DISCORD_API_BASE}/applications/${clientId}/guilds/${guildId}/commands/${commandId}`;
    }
    const r = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: `Delete failed: ${t}` });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Commands: re-register all from source script
app.post("/api/commands/register-all", isAuthenticated, (req, res) => {
  try {
    const node = process.execPath || "node";
    const script = join(__dirname, "register-commands.js");
    exec(`${node} ${script}`, (err, stdout, stderr) => {
      if (err) {
        return res.status(500).json({ error: stderr || err.message });
      }
      res.json({ success: true, output: stdout });
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Trigger bot to reload Twitch config immediately
app.post("/api/twitch/reload", isAuthenticated, async (req, res) => {
  try {
    const r = await fetch(
      `http://127.0.0.1:${CONTROL_PORT}/control/reload-twitch`,
      {
        method: "POST",
        headers: CONTROL_TOKEN
          ? { "x-control-token": CONTROL_TOKEN }
          : undefined,
      }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json(data || { error: "Failed" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Trigger bot to check Twitch now
app.post("/api/twitch/check", isAuthenticated, async (req, res) => {
  try {
    const r = await fetch(
      `http://127.0.0.1:${CONTROL_PORT}/control/check-twitch`,
      {
        method: "POST",
        headers: CONTROL_TOKEN
          ? { "x-control-token": CONTROL_TOKEN }
          : undefined,
      }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json(data || { error: "Failed" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: Get bot invite link
app.get("/api/invite", (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const permissions = "8"; // Administrator permission
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;
  res.json({ inviteUrl });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Dashboard running on port ${PORT}`);
  console.log(`📊 Access at: http://0.0.0.0:${PORT}`);
});
