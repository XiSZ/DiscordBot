let currentGuildId = null;
let currentGuildName = null;
let guilds = [];
let currentConfig = null;
let availableChannels = [];
let channelFetchError = null;

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
  const content = document.getElementById("translationContent");
  content.innerHTML = `
    <div class="d-flex justify-content-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
  `;

  try {
    const [configResponse, channelsResponse] = await Promise.all([
      fetch(`/api/guild/${currentGuildId}/config`),
      fetch(`/api/guild/${currentGuildId}/channels`),
    ]);

    currentConfig = await configResponse.json();
    channelFetchError = null;

    let channelsPayload = { channels: [] };
    if (channelsResponse.ok) {
      channelsPayload = await channelsResponse.json();
    } else {
      channelFetchError = `Failed to load channels (${channelsResponse.status})`;
      try {
        const body = await channelsResponse.json();
        if (body?.error) {
          channelFetchError = body.error;
        }
      } catch (_) {
        // Ignore parse errors
      }
    }

    availableChannels = channelsPayload.channels || [];

    currentConfig = {
      channels: currentConfig.channels || [],
      displayMode: currentConfig.displayMode || "reply",
      targetLanguages: currentConfig.targetLanguages || ["en"],
      outputChannelId: currentConfig.outputChannelId || null,
    };

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
                  currentConfig.displayMode === "reply" ? "selected" : ""
                }>Reply to Message</option>
                <option value="embed" ${
                  currentConfig.displayMode === "embed" ? "selected" : ""
                }>Embed</option>
                <option value="thread" ${
                  currentConfig.displayMode === "thread" ? "selected" : ""
                }>Thread</option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label">Target Languages</label>
              <div id="languagesList" class="mb-2"></div>
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
              <div class="input-group">
                <span class="input-group-text">#</span>
                <input type="text" class="form-control" id="outputChannel" 
                  value="${currentConfig.outputChannelId || ""}"
                  placeholder="Channel ID (leave blank for same channel)">
              </div>
              <small class="text-muted">Optional. Enter a channel ID to redirect translations.</small>
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
              Enabled channels: <strong id="channelsCount"></strong>
            </p>

            <div id="selectedChannels" class="mb-3"></div>

            <h6 class="mb-2"><i class="bi bi-list-check"></i> Available Channels</h6>
            <div id="channelPicker" class="mb-3"></div>

            <div class="input-group mt-3">
              <span class="input-group-text">#</span>
              <input type="text" class="form-control" id="newChannelId" placeholder="Add channel ID">
              <button class="btn btn-primary" onclick="addChannel()">
                <i class="bi bi-plus"></i> Add
              </button>
            </div>
            <small class="text-muted mt-2 d-block">
              Tip: Right-click a channel in Discord → Copy Channel ID (Developer Mode required)
            </small>
          </div>
        </div>
      </div>
    `;

    renderLanguageBadges();
    renderChannelPicker();
    renderSelectedChannels();
  } catch (error) {
    console.error("Error loading config:", error);
    content.innerHTML = `
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

function channelDisplayName(channelId) {
  const channel = availableChannels.find((ch) => ch.id === channelId);
  return channel ? `#${channel.name}` : `#${channelId}`;
}

function renderLanguageBadges() {
  const container = document.getElementById("languagesList");
  if (!container || !currentConfig) return;

  if (
    !currentConfig.targetLanguages ||
    currentConfig.targetLanguages.length === 0
  ) {
    container.innerHTML =
      '<p class="text-muted mb-0">No languages selected</p>';
    return;
  }

  container.innerHTML = currentConfig.targetLanguages
    .map(
      (lang) => `
        <span class="language-badge">
          ${lang.toUpperCase()}
          <i class="bi bi-x remove" onclick="removeLanguage('${lang}')"></i>
        </span>
      `
    )
    .join("");
}

function renderChannelPicker() {
  const container = document.getElementById("channelPicker");
  if (!container) return;

  if (channelFetchError) {
    container.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-exclamation-triangle"></i> ${channelFetchError}
      </div>
    `;
    return;
  }

  if (!availableChannels || availableChannels.length === 0) {
    container.innerHTML =
      '<p class="text-muted">No channel list available. Use manual add below.</p>';
    return;
  }

  container.innerHTML = availableChannels
    .map(
      (channel) => `
        <div class="form-check mb-2">
          <input class="form-check-input channel-checkbox" type="checkbox"
            id="channel-${channel.id}" value="${channel.id}"
            ${currentConfig.channels.includes(channel.id) ? "checked" : ""}
            onchange="toggleChannelSelection('${channel.id}', this.checked)">
          <label class="form-check-label" for="channel-${channel.id}">
            <i class="bi bi-hash"></i> ${channel.name}
          </label>
        </div>
      `
    )
    .join("");
}

function syncChannelCheckboxes() {
  document.querySelectorAll(".channel-checkbox").forEach((input) => {
    input.checked = currentConfig.channels.includes(input.value);
  });
}

function renderSelectedChannels() {
  const list = document.getElementById("selectedChannels");
  const count = document.getElementById("channelsCount");
  if (!list || !count || !currentConfig) return;

  const items = currentConfig.channels || [];
  count.textContent = items.length;

  if (items.length === 0) {
    list.innerHTML = '<p class="text-muted">No channels enabled</p>';
    syncChannelCheckboxes();
    return;
  }

  list.innerHTML = items
    .map(
      (channelId) => `
        <div class="channel-toggle" data-channel-id="${channelId}">
          <div>
            <i class="bi bi-hash"></i> ${channelDisplayName(channelId)}
          </div>
          <button class="btn btn-sm btn-outline-danger" onclick="removeChannel('${channelId}')">
            <i class="bi bi-x"></i> Remove
          </button>
        </div>
      `
    )
    .join("");

  syncChannelCheckboxes();
}

function toggleChannelSelection(channelId, checked) {
  if (!currentConfig) return;

  if (checked) {
    if (!currentConfig.channels.includes(channelId)) {
      currentConfig.channels.push(channelId);
    }
  } else {
    currentConfig.channels = currentConfig.channels.filter(
      (c) => c !== channelId
    );
  }

  renderSelectedChannels();
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

  if (!currentConfig) {
    alert("Please select a server first.");
    return;
  }

  if (currentConfig.targetLanguages.includes(lang)) {
    alert(`Language ${lang.toUpperCase()} is already added.`);
    return;
  }

  currentConfig.targetLanguages.push(lang);
  input.value = "";
  renderLanguageBadges();
}

// Add channel
async function addChannel() {
  const input = document.getElementById("newChannelId");
  const channelId = input.value.trim();

  if (!channelId) {
    alert("Please enter a channel ID");
    return;
  }

  if (!currentConfig) {
    alert("Please select a server first.");
    return;
  }

  if (currentConfig.channels.includes(channelId)) {
    alert("Channel already enabled.");
    return;
  }

  currentConfig.channels.push(channelId);
  input.value = "";
  renderSelectedChannels();
}

// Remove channel
async function removeChannel(channelId) {
  if (!confirm(`Remove channel ${channelId}?`)) return;

  if (!currentConfig) {
    alert("Please select a server first.");
    return;
  }

  currentConfig.channels = currentConfig.channels.filter(
    (c) => c !== channelId
  );
  renderSelectedChannels();
}

// Remove language
async function removeLanguage(lang) {
  if (!confirm(`Remove language ${lang.toUpperCase()}?`)) return;

  if (!currentConfig) {
    alert("Please select a server first.");
    return;
  }

  const nextLanguages = currentConfig.targetLanguages.filter((l) => l !== lang);

  if (nextLanguages.length === 0) {
    alert(
      "Cannot remove the last language. At least one language is required."
    );
    return;
  }

  currentConfig.targetLanguages = nextLanguages;
  renderLanguageBadges();
}

// Save configuration
async function saveConfig() {
  if (!currentConfig) {
    alert("Please select a server first.");
    return;
  }

  const displayMode = document.getElementById("displayMode").value;
  const outputChannelId =
    document.getElementById("outputChannel").value.trim() || null;

  currentConfig.displayMode = displayMode;
  currentConfig.outputChannelId = outputChannelId;

  const payload = {
    displayMode,
    targetLanguages: currentConfig.targetLanguages,
    outputChannelId,
    channels: currentConfig.channels,
  };

  try {
    const response = await fetch(`/api/guild/${currentGuildId}/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
