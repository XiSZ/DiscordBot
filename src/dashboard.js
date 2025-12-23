import express from "express";
import session from "express-session";
import FileStore from "session-file-store";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || process.env.DASHBOARD_PORT || 3000;

// Public metadata for login screen
app.get("/api/meta", (req, res) => {
  res.json({
    botName: process.env.BOT_NAME || "aB0T Dashboard",
    botAvatarUrl:
      process.env.BOT_AVATAR_URL ||
      "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f916.png",
  });
});

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
app.use(express.json());
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

// API: Get user's guilds where they have manage server permission
app.get("/api/guilds", isAuthenticated, async (req, res) => {
  try {
    const guilds = req.user.guilds || [];
    // Filter guilds where user has MANAGE_GUILD permission (0x20)
    const manageableGuilds = guilds.filter(
      (guild) => (guild.permissions & 0x20) === 0x20
    );
    res.json(manageableGuilds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get bot configuration for a guild
app.get("/api/guild/:guildId/config", isAuthenticated, async (req, res) => {
  try {
    const { guildId } = req.params;
    const configPath = join(
      __dirname,
      "..",
      "data",
      "servers",
      guildId,
      "translation-config.json"
    );

    if (!existsSync(configPath)) {
      return res.json({
        channels: [],
        displayMode: "reply",
        targetLanguages: ["en"],
        outputChannelId: null,
      });
    }

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
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
      __dirname,
      "..",
      "data",
      "servers",
      guildId,
      "translation-stats.json"
    );

    if (!existsSync(statsPath)) {
      return res.json({
        total: 0,
        byLanguagePair: {},
        byChannel: {},
      });
    }

    const stats = JSON.parse(readFileSync(statsPath, "utf-8"));
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
      __dirname,
      "..",
      "data",
      "servers",
      guildId,
      "translation-config.json"
    );

    let config = {
      channels: [],
      displayMode: "reply",
      targetLanguages: ["en"],
      outputChannelId: null,
    };

    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    }

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
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Save config
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

    res.json({ success: true, message: "Configuration updated successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
