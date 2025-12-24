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
    const r = await fetch(currentGuildId ? `/api/commands?guildId=${currentGuildId}` : "/api/commands");
      window.location.href = "/";
      return false;
    renderCommandsList(data.commands || []);
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

  const globalCount = commands.filter(c=>c.scope==='global').length;
  const guildCount = commands.filter(c=>c.scope==='guild').length;
  const scopeInfo = currentGuildId
    ? `<div class="alert alert-info py-2 px-3 mb-2"><i class="bi bi-info-circle"></i> Showing global commands and commands registered in the selected server.</div>`
    : `<div class="alert alert-secondary py-2 px-3 mb-2"><i class="bi bi-info-circle"></i> No server selected — showing global commands only.</div>`;

  container.innerHTML = scopeInfo +
    commands
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
  updateServerCardStates();

  // Update server headers
  updateServerHeaders();

  // Load guild data
  loadGuildConfig();
  loadGuildStats();
  loadTwitchContent();

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
  const translationIcon = document.getElementById("currentServerIcon");
  const translationName = document.getElementById("currentServerName");
  const translationHeader = document.getElementById("serverHeader");
  if (translationIcon && translationName && translationHeader) {
    translationIcon.src = iconUrl;
    translationName.textContent = currentGuild.name;
    translationHeader.style.display = "block";
  }

  // Update stats page header
  const statsIcon = document.getElementById("statsServerIcon");
  const statsName = document.getElementById("statsServerName");
  const statsHeader = document.getElementById("statsServerHeader");
  if (statsIcon && statsName && statsHeader) {
    statsIcon.src = iconUrl;
    statsName.textContent = currentGuild.name;
    statsHeader.style.display = "block";
  }

  // Update Twitch page header
  const twitchIcon = document.getElementById("twitchServerIcon");
  const twitchName = document.getElementById("twitchServerName");
  const twitchHeader = document.getElementById("twitchServerHeader");
  if (twitchIcon && twitchName && twitchHeader) {
    twitchIcon.src = iconUrl;
    twitchName.textContent = currentGuild.name;
    twitchHeader.style.display = "block";
  }

  // Update sidebar current server display
  const sidebarDisplay = document.getElementById("currentServerDisplay");
  const sidebarIcon = document.getElementById("sidebarServerIcon");
  const sidebarName = document.getElementById("sidebarServerName");
  if (sidebarDisplay && sidebarIcon && sidebarName) {
    sidebarIcon.src = iconUrl;
    sidebarName.textContent = currentGuild.name;
    sidebarDisplay.style.display = "block";
  }

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
      )}'); event.preventDefault(); return false;">
            <img src="${gIcon}" width="20" height="20" class="rounded-circle me-2">
            ${guild.name}
          </a>
        </li>
      `;
    })
    .join("");

  document.getElementById("serverSwitcher").innerHTML = switcherHTML;
  document.getElementById("statsServerSwitcher").innerHTML = switcherHTML;
  document.getElementById("twitchServerSwitcher").innerHTML = switcherHTML;

  // Update server card active states
  updateServerCardStates();
}

// Update server card active states
function updateServerCardStates() {
  document.querySelectorAll(".server-card").forEach((card) => {
    card.classList.remove("active");
  });

  if (currentGuildId) {
    document.querySelectorAll(".server-card").forEach((card) => {
      const cardElement = card.querySelector(`[onclick*="${currentGuildId}"]`);
      if (
        cardElement ||
        card.getAttribute("onclick")?.includes(currentGuildId)
      ) {
        card.classList.add("active");
      }
    });
  }
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
  loadTwitchContent();
}

// Load guild translation config
async function loadGuildConfig() {
  const content = document.getElementById("translationContent");

  if (!currentGuildId) {
    content.innerHTML = `
      <div class="alert alert-warning">
        <i class="bi bi-info-circle"></i>
        <strong>No server selected.</strong> Please select a server from the 
        <a href="#" onclick="showPage('servers'); return false;" class="alert-link">Servers page</a> first.
      </div>
    `;
    return;
  }

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
            <h5><i class="bi bi-gear"></i> Display Settings</h5>
            <hr>
            
            <div class="mb-3">
              <label class="form-label fw-bold">
                <i class="bi bi-layout-text-window"></i> Display Mode
              </label>
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
              <small class="text-muted d-block mt-1">
                <i class="bi bi-info-circle"></i> How translations are displayed
              </small>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold">
                <i class="bi bi-hash"></i> Output Channel
              </label>
              <select class="form-select" id="outputChannel">
                <option value="">Same as source channel</option>
              </select>
              <small class="text-muted d-block mt-1">
                <i class="bi bi-info-circle"></i> Optional: Redirect all translations to a specific channel
              </small>
            </div>
          </div>

          <div class="stat-card">
            <h5><i class="bi bi-globe"></i> Target Languages</h5>
            <hr>
            
            <div class="mb-3">
              <label class="form-label fw-bold">Selected Languages</label>
              <div id="languagesList" class="mb-2"></div>
            </div>

            <div class="mb-0">
              <label class="form-label fw-bold">Add Language</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-plus-circle"></i></span>
                <input type="text" class="form-control" id="newLanguage" 
                  placeholder="e.g., es, fr, de" maxlength="5">
                <button class="btn btn-primary" onclick="addLanguage()">
                  <i class="bi bi-plus"></i> Add
                </button>
              </div>
              <small class="text-muted d-block mt-1">
                <i class="bi bi-info-circle"></i> Common: en, es, de, fr, it, ja, ko, zh-CN
              </small>
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="stat-card">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="mb-0"><i class="bi bi-hash"></i> Translation Channels</h5>
              <span class="badge bg-primary" id="channelsCount">0</span>
            </div>
            <hr>
            
            <div class="mb-3">
              <label class="form-label fw-bold">Enabled Channels</label>
              <div id="selectedChannels"></div>
            </div>

            <div class="mb-3">
              <label class="form-label fw-bold">
                <i class="bi bi-list-check"></i> Add from Available Channels
              </label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-hash"></i></span>
                <select class="form-select" id="channelPicker">
                  <option value="">Select a channel to add...</option>
                </select>
                <button class="btn btn-primary" onclick="addChannelFromDropdown()">
                  <i class="bi bi-plus"></i> Add
                </button>
              </div>
              <div id="channelPickerMessage"></div>
            </div>

            <div class="mb-0">
              <label class="form-label fw-bold">Add Channel by ID</label>
              <div class="input-group">
                <span class="input-group-text">#</span>
                <input type="text" class="form-control" id="newChannelId" 
                  placeholder="Paste channel ID">
                <button class="btn btn-primary" onclick="addChannel()">
                  <i class="bi bi-plus"></i> Add
                </button>
              </div>
              <small class="text-muted d-block mt-1">
                <i class="bi bi-info-circle"></i> Enable Developer Mode in Discord → Right-click channel → Copy Channel ID
              </small>
            </div>
          </div>
        </div>
      </div>

      <div class="row mt-3">
        <div class="col-12">
          <div class="stat-card">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h5 class="mb-1"><i class="bi bi-floppy"></i> Save Changes</h5>
                <small class="text-muted">Make sure to save your configuration before leaving</small>
              </div>
              <button class="btn btn-success btn-lg" onclick="saveConfig()">
                <i class="bi bi-check-circle"></i> Save Configuration
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    renderLanguageBadges();
    renderChannelPicker();
    renderOutputChannelDropdown();
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
  if (!currentGuildId) {
    const content = document.getElementById("statsContent");
    if (content) {
      content.innerHTML = `
        <div class="alert alert-warning">
          <i class="bi bi-info-circle"></i>
          <strong>No server selected.</strong> Please select a server from the 
          <a href="#" onclick="showPage('servers'); return false;" class="alert-link">Servers page</a> first.
        </div>
      `;
    }
    return;
  }

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
      '<div class="text-muted p-2 border rounded bg-light"><i class="bi bi-info-circle"></i> No languages selected</div>';
    return;
  }

  container.innerHTML = currentConfig.targetLanguages
    .map(
      (lang) => `
        <span class="language-badge">
          <i class="bi bi-translate"></i> ${lang.toUpperCase()}
          <i class="bi bi-x-circle remove" onclick="removeLanguage('${lang}')"></i>
        </span>
      `
    )
    .join("");
}

function renderChannelPicker() {
  const dropdown = document.getElementById("channelPicker");
  const messageContainer = document.getElementById("channelPickerMessage");
  if (!dropdown) return;

  // Clear and set default option
  dropdown.innerHTML = '<option value="">Select a channel to add...</option>';

  if (channelFetchError) {
    if (messageContainer) {
      messageContainer.innerHTML = `
        <div class="alert alert-warning mt-2 mb-0">
          <i class="bi bi-exclamation-triangle"></i> ${channelFetchError}
        </div>
      `;
    }
    return;
  }

  if (!availableChannels || availableChannels.length === 0) {
    if (messageContainer) {
      messageContainer.innerHTML =
        '<small class="text-muted d-block mt-1"><i class="bi bi-info-circle"></i> No channel list available. Use manual add below.</small>';
    }
    return;
  }

  if (messageContainer) {
    messageContainer.innerHTML = "";
  }

  // Filter out already-enabled channels and populate dropdown
  availableChannels
    .filter((channel) => !currentConfig.channels.includes(channel.id))
    .forEach((channel) => {
      const option = document.createElement("option");
      option.value = channel.id;
      option.textContent = `#${channel.name}`;
      dropdown.appendChild(option);
    });

  // Show message if all channels are already added
  if (dropdown.options.length === 1) {
    if (messageContainer) {
      messageContainer.innerHTML =
        '<small class="text-success d-block mt-1"><i class="bi bi-check-circle"></i> All available channels are already enabled!</small>';
    }
  }
}

function renderOutputChannelDropdown() {
  const dropdown = document.getElementById("outputChannel");
  if (!dropdown) return;

  // Clear existing options except the first one
  dropdown.innerHTML = '<option value="">Same as source channel</option>';

  if (!availableChannels || availableChannels.length === 0) {
    return;
  }

  // Add all available channels as options
  availableChannels.forEach((channel) => {
    const option = document.createElement("option");
    option.value = channel.id;
    option.textContent = `#${channel.name} (${channel.id})`;
    if (currentConfig.outputChannelId === channel.id) {
      option.selected = true;
    }
    dropdown.appendChild(option);
  });
}

function renderSelectedChannels() {
  const list = document.getElementById("selectedChannels");
  const count = document.getElementById("channelsCount");
  if (!list || !count || !currentConfig) return;

  const items = currentConfig.channels || [];
  count.textContent = items.length;

  if (items.length === 0) {
    list.innerHTML =
      '<div class="text-muted p-2 border rounded bg-light"><i class="bi bi-info-circle"></i> No channels enabled</div>';
    return;
  }

  list.innerHTML = items
    .map(
      (channelId) => `
        <div class="channel-toggle" data-channel-id="${channelId}">
          <div>
            <i class="bi bi-check-circle text-success me-1"></i>
            <strong>${channelDisplayName(channelId)}</strong>
          </div>
          <button class="btn btn-sm btn-outline-danger" onclick="removeChannel('${channelId}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `
    )
    .join("");
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
  renderChannelPicker(); // Refresh dropdown in case it was from there
}

// Add channel from dropdown
async function addChannelFromDropdown() {
  const dropdown = document.getElementById("channelPicker");
  const channelId = dropdown.value;

  if (!channelId) {
    alert("Please select a channel from the dropdown");
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
  renderSelectedChannels();
  renderChannelPicker(); // Refresh dropdown to remove the added channel
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
  renderChannelPicker(); // Refresh dropdown to show the removed channel
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
    document.getElementById("outputChannel").value || null;

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

  // Pages that require server selection
  const serverRequiredPages = ["translation", "stats", "twitch"];

  if (serverRequiredPages.includes(pageName)) {
    if (!currentGuildId) {
      // Show message to select a server
      const pageContent = document.getElementById(`${pageName}Content`);
      if (pageContent) {
        pageContent.innerHTML = `
          <div class="alert alert-warning">
            <i class="bi bi-info-circle"></i>
            <strong>No server selected.</strong> Please select a server from the 
            <a href="#" onclick="showPage('servers'); return false;" class="alert-link">Servers page</a> first.
          </div>
        `;
      }
      return;
    }

    // Load content for server-dependent pages
    if (pageName === "translation") {
      loadGuildConfig();
    } else if (pageName === "stats") {
      loadGuildStats();
    } else if (pageName === "twitch") {
      loadTwitchContent();
    }
  }

  // Maintain server card active state when returning to servers page
  if (pageName === "servers" && currentGuildId) {
    updateServerCardStates();
  }

  // Load invite link when invite page is shown
  if (pageName === "invite") {
    loadInviteLink();
  }

  // Load badge and commands management when those pages are shown
  if (pageName === "badge") {
    loadBadgeStatus();
  }
  if (pageName === "commands") {
    reloadCommands();
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

// Load Twitch content for selected guild
async function loadTwitchContent() {
  if (!currentGuildId) {
    document.getElementById("twitchContent").innerHTML =
      '<p class="text-muted">Select a server first</p>';
    return;
  }

  const content = document.getElementById("twitchContent");
  content.innerHTML = `
    <div class="row">
      <div class="col-12">
        <div class="stat-card">
          <h5><i class="bi bi-broadcast"></i> Twitch Integration</h5>
          <hr>
          <p class="text-muted">
            <i class="bi bi-info-circle"></i> 
            Twitch notifications are configured using Discord slash commands.
          </p>
          
          <div class="alert alert-info">
            <h6 class="alert-heading"><i class="bi bi-terminal"></i> How to Configure Twitch Alerts</h6>
            <p class="mb-2">Use the following commands in your Discord server:</p>
            <ul class="mb-2">
              <li><code>/twitch-notify add &lt;streamer&gt; [channel]</code> - Monitor a Twitch streamer</li>
              <li><code>/twitch-notify remove &lt;streamer&gt;</code> - Stop monitoring a streamer</li>
              <li><code>/twitch-notify list</code> - View all monitored streamers</li>
              <li><code>/twitch-notify channel &lt;channel&gt;</code> - Set notification channel</li>
            </ul>
            <p class="mb-0">
              <strong>Note:</strong> You need to run these commands in Discord. 
              The bot will check for live streams every 5 minutes and send notifications automatically.
            </p>
          </div>

          <div class="card bg-light border-0 mt-3">
            <div class="card-body">
              <h6><i class="bi bi-gear"></i> Requirements</h6>
              <ul class="mb-0">
                <li>Bot must have <strong>Manage Server</strong> or <strong>Administrator</strong> permissions</li>
                <li>Twitch API credentials must be configured on the bot</li>
                <li>Notifications require a text channel where the bot can send messages</li>
              </ul>
            </div>
          </div>

          <div class="card bg-light border-0 mt-3">
            <div class="card-body">
              <h6><i class="bi bi-lightning-charge"></i> Features</h6>
              <ul class="mb-0">
                <li>Real-time notifications when streamers go live</li>
                <li>Automatic stream status checking every 5 minutes</li>
                <li>Rich embed with stream title, game, and viewer count</li>
                <li>Direct link to stream in notification</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
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
          // Check if page requires server selection
          const serverRequiredPages = ["translation", "stats", "twitch"];
          if (serverRequiredPages.includes(page) && !currentGuildId) {
            // Show alert and redirect to servers page
            alert("Please select a server first from the Servers page.");
            showPage("servers");
            return;
          }
          showPage(page);
        }
      }
    });
  });
});

// ===== Badge Management =====
async function loadBadgeStatus() {
  try {
    const r = await fetch("/api/badge/status");
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed to load badge status");

    const enabled = !!data.autoExecutionEnabled;
    const pill = document.getElementById("badgeEnabledPill");
    const toggle = document.getElementById("badgeEnabled");
    const interval = document.getElementById("badgeInterval");
    const next = document.getElementById("nextExecution");

    if (toggle) toggle.checked = enabled;
    if (pill) {
      pill.textContent = enabled ? "ENABLED" : "DISABLED";
      pill.className = `badge ${enabled ? "bg-success" : "bg-secondary"} me-2`;
    }
    if (interval && typeof data.intervalDays === "number")
      interval.value = data.intervalDays;
    if (next && data.nextExecutionHuman)
      next.textContent = data.nextExecutionHuman;
  } catch (e) {
    console.error(e);
  }
}

async function saveBadgeSettings() {
  try {
    const toggle = document.getElementById("badgeEnabled");
    const interval = document.getElementById("badgeInterval");
    const payload = {
      autoExecutionEnabled: !!(toggle && toggle.checked),
      intervalDays: Math.max(
        1,
        Math.min(60, parseInt(interval?.value || "30", 10))
      ),
    };
    const r = await fetch("/api/badge/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed to save");
    loadBadgeStatus();
  } catch (e) {
    alert("Failed to save badge settings: " + e.message);
  }
}

// ===== Commands Management =====
async function reloadCommands() {
  try {
    const list = document.getElementById("commandsList");
    if (list)
      list.innerHTML = '<div class="text-muted">Loading commands...</div>';
    const r = await fetch("/api/commands");
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed to fetch commands");
    renderCommandsList(data.commands || []);
  } catch (e) {
    const list = document.getElementById("commandsList");
    if (list)
      list.innerHTML = `<div class="alert alert-danger"><i class="bi bi-exclamation-triangle"></i> ${e.message}</div>`;
  }
}

function renderCommandsList(commands) {
  const container = document.getElementById("commandsList");
  if (!container) return;
  if (!commands.length) {
    container.innerHTML = '<div class="text-muted">No commands found.</div>';
    return;
  }
  container.innerHTML = commands
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => {
      const badge =
        c.scope === "guild"
          ? '<span class="badge bg-secondary ms-2">Guild</span>'
          : '<span class="badge bg-primary ms-2">Global</span>';
      const toggleId = `disable_${c.scope}_${c.id}`;
      return `
        <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2">
          <div>
            <strong>/${c.name}</strong> <small class="text-muted">${
        c.description || ""
      }</small> ${badge}
            ${
              c.disabled
                ? '<span class="badge bg-warning text-dark ms-2">Runtime disabled</span>'
                : ""
            }
          </div>
          <div class="d-flex align-items-center">
            <div class="form-check form-switch me-3">
              <input class="form-check-input" type="checkbox" id="${toggleId}" ${
        c.disabled ? "" : "checked"
      } onchange="toggleCommandRuntime('${c.name}', this.checked)">
              <label class="form-check-label" for="${toggleId}">Runtime</label>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteCommand('${
              c.id
            }', '${c.scope}')"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function toggleCommandRuntime(name, enabled) {
  try {
    const r = await fetch("/api/commands/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, disabled: !enabled }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed to update");
    reloadCommands();
  } catch (e) {
    alert("Failed to update command: " + e.message);
  }
}

async function deleteCommand(id, scope) {
  if (
    !confirm(
      "Delete this registered command? This hides it from users until re-registered."
    )
  )
    return;
  try {
    const r = await fetch("/api/commands/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandId: id, scope }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Delete failed");
    reloadCommands();
  } catch (e) {
    alert("Failed to delete command: " + e.message);
  }
}

async function reRegisterAll() {
  if (!confirm("Re-register all commands from source now?")) return;
  try {
    const r = await fetch("/api/commands/register-all", { method: "POST" });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed to re-register");
    reloadCommands();
  } catch (e) {
    alert("Failed to re-register: " + e.message);
  }
}
