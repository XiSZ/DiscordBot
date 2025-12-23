let currentGuildId = null;
let currentGuildName = null;
let guilds = [];

// Check if user is authenticated
async function checkAuth() {
  try {
    const response = await fetch("/api/user");
    if (!response.ok) {
      console.error("Auth check failed:", response.status);
      window.location.href = "/";
      return false;
    }
    const user = await response.json();
    document.getElementById(
      "userInfo"
    ).textContent = `${user.username}#${user.discriminator}`;
    return true;
  } catch (error) {
    console.error("Auth error:", error);
    alert("Failed to authenticate. Please try logging in again.");
    window.location.href = "/";
    return false;
  }
}

// Load user's guilds
async function loadGuilds() {
  const container = document.getElementById("serversList");

  try {
    const response = await fetch("/api/guilds");

    if (!response.ok) {
      throw new Error(
        `Server returned ${response.status}: ${response.statusText}`
      );
    }

    guilds = await response.json();

    if (guilds.length === 0) {
      container.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="bi bi-inbox" style="font-size: 3rem; color: #ccc;"></i>
                    <p class="mt-3 text-muted">No servers found where you have "Manage Server" permission</p>
                </div>
            `;
      return;
    }

    container.innerHTML = guilds
      .map((guild) => {
        const iconUrl = guild.icon
          ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
          : "https://cdn.discordapp.com/embed/avatars/0.png";

        return `
                <div class="col-md-4 col-lg-3 mb-3">
                    <div class="server-card card h-100" onclick="selectGuild('${
                      guild.id
                    }', '${guild.name.replace(/'/g, "\\'")}')">
                        <div class="card-body text-center">
                            <img src="${iconUrl}" alt="${guild.name}" 
                                class="rounded-circle mb-3" width="80" height="80">
                            <h6 class="card-title">${guild.name}</h6>
                            <small class="text-muted">Click to manage</small>
                        </div>
                    </div>
                </div>
            `;
      })
      .join("");
  } catch (error) {
    console.error("Error loading guilds:", error);
    container.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-exclamation-triangle" style="font-size: 3rem; color: #dc3545;"></i>
        <h5 class="mt-3 text-danger">Failed to load servers</h5>
        <p class="text-muted">${error.message}</p>
        <button class="btn btn-primary mt-3" onclick="loadGuilds()">
          <i class="bi bi-arrow-clockwise"></i> Retry
        </button>
      </div>
    `;
  }
}

// Select a guild
function selectGuild(guildId, guildName) {
  currentGuildId = guildId;
  currentGuildName = guildName;

  // Update active state
  document.querySelectorAll(".server-card").forEach((card) => {
    card.classList.remove("active");
  });
  event.target.closest(".server-card").classList.add("active");

  // Update server headers
  updateServerHeaders();

  // Load guild data
  loadGuildConfig();
  loadGuildStats();

  // Show translation page
  showPage("translation");
}

// Update server headers and switchers
function updateServerHeaders() {
  const currentGuild = guilds.find((g) => g.id === currentGuildId);
  if (!currentGuild) return;

  const iconUrl = currentGuild.icon
    ? `https://cdn.discordapp.com/icons/${currentGuild.id}/${currentGuild.icon}.png`
    : "https://cdn.discordapp.com/embed/avatars/0.png";

  // Update translation page header
  document.getElementById("currentServerIcon").src = iconUrl;
  document.getElementById("currentServerName").textContent = currentGuild.name;
  document.getElementById("serverHeader").style.display = "block";

  // Update stats page header
  document.getElementById("statsServerIcon").src = iconUrl;
  document.getElementById("statsServerName").textContent = currentGuild.name;
  document.getElementById("statsServerHeader").style.display = "block";

  // Populate server switcher dropdowns
  const switcherHTML = guilds
    .map((guild) => {
      const isActive = guild.id === currentGuildId;
      const gIcon = guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
        : "https://cdn.discordapp.com/embed/avatars/0.png";
      return `
        <li>
          <a class="dropdown-item ${isActive ? "active" : ""}" href="#" 
             onclick="switchToServer('${guild.id}', '${guild.name.replace(
        /'/g,
        "\\'"
      )}')
             event.preventDefault(); return false;">
            <img src="${gIcon}" width="20" height="20" class="rounded-circle me-2">
            ${guild.name}
          </a>
        </li>
      `;
    })
    .join("");

  document.getElementById("serverSwitcher").innerHTML = switcherHTML;
  document.getElementById("statsServerSwitcher").innerHTML = switcherHTML;
}

// Switch to a different server
function switchToServer(guildId, guildName) {
  currentGuildId = guildId;
  currentGuildName = guildName;

  // Update headers
  updateServerHeaders();

  // Reload data for new server
  loadGuildConfig();
  loadGuildStats();
}

// Load guild translation config
async function loadGuildConfig() {
  try {
    const response = await fetch(`/api/guild/${currentGuildId}/config`);
    const config = await response.json();

    const content = document.getElementById("translationContent");
    content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <div class="stat-card">
                        <h5><i class="bi bi-gear"></i> Configuration</h5>
                        <hr>
                        <div class="mb-3">
                            <label class="form-label">Display Mode</label>
                            <select class="form-select" id="displayMode">
                                <option value="reply" ${
                                  config.displayMode === "reply"
                                    ? "selected"
                                    : ""
                                }>Reply to Message</option>
                                <option value="embed" ${
                                  config.displayMode === "embed"
                                    ? "selected"
                                    : ""
                                }>Embed</option>
                                <option value="thread" ${
                                  config.displayMode === "thread"
                                    ? "selected"
                                    : ""
                                }>Thread</option>
                            </select>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label">Target Languages</label>
                            <div id="languagesList" class="mb-2">
                                ${config.targetLanguages
                                  .map(
                                    (lang) => `
                                    <span class="language-badge">
                                        ${lang.toUpperCase()}
                                        <i class="bi bi-x remove" onclick="removeLanguage('${lang}')"></i>
                                    </span>
                                `
                                  )
                                  .join("")}
                            </div>
                            <div class="input-group">
                                <input type="text" class="form-control" id="newLanguage" 
                                    placeholder="e.g., es, fr, de" maxlength="5">
                                <button class="btn btn-primary" onclick="addLanguage()">
                                    <i class="bi bi-plus"></i> Add
                                </button>
                            </div>
                            <small class="text-muted">Common: en, es, de, fr, it, ja, ko, zh-CN</small>
                        </div>

                        <div class="mb-3">
                            <label class="form-label">Output Channel</label>
                            <input type="text" class="form-control" id="outputChannel" 
                                value="${
                                  config.outputChannelId ||
                                  "None (same as source)"
                                }" readonly>
                            <small class="text-muted">Configure via Discord bot commands</small>
                        </div>

                        <button class="btn btn-success w-100" onclick="saveConfig()">
                            <i class="bi bi-check-circle"></i> Save Configuration
                        </button>
                    </div>
                </div>

                <div class="col-md-6">
                    <div class="stat-card">
                        <h5><i class="bi bi-hash"></i> Translation Channels</h5>
                        <hr>
                        <p class="text-muted">
                            <i class="bi bi-info-circle"></i>
                            Enabled channels: <strong>${
                              config.channels.length
                            }</strong>
                        </p>
                        <div id="channelsList">
                            ${
                              config.channels.length > 0
                                ? config.channels
                                    .map(
                                      (channelId) => `
                                <div class="channel-toggle">
                                    <div>
                                        <i class="bi bi-hash"></i> Channel: ${channelId}
                                    </div>
                                    <span class="badge bg-success">Enabled</span>
                                </div>
                            `
                                    )
                                    .join("")
                                : '<p class="text-muted">No channels enabled</p>'
                            }
                        </div>
                        <small class="text-muted mt-3 d-block">
                            Use <code>/translate-setup</code> command in Discord to enable channels
                        </small>
                    </div>
                </div>
            </div>
        `;
  } catch (error) {
    console.error("Error loading config:", error);
    document.getElementById("translationContent").innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i>
                Failed to load configuration
            </div>
        `;
  }
}

// Load guild statistics
async function loadGuildStats() {
  try {
    const response = await fetch(`/api/guild/${currentGuildId}/stats`);
    const stats = await response.json();

    const content = document.getElementById("statsContent");

    // Process top language pairs
    const pairs = Object.entries(stats.byLanguagePair || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Process top channels
    const channels = Object.entries(stats.byChannel || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    content.innerHTML = `
            <div class="row">
                <div class="col-md-4">
                    <div class="stat-card text-center">
                        <i class="bi bi-translate" style="font-size: 3rem; color: #667eea;"></i>
                        <div class="stat-number">${stats.total || 0}</div>
                        <p class="text-muted">Total Translations</p>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="stat-card text-center">
                        <i class="bi bi-globe" style="font-size: 3rem; color: #28a745;"></i>
                        <div class="stat-number">${
                          Object.keys(stats.byLanguagePair || {}).length
                        }</div>
                        <p class="text-muted">Language Pairs</p>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="stat-card text-center">
                        <i class="bi bi-hash" style="font-size: 3rem; color: #ffc107;"></i>
                        <div class="stat-number">${
                          Object.keys(stats.byChannel || {}).length
                        }</div>
                        <p class="text-muted">Active Channels</p>
                    </div>
                </div>
            </div>

            <div class="row mt-4">
                <div class="col-md-6">
                    <div class="stat-card">
                        <h5><i class="bi bi-arrow-left-right"></i> Top Language Pairs</h5>
                        <hr>
                        ${
                          pairs.length > 0
                            ? pairs
                                .map(
                                  ([pair, count]) => `
                            <div class="d-flex justify-content-between mb-2">
                                <span><strong>${pair}</strong></span>
                                <span class="badge bg-primary">${count} translations</span>
                            </div>
                        `
                                )
                                .join("")
                            : '<p class="text-muted">No data yet</p>'
                        }
                    </div>
                </div>

                <div class="col-md-6">
                    <div class="stat-card">
                        <h5><i class="bi bi-hash"></i> Most Active Channels</h5>
                        <hr>
                        ${
                          channels.length > 0
                            ? channels
                                .map(
                                  ([channelId, count]) => `
                            <div class="d-flex justify-content-between mb-2">
                                <span><i class="bi bi-hash"></i> ${channelId}</span>
                                <span class="badge bg-success">${count} translations</span>
                            </div>
                        `
                                )
                                .join("")
                            : '<p class="text-muted">No data yet</p>'
                        }
                    </div>
                </div>
            </div>
        `;
  } catch (error) {
    console.error("Error loading stats:", error);
    document.getElementById("statsContent").innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i>
                Failed to load statistics
            </div>
        `;
  }
}

// Add language
async function addLanguage() {
  const input = document.getElementById("newLanguage");
  const lang = input.value.trim().toLowerCase();

  if (!lang) {
    alert("Please enter a language code");
    return;
  }

  if (lang.length < 2 || lang.length > 5) {
    alert("Invalid language code. Use 2-5 characters (e.g., en, es, zh-CN)");
    return;
  }

  try {
    const response = await fetch(`/api/guild/${currentGuildId}/config`);
    const config = await response.json();

    if (config.targetLanguages.includes(lang)) {
      alert(`Language ${lang.toUpperCase()} is already added.`);
      return;
    }

    config.targetLanguages.push(lang);

    await saveConfigData(config);
    input.value = "";
    loadGuildConfig();
  } catch (error) {
    alert("Failed to add language: " + error.message);
  }
}

// Remove language
async function removeLanguage(lang) {
  if (!confirm(`Remove language ${lang.toUpperCase()}?`)) return;

  try {
    const response = await fetch(`/api/guild/${currentGuildId}/config`);
    const config = await response.json();

    config.targetLanguages = config.targetLanguages.filter((l) => l !== lang);

    if (config.targetLanguages.length === 0) {
      alert(
        "Cannot remove the last language. At least one language is required."
      );
      return;
    }

    await saveConfigData(config);
    loadGuildConfig();
  } catch (error) {
    alert("Failed to remove language: " + error.message);
  }
}

// Helper function to save config data
async function saveConfigData(config) {
  const response = await fetch(`/api/guild/${currentGuildId}/config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(config),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to save configuration");
  }

  return result;
}

// Save configuration
async function saveConfig() {
  const displayMode = document.getElementById("displayMode").value;
  const languagesList = document.getElementById("languagesList");
  const languageBadges = languagesList.querySelectorAll(".language-badge");
  const targetLanguages = Array.from(languageBadges).map((badge) =>
    badge.textContent.trim().replace("×", "").trim().toLowerCase()
  );

  try {
    const response = await fetch(`/api/guild/${currentGuildId}/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayMode,
        targetLanguages,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      // Show success message
      const successAlert = document.createElement("div");
      successAlert.className = "alert alert-success mt-3";
      successAlert.innerHTML = `
        <i class="bi bi-check-circle"></i> ${result.message}
        <br><small>Changes will take effect for new translations.</small>
      `;
      document
        .getElementById("translationContent")
        .insertBefore(
          successAlert,
          document.getElementById("translationContent").firstChild
        );

      setTimeout(() => successAlert.remove(), 5000);

      // Reload config
      loadGuildConfig();
    } else {
      alert(`Error: ${result.error || "Failed to save configuration"}`);
    }
  } catch (error) {
    alert("Failed to save configuration: " + error.message);
  }
}

// Page navigation
function showPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => {
    page.style.display = "none";
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.remove("active");
  });

  document.getElementById(`${pageName}Page`).style.display = "block";
  document.querySelector(`[data-page="${pageName}"]`)?.classList.add("active");

  // Load invite link when invite page is shown
  if (pageName === "invite") {
    loadInviteLink();
  }
}

// Load bot invite link
async function loadInviteLink() {
  try {
    const response = await fetch("/api/invite");
    const data = await response.json();
    document.getElementById("inviteLink").value = data.inviteUrl;
  } catch (error) {
    document.getElementById("inviteLink").value = "Error loading invite link";
    console.error("Failed to load invite link:", error);
  }
}

// Copy invite link to clipboard
function copyInviteLink() {
  const inviteInput = document.getElementById("inviteLink");
  inviteInput.select();
  inviteInput.setSelectionRange(0, 99999); // For mobile devices

  navigator.clipboard
    .writeText(inviteInput.value)
    .then(() => {
      const successAlert = document.getElementById("copySuccess");
      successAlert.style.display = "block";
      setTimeout(() => {
        successAlert.style.display = "none";
      }, 3000);
    })
    .catch((err) => {
      alert("Failed to copy: " + err);
    });
}

// Open invite link in new tab
function openInviteLink() {
  const inviteUrl = document.getElementById("inviteLink").value;
  if (inviteUrl && inviteUrl !== "Error loading invite link") {
    window.open(inviteUrl, "_blank");
  }
}

// Navigation click handlers
document.addEventListener("DOMContentLoaded", () => {
  checkAuth().then((isAuth) => {
    if (isAuth) {
      loadGuilds();
    }
  });

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      if (link.getAttribute("href") === "#") {
        e.preventDefault();
        const page = link.getAttribute("data-page");
        if (page) {
          showPage(page);
        }
      }
    });
  });
});
