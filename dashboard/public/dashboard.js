let currentGuildId = null;
let currentGuildName = null;
let guilds = [];
let currentConfig = null;
let availableChannels = [];
let channelFetchError = null;
let userMenuOpen = false;
let sidebarOpen = false;
let sidebarServerMenuOpen = false;

// Toast helper
function showToast(message, type = "info", timeout = 3500) {
  const containerId = "toastContainer";
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    container.style.position = "fixed";
    container.style.top = "16px";
    container.style.right = "16px";
    container.style.zIndex = "9999";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "8px";
    document.body.appendChild(container);
  }

  const el = document.createElement("div");
  const colors = {
    success: "#43b581",
    danger: "#e74c3c",
    info: "#3498db",
    warning: "#faa61a",
  };
  const color = colors[type] || colors.info;
  el.style.background = "rgba(21, 32, 43, 0.95)";
  el.style.color = "white";
  el.style.padding = "10px 14px";
  el.style.borderRadius = "10px";
  el.style.border = `1px solid ${color}`;
  el.style.boxShadow = "0 8px 18px rgba(0,0,0,0.25)";
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.3s";
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

// Utility: fetch with timeout and JSON parsing
async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(data?.error || res.statusText || "Request failed");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(id);
  }
}

// Check if user is authenticated
async function checkAuth() {
  try {
    const response = await fetch("/api/user");
    if (!response.ok) {
      window.location.href = "/";
      return false;
    }
    const user = await response.json();

    // Update username with full Discord tag
    const userInfoEl = document.getElementById("userInfo");
    if (userInfoEl) {
      userInfoEl.textContent =
        user.discriminator === "0"
          ? `@${user.username}`
          : `${user.username}#${user.discriminator}`;
    }

    // Update avatar
    const avatarEl = document.getElementById("userAvatar");
    if (avatarEl && user.avatar) {
      avatarEl.src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
    }

    return true;
  } catch (error) {
    console.error("Auth error:", error);
    alert("Failed to authenticate. Please try logging in again.");
    window.location.href = "/";
    return false;
  }
}

// Handle sidebar server dropdown change
function handleSidebarServerChange(guildId) {
  if (!guildId) return;
  const guild = guilds.find((g) => g.id === guildId);
  if (guild) {
    selectGuild(guild.id, guild.name);
  }
  // Hide dropdown after selection
  const selector = document.getElementById("sidebarServerSelector");
  if (selector) {
    selector.style.display = "none";
  }
  if (window.innerWidth <= 768) {
    closeSidebar();
  }
}

// Toggle user dropdown
function toggleUserMenu(event) {
  event?.stopPropagation();
  const menu = document.getElementById("userMenu");
  if (!menu) return;
  userMenuOpen = !userMenuOpen;
  menu.style.display = userMenuOpen ? "block" : "none";
}

// Close user dropdown
function closeUserMenu() {
  const menu = document.getElementById("userMenu");
  if (!menu) return;
  userMenuOpen = false;
  menu.style.display = "none";
}

// Close user dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!userMenuOpen) return;
  const card = document.getElementById("userProfileCard");
  const menu = document.getElementById("userMenu");
  if (card && card.contains(e.target)) return;
  if (menu && menu.contains(e.target)) return;
  closeUserMenu();
});

// Close sidebar server menu when clicking outside
document.addEventListener("click", (e) => {
  if (!sidebarServerMenuOpen) return;
  const menu = document.getElementById("sidebarServerMenu");
  const card = document.getElementById("currentServerDisplay");
  if (menu && menu.contains(e.target)) return;
  if (card && card.contains(e.target)) return;
  closeSidebarSelectorMenu();
});

// Invite bot flow with post-invite polling
async function inviteBot(guildId) {
  try {
    const res = await fetch(
      guildId ? `/api/invite?guildId=${guildId}` : `/api/invite`
    );
    const data = await res.json();
    if (!res.ok || !data.inviteUrl) {
      throw new Error(data.error || "Failed to generate invite link");
    }
    window.open(data.inviteUrl, "_blank");
    showToast("Invite opened in new tab. Waiting for bot to join…", "info");
    pollBotJoin(guildId, 6, 2500);
  } catch (e) {
    showToast(e.message, "danger");
  }
}

async function pollBotJoin(guildId, attempts = 6, delayMs = 2500) {
  for (let i = 0; i < attempts; i++) {
    try {
      const data = await fetchJSON("/api/guilds");
      const list = Array.isArray(data) ? data : data.guilds || [];
      guilds = list;
      const match = list.find((g) => g.id === guildId);
      if (match && match.botJoined) {
        showToast(`Bot joined ${match.name}`, "success");
        updateServerHeaders();
        populateSidebarServerSelector();
        loadGuilds();
        return;
      }
    } catch (e) {
      console.warn("Poll bot join failed", e);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  showToast("Bot not detected yet. You can retry refresh.", "warning");
}

// Sidebar toggle for mobile
function toggleSidebar(forceState) {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (!sidebar || !overlay) return;
  const nextState = typeof forceState === "boolean" ? forceState : !sidebarOpen;
  sidebarOpen = nextState;

  if (nextState) {
    sidebar.classList.add("sidebar-open");
    overlay.style.display = "block";
    document.body.classList.add("no-scroll");
  } else {
    sidebar.classList.remove("sidebar-open");
    overlay.style.display = "none";
    document.body.classList.remove("no-scroll");
  }
}

function closeSidebar() {
  toggleSidebar(false);
}

window.addEventListener("resize", () => {
  if (window.innerWidth > 992 && sidebarOpen) {
    closeSidebar();
  }
});

// Populate sidebar server selector
function populateSidebarServerSelector() {
  const selector = document.getElementById("sidebarServerSelector");
  const menu = document.getElementById("sidebarServerMenu");
  if (!selector || !guilds.length) return;

  selector.innerHTML =
    '<option value="" style="background: #2c3e50; color: white;">Choose a server...</option>' +
    guilds
      .map((guild) => {
        const selected = guild.id === currentGuildId ? "selected" : "";
        return `<option value="${guild.id}" ${selected} style="background: #2c3e50; color: white;">${guild.name}</option>`;
      })
      .join("");

  // Show dropdown when card is clicked
  selector.size = Math.min(guilds.length + 1, 8);
  selector.onblur = function () {
    this.style.display = "none";
    this.size = 1;
  };

  // Build custom menu with icons and status
  if (menu) {
    const items = guilds
      .map((g) => {
        const iconUrl = g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
          : "https://cdn.discordapp.com/embed/avatars/0.png";
        const active = g.id === currentGuildId ? "active" : "";
        const statusClass = g.botJoined
          ? "status-pill active"
          : "status-pill inactive";
        const statusText = g.botJoined
          ? '<i class="bi bi-check-circle-fill"></i> Active'
          : '<i class="bi bi-slash-circle"></i> Not Joined';
        return `
          <div class="sidebar-server-item ${active}" onclick="selectSidebarGuild('${g.id}')">
            <img src="${iconUrl}" alt="${g.name}" width="36" height="36" class="rounded-circle" style="flex-shrink: 0;" />
            <div style="flex:1; min-width:0; overflow: hidden;">
              <div class="item-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${g.name}</div>
              <div class="item-id"># ${g.id}</div>
            </div>
            <span class="${statusClass}" style="flex-shrink: 0;">${statusText}</span>
          </div>`;
      })
      .join("");
    menu.innerHTML = items;
  }
}

// Open the hidden dropdown from the sidebar card
function openSidebarSelector() {
  const selector = document.getElementById("sidebarServerSelector");
  const menu = document.getElementById("sidebarServerMenu");
  if (!selector || !guilds.length || !menu) return;
  const nextState = !sidebarServerMenuOpen;
  menu.style.display = nextState ? "block" : "none";
  sidebarServerMenuOpen = nextState;
  if (nextState) {
    menu.scrollTop = 0;
  }
}

function closeSidebarSelectorMenu() {
  const menu = document.getElementById("sidebarServerMenu");
  if (menu) {
    menu.style.display = "none";
  }
  sidebarServerMenuOpen = false;
}

function selectSidebarGuild(guildId) {
  if (!guildId) return;
  const guild = guilds.find((g) => g.id === guildId);
  if (guild) {
    selectGuild(guild.id, guild.name);
  }
  closeSidebarSelectorMenu();
  if (window.innerWidth <= 768) {
    closeSidebar();
  }
}

// (removed stray commands rendering fragment)
async function loadGuilds() {
  const container = document.getElementById("serversList");
  if (container) {
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-secondary" role="status"></div>
        <p class="mt-3 text-muted">Loading servers…</p>
      </div>`;
  }
  try {
    const data = await fetchJSON("/api/guilds");
    guilds = Array.isArray(data) ? data : data.guilds || [];

    if (!guilds || guilds.length === 0) {
      if (container) {
        container.innerHTML = `
          <div class="text-center py-5">
            <i class="bi bi-inbox" style="font-size: 3rem; color: #ccc;"></i>
            <p class="mt-3 text-muted">No servers found where you have "Manage Server" permission</p>
          </div>`;
      }
      return;
    }

    const html = guilds
      .map((guild) => {
        const iconUrl = guild.icon
          ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
          : "https://cdn.discordapp.com/embed/avatars/0.png";

        const botJoined = guild.botJoined === true;

        const statusBadge = botJoined
          ? '<span class="badge" style="background: rgba(67, 181, 129, 0.15); color: #43b581; font-size: 0.75rem; padding: 4px 8px;"><i class="bi bi-circle-fill" style="font-size: 0.5rem;"></i> Active</span>'
          : '<span class="badge" style="background: rgba(250, 166, 26, 0.15); color: #faa61a; font-size: 0.75rem; padding: 4px 8px;"><i class="bi bi-circle-fill" style="font-size: 0.5rem;"></i> Not Joined</span>';

        const quickActions = botJoined
          ? `<button class="btn btn-sm btn-outline-secondary" onclick="event.stopPropagation(); refreshBotStatus('${
              guild.id
            }')" title="Refresh status" style="padding: 4px 12px;">
              <i class="bi bi-arrow-clockwise"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); leaveGuild('${
              guild.id
            }', '${guild.name.replace(
              /'/g,
              "\\'"
            )}')" title="Leave server" style="padding: 4px 12px;">
              <i class="bi bi-box-arrow-right"></i>
            </button>`
          : `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); inviteBot('${guild.id}')" title="Invite bot" style="padding: 4px 12px;">
              <i class="bi bi-plus-circle"></i> Invite
            </button>`;

        return `
        <div class="server-item" onclick="selectGuild('${
          guild.id
        }', '${guild.name.replace(/'/g, "\\'")}')">
          <div class="d-flex align-items-center flex-grow-1">
            <img src="${iconUrl}" alt="${guild.name}" class="server-icon">
            <div class="server-info">
              <div class="d-flex align-items-center gap-2 mb-1">
                <span class="server-name">${guild.name}</span>
                ${statusBadge}
              </div>
              <small class="server-id"><i class="bi bi-hash"></i> ${
                guild.id
              }</small>
            </div>
          </div>
          <div class="server-actions" onclick="event.stopPropagation()">
            ${quickActions}
            <button class="btn btn-sm btn-primary" onclick="selectGuild('${
              guild.id
            }', '${guild.name.replace(
          /'/g,
          "\\'"
        )}'); event.stopPropagation();" style="padding: 4px 12px;">
              <i class="bi bi-gear-fill"></i> Manage
            </button>
          </div>
        </div>
      `;
      })
      .join("");
    if (container) container.innerHTML = html;

    // Populate sidebar server selector
    populateSidebarServerSelector();
  } catch (error) {
    if (container) {
      container.innerHTML = `
        <div class="text-center py-5">
          <i class="bi bi-exclamation-triangle" style="font-size: 3rem; color: #dc3545;"></i>
          <h5 class="mt-3 text-danger">Failed to load servers</h5>
          <p class="text-muted">${error.message}</p>
          <button class="btn btn-primary mt-3" onclick="loadGuilds()">
            <i class="bi bi-arrow-clockwise"></i> Retry
          </button>
        </div>`;
    }
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

  // Update sidebar selector
  const selector = document.getElementById("sidebarServerSelector");
  if (selector) {
    selector.value = guildId;
  }

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

  // Update Tracking page header
  const trackingIcon = document.getElementById("trackingServerIcon");
  const trackingName = document.getElementById("trackingServerName");
  const trackingHeader = document.getElementById("trackingServerHeader");
  if (trackingIcon && trackingName && trackingHeader) {
    trackingIcon.src = iconUrl;
    trackingName.textContent = currentGuild.name;
    trackingHeader.style.display = "block";
  }

  // Update sidebar current server display
  const sidebarDisplay = document.getElementById("currentServerDisplay");
  const sidebarIcon = document.getElementById("sidebarServerIcon");
  const sidebarName = document.getElementById("sidebarServerName");
  const sidebarStatus = document.getElementById("sidebarServerStatus");
  if (sidebarDisplay && sidebarIcon && sidebarName) {
    sidebarIcon.src = iconUrl;
    sidebarName.textContent = currentGuild.name;
    if (sidebarStatus) {
      sidebarStatus.style.display = "block";
      sidebarStatus.classList.toggle("active", currentGuild.botJoined);
      sidebarStatus.classList.toggle("inactive", !currentGuild.botJoined);
      sidebarStatus.innerHTML = currentGuild.botJoined
        ? '<i class="bi bi-check-circle-fill"></i> Active'
        : '<i class="bi bi-slash-circle"></i> Not Joined';
    }
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
  document.getElementById("trackingServerSwitcher").innerHTML = switcherHTML;

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
    const [statsRes, channelsRes] = await Promise.all([
      fetch(`/api/guild/${currentGuildId}/stats`),
      fetch(`/api/guild/${currentGuildId}/channels`),
    ]);
    const stats = await statsRes.json();

    // Update availableChannels so we can resolve channel names in the stats view
    if (channelsRes && channelsRes.ok) {
      try {
        const chans = await channelsRes.json();
        availableChannels = Array.isArray(chans.channels) ? chans.channels : [];
      } catch (_) {
        // ignore parse errors
      }
    }

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
                                .map(([pair, count]) => {
                                  const [from, to] = pair
                                    .split("->")
                                    .map((c) => c.trim());
                                  const fromDisplay = languageDisplay(from);
                                  const toDisplay = languageDisplay(to);
                                  return `
                            <div class="d-flex justify-content-between mb-2">
                                <span><strong>${fromDisplay} → ${toDisplay}</strong></span>
                                <span class="badge bg-primary">${count} translations</span>
                            </div>
                        `;
                                })
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
                                .map(([channelId, count]) => {
                                  const name = channelDisplayName(channelId);
                                  return `
                                      <div class="d-flex justify-content-between mb-2">
                                        <span><i class="bi bi-hash"></i> ${name} <small class="text-muted">(${channelId})</small></span>
                                        <span class="badge bg-success">${count} translations</span>
                                      </div>
                                    `;
                                })
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

// Language display with flag + name + code
const LANG_MAP = {
  en: { name: "English", flagCode: "gb" },
  fr: { name: "French", flagCode: "fr" },
  de: { name: "German", flagCode: "de" },
  es: { name: "Spanish", flagCode: "es" },
  it: { name: "Italian", flagCode: "it" },
  ja: { name: "Japanese", flagCode: "jp" },
  ko: { name: "Korean", flagCode: "kr" },
  zh: { name: "Chinese", flagCode: "cn" },
  "zh-cn": { name: "Chinese (Simplified)", flagCode: "cn" },
  "zh-tw": { name: "Chinese (Traditional)", flagCode: "tw" },
  ar: { name: "Arabic", flagCode: "sa" },
  hr: { name: "Croatian", flagCode: "hr" },
  no: { name: "Norwegian", flagCode: "no" },
  fa: { name: "Persian", flagCode: "ir" },
  ur: { name: "Urdu", flagCode: "pk" },
  ru: { name: "Russian", flagCode: "ru" },
  pt: { name: "Portuguese", flagCode: "pt" },
  nl: { name: "Dutch", flagCode: "nl" },
  sv: { name: "Swedish", flagCode: "se" },
  pl: { name: "Polish", flagCode: "pl" },
};

function languageDisplay(code, includeCode = false) {
  if (!code) return '<i class="bi bi-globe2"></i> Unknown';
  const norm = String(code).toLowerCase();
  const info = LANG_MAP[norm] || LANG_MAP[norm.split("-")[0]];
  if (!info) return `<i class="bi bi-globe2"></i> ${code}`;
  const display = includeCode
    ? `<span class="fi fi-${info.flagCode}" style="margin-right: 4px;"></span>${info.name} (${code})`
    : `<span class="fi fi-${info.flagCode}" style="margin-right: 4px;"></span>${info.name}`;
  return display;
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
  const serverRequiredPages = ["translation", "stats", "twitch", "tracking"];

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
    } else if (pageName === "tracking") {
      loadTrackingContent();
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
    <div class="d-flex justify-content-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
  `;

  try {
    const [cfgRes, chanRes] = await Promise.all([
      fetch(`/api/guild/${currentGuildId}/twitch-config`),
      fetch(`/api/guild/${currentGuildId}/channels`),
    ]);

    const cfg = await cfgRes.json();
    let chans = { channels: [] };
    if (chanRes.ok) {
      chans = await chanRes.json();
    }

    const channels = Array.isArray(chans.channels) ? chans.channels : [];
    const streamers = Array.isArray(cfg.streamers) ? cfg.streamers : [];
    const selected = cfg.channelId || "";
    const allowDuplicates = cfg.allowDuplicates === true;

    const channelOptions = [
      `<option value="">Select a channel...</option>`,
      ...channels.map(
        (c) =>
          `<option value="${c.id}" ${selected === c.id ? "selected" : ""}>#${
            c.name
          }</option>`
      ),
    ].join("");

    content.innerHTML = `
      <div class="row">
        <div class="col-md-6">
          <div class="stat-card">
            <h5><i class="bi bi-broadcast"></i> Twitch Notification Channel</h5>
            <hr>
            <div class="mb-3">
              <label class="form-label fw-bold"><i class="bi bi-hash"></i> Channel</label>
              <select id="twitchChannel" class="form-select">${channelOptions}</select>
              <small class="text-muted d-block mt-1"><i class="bi bi-info-circle"></i> The channel where live notifications will be posted</small>
            </div>
            <div class="mb-2 d-flex align-items-center justify-content-between">
              <div>
                <label class="form-label fw-bold mb-0">Duplicate Notifications</label>
                <small class="text-muted d-block">Allow multiple alerts per streamer per day</small>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="allowDuplicates" ${
                  allowDuplicates ? "checked" : ""
                }>
              </div>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-outline-secondary" onclick="reloadTwitchConfigNow()"><i class="bi bi-arrow-clockwise"></i> Reload Config</button>
              <button class="btn btn-outline-primary" onclick="checkTwitchNow()"><i class="bi bi-lightning-charge"></i> Check Now</button>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="stat-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h5 class="mb-0"><i class="bi bi-people"></i> Monitored Streamers</h5>
              <span class="badge bg-primary" id="twitchStreamersCount">${
                streamers.length
              }</span>
            </div>
            <hr>
            <div id="twitchStreamersList"></div>
            <div class="mt-3">
              <label class="form-label fw-bold">Add Streamer</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-person-plus"></i></span>
                <input type="text" class="form-control" id="newStreamer" placeholder="twitch_username" />
                <button class="btn btn-primary" onclick="addStreamer()"><i class="bi bi-plus"></i> Add</button>
              </div>
              <small class="text-muted d-block mt-1"><i class="bi bi-info-circle"></i> Usernames are case-insensitive (letters, numbers, underscores)</small>
            </div>
          </div>
        </div>
      </div>

      <div class="row mt-3">
        <div class="col-12">
          <div class="stat-card d-flex justify-content-between align-items-center">
            <div>
              <h5 class="mb-1"><i class="bi bi-floppy"></i> Save Changes</h5>
              <small class="text-muted">Save your Twitch settings for this server</small>
            </div>
            <button class="btn btn-success btn-lg" onclick="saveTwitchConfig()"><i class="bi bi-check-circle"></i> Save</button>
          </div>
        </div>
      </div>
    `;

    // Keep state locally
    window._twitchStreamers = streamers.slice();
    renderStreamerList();
  } catch (error) {
    console.error("Error loading guilds:", error);
  }
}

// Load Tracking content for selected guild
async function loadTrackingContent() {
  if (!currentGuildId) {
    document.getElementById("trackingContent").innerHTML =
      '<p class="text-muted">Select a server first</p>';
    return;
  }

  const content = document.getElementById("trackingContent");
  content.innerHTML = `
    <div class="d-flex justify-content-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
  `;

  try {
    const [cfgRes, chanRes] = await Promise.all([
      fetch(`/api/guild/${currentGuildId}/tracking-config`),
      fetch(`/api/guild/${currentGuildId}/channels`),
    ]);

    const cfg = await cfgRes.json();
    let chans = { channels: [] };
    if (chanRes.ok) {
      chans = await chanRes.json();
    }

    const channels = Array.isArray(chans.channels) ? chans.channels : [];
    const selected = cfg.channelId || "";
    const enabled = !!cfg.enabled;
    const ignored = Array.isArray(cfg.ignoredChannels)
      ? cfg.ignoredChannels
      : [];
    const events =
      typeof cfg.events === "object" && cfg.events !== null ? cfg.events : {};

    const channelOptions = [
      `<option value="">Select a channel...</option>`,
      ...channels.map(
        (c) =>
          `<option value="${c.id}" ${selected === c.id ? "selected" : ""}>#${
            c.name
          }</option>`
      ),
    ].join("");

    const eventDefs = [
      ["messages", "Messages"],
      ["members", "Members"],
      ["voice", "Voice"],
      ["reactions", "Reactions"],
      ["channels", "Channels"],
      ["userUpdates", "User Updates"],
      ["channelUpdates", "Channel Updates"],
      ["roles", "Roles"],
      ["guild", "Guild"],
      ["threads", "Threads"],
      ["scheduledEvents", "Scheduled Events"],
      ["stickers", "Stickers"],
      ["webhooks", "Webhooks"],
      ["integrations", "Integrations"],
      ["invites", "Invites"],
      ["stageInstances", "Stage Instances"],
      ["moderationRules", "Moderation Rules"],
      ["interactions", "Interactions"],
    ];

    function renderEventToggles() {
      const grid = document.getElementById("trackingEventGrid");
      if (!grid) return;
      grid.innerHTML = eventDefs
        .map(([key, label]) => {
          const checked = events[key] !== false; // default true
          const id = `evt_${key}`;
          return `
            <div class="form-check form-switch col-md-4 mb-2">
              <input class="form-check-input" type="checkbox" id="${id}" ${
            checked ? "checked" : ""
          } onchange="toggleTrackingEvent('${key}', this.checked)">
              <label class="form-check-label" for="${id}">${label}</label>
            </div>`;
        })
        .join("");
    }

    window._trackingState = {
      enabled,
      selected,
      ignored: [...ignored],
      events: { ...events },
    };

    content.innerHTML = `
      <div class="row">
        <div class="col-md-6">
          <div class="stat-card">
            <h5><i class="bi bi-gear"></i> Tracking Settings</h5>
            <hr>
            <div class="mb-3 d-flex align-items-center justify-content-between">
              <div>
                <label class="form-label fw-bold">Enabled</label>
                <small class="text-muted d-block">Toggle tracking for this server</small>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="trackingEnabled" ${
                  enabled ? "checked" : ""
                }>
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label fw-bold"><i class="bi bi-hash"></i> Log Channel</label>
              <select id="trackingChannel" class="form-select">${channelOptions}</select>
              <small class="text-muted d-block mt-1"><i class="bi bi-info-circle"></i> Channel where tracking logs are posted</small>
            </div>
          </div>

          <div class="stat-card">
            <h5><i class="bi bi-list-check"></i> Events to Track</h5>
            <hr>
            <div id="trackingEventGrid" class="row"></div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="stat-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h5 class="mb-0"><i class="bi bi-hash"></i> Ignored Channels</h5>
            </div>
            <hr>
            <div id="ignoredChannelsList"></div>
            <div class="mt-3">
              <label class="form-label fw-bold">Add Channel</label>
              <div class="input-group">
                <span class="input-group-text"><i class="bi bi-hash"></i></span>
                <select class="form-select" id="ignoredChannelPicker">
                  <option value="">Select a channel...</option>
                  ${channels
                    .map((c) => `<option value="${c.id}">#${c.name}</option>`)
                    .join("")}
                </select>
                <button class="btn btn-primary" onclick="addIgnoredChannelFromDropdown()"><i class="bi bi-plus"></i> Add</button>
              </div>
              <small class="text-muted d-block mt-1"><i class="bi bi-info-circle"></i> Messages from these channels will not be logged</small>
            </div>
          </div>

          <div class="stat-card d-flex justify-content-between align-items-center">
            <div>
              <h5 class="mb-1"><i class="bi bi-floppy"></i> Save Changes</h5>
              <small class="text-muted">Save tracking configuration</small>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-outline-secondary" onclick="reloadTrackingConfigNow()"><i class="bi bi-arrow-clockwise"></i> Reload Config</button>
              <button class="btn btn-success btn-lg" onclick="saveTrackingConfig()"><i class="bi bi-check-circle"></i> Save</button>
            </div>
          </div>
        </div>
      </div>
    `;

    renderEventToggles();
    renderIgnoredChannels();
  } catch (error) {
    console.error("Error loading tracking:", error);
    content.innerHTML = `<div class="alert alert-danger">Failed to load Tracking settings: ${error.message}</div>`;
  }
}

function renderIgnoredChannels() {
  const list = document.getElementById("ignoredChannelsList");
  if (!list) return;
  const items = Array.isArray(window._trackingState?.ignored)
    ? window._trackingState.ignored
    : [];
  if (items.length === 0) {
    list.innerHTML =
      '<div class="text-muted p-2 border rounded bg-light"><i class="bi bi-info-circle"></i> No ignored channels</div>';
    return;
  }
  list.innerHTML = items
    .map((id) => {
      const name = channelDisplayName(id);
      return `
      <div class="channel-toggle" data-channel-id="${id}">
        <div><i class="bi bi-slash-circle text-muted me-1"></i> <strong>${name}</strong> <small class="text-muted">(${id})</small></div>
        <button class="btn btn-sm btn-outline-danger" onclick="removeIgnoredChannel('${id}')"><i class="bi bi-trash"></i></button>
      </div>`;
    })
    .join("");
}

function addIgnoredChannelFromDropdown() {
  const dd = document.getElementById("ignoredChannelPicker");
  const channelId = dd?.value;
  if (!channelId) return alert("Please select a channel");
  const cur = Array.isArray(window._trackingState?.ignored)
    ? window._trackingState.ignored
    : [];
  if (!cur.includes(channelId)) {
    window._trackingState.ignored = [...cur, channelId];
    renderIgnoredChannels();
  }
}

function removeIgnoredChannel(channelId) {
  const cur = Array.isArray(window._trackingState?.ignored)
    ? window._trackingState.ignored
    : [];
  window._trackingState.ignored = cur.filter((c) => c !== channelId);
  renderIgnoredChannels();
}

function toggleTrackingEvent(key, enabled) {
  if (!window._trackingState) return;
  window._trackingState.events = window._trackingState.events || {};
  window._trackingState.events[key] = !!enabled;
}

async function saveTrackingConfig() {
  try {
    const enabled = !!document.getElementById("trackingEnabled")?.checked;
    const channelId = document.getElementById("trackingChannel")?.value || null;
    const ignoredChannels = Array.isArray(window._trackingState?.ignored)
      ? window._trackingState.ignored
      : [];
    const events =
      typeof window._trackingState?.events === "object"
        ? window._trackingState.events
        : {};
    const r = await fetch(`/api/guild/${currentGuildId}/tracking-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, channelId, ignoredChannels, events }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed to save tracking config");
    const success = document.createElement("div");
    success.className = "alert alert-success mt-3";
    success.innerHTML = `<i class="bi bi-check-circle"></i> ${
      data.message || "Saved."
    }`;
    document.getElementById("trackingContent").prepend(success);
    setTimeout(() => success.remove(), 4000);
  } catch (e) {
    alert(e.message);
  }
}

async function reloadTrackingConfigNow() {
  try {
    const r = await fetch(`/api/tracking/reload`, { method: "POST" });
    if (!r.ok) throw new Error((await r.json()).error || "Failed to reload");
    const a = document.createElement("div");
    a.className = "alert alert-success mt-3";
    a.innerHTML =
      '<i class="bi bi-check-circle"></i> Reloaded Tracking configuration.';
    document.getElementById("trackingContent").prepend(a);
    setTimeout(() => a.remove(), 3000);
  } catch (e) {
    alert(e.message);
  }
}

function renderStreamerList() {
  const list = document.getElementById("twitchStreamersList");
  const badge = document.getElementById("twitchStreamersCount");
  const streamers = Array.isArray(window._twitchStreamers)
    ? window._twitchStreamers
    : [];
  if (badge) badge.textContent = streamers.length;
  if (!list) return;
  if (streamers.length === 0) {
    list.innerHTML =
      '<div class="text-muted p-2 border rounded bg-light"><i class="bi bi-info-circle"></i> No streamers monitored</div>';
    return;
  }
  list.innerHTML = streamers
    .map(
      (s) => `
      <div class="d-flex align-items-center justify-content-between border rounded p-2 mb-2">
        <div><i class="bi bi-twitch me-1"></i><strong>${s}</strong></div>
        <button class="btn btn-sm btn-outline-danger" onclick="removeStreamer('${s}')"><i class="bi bi-trash"></i></button>
      </div>`
    )
    .join("");
}

function addStreamer() {
  const input = document.getElementById("newStreamer");
  if (!input) return;
  const raw = (input.value || "").trim();
  const username = raw.toLowerCase();
  if (!username) return alert("Please enter a Twitch username");
  if (!/^\w{3,25}$/.test(username))
    return alert(
      "Invalid username. Use 3-25 letters, numbers, or underscores."
    );
  window._twitchStreamers = Array.from(
    new Set([...(window._twitchStreamers || []), username])
  );
  input.value = "";
  renderStreamerList();
}

function removeStreamer(name) {
  if (!confirm(`Remove streamer ${name}?`)) return;
  window._twitchStreamers = (window._twitchStreamers || []).filter(
    (s) => s !== name
  );
  renderStreamerList();
}

async function saveTwitchConfig() {
  try {
    const channelId = document.getElementById("twitchChannel")?.value || null;
    const allowDuplicates =
      document.getElementById("allowDuplicates")?.checked || false;
    const streamers = Array.isArray(window._twitchStreamers)
      ? window._twitchStreamers
      : [];
    const r = await fetch(`/api/guild/${currentGuildId}/twitch-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId, streamers, allowDuplicates }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed to save Twitch config");
    const success = document.createElement("div");
    success.className = "alert alert-success mt-3";
    success.innerHTML = `<i class="bi bi-check-circle"></i> ${
      data.message || "Saved."
    }`;
    document.getElementById("twitchContent").prepend(success);
    setTimeout(() => success.remove(), 4000);
  } catch (e) {
    alert(e.message);
  }
}

async function reloadTwitchConfigNow() {
  try {
    const r = await fetch(`/api/twitch/reload`, { method: "POST" });
    if (!r.ok) throw new Error((await r.json()).error || "Failed to reload");
    const a = document.createElement("div");
    a.className = "alert alert-success mt-3";
    a.innerHTML =
      '<i class="bi bi-check-circle"></i> Reloaded Twitch configuration.';
    document.getElementById("twitchContent").prepend(a);
    setTimeout(() => a.remove(), 3000);
  } catch (e) {
    alert(e.message);
  }
}

async function checkTwitchNow() {
  try {
    const r = await fetch(`/api/twitch/check`, { method: "POST" });
    if (!r.ok)
      throw new Error((await r.json()).error || "Failed to trigger check");
    const a = document.createElement("div");
    a.className = "alert alert-success mt-3";
    a.innerHTML =
      '<i class="bi bi-check-circle"></i> Triggered immediate Twitch check.';
    document.getElementById("twitchContent").prepend(a);
    setTimeout(() => a.remove(), 3000);
  } catch (e) {
    alert(e.message);
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
    const r = await fetch(
      currentGuildId
        ? `/api/commands?guildId=${currentGuildId}`
        : "/api/commands"
    );
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
      const scopeBadge =
        c.scope === "guild"
          ? '<span class="badge bg-secondary">Guild</span>'
          : '<span class="badge bg-primary">Global</span>';
      const statusBadge = c.disabled
        ? '<span class="badge bg-warning text-dark ms-1">Disabled</span>'
        : '<span class="badge bg-success ms-1">Active</span>';
      const toggleId = `disable_${c.scope}_${c.id}`;
      return `
        <div class="d-flex align-items-center justify-content-between border rounded p-3 mb-2 ${
          c.disabled ? "bg-light" : ""
        }">
          <div class="flex-grow-1">
            <div class="d-flex align-items-center mb-1">
              <strong style="font-size: 1.1rem;">/${c.name}</strong>
              <span class="ms-2">${scopeBadge}${statusBadge}</span>
            </div>
            <small class="text-muted">${
              c.description || "No description"
            }</small>
          </div>
          <div class="d-flex align-items-center gap-2">
            <div class="form-check form-switch mb-0">
              <input class="form-check-input" type="checkbox" id="${toggleId}" ${
        c.disabled ? "" : "checked"
      } onchange="toggleCommandRuntime('${
        c.name
      }', this.checked)" style="cursor: pointer;">
              <label class="form-check-label" for="${toggleId}" style="cursor: pointer; user-select: none;">
                ${c.disabled ? "Enable" : "Disable"}
              </label>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteCommand('${
              c.id
            }', '${c.scope}')" title="Delete command registration">
              <i class="bi bi-trash"></i>
            </button>
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
      body: JSON.stringify({
        commandId: id,
        scope,
        guildId: scope === "guild" ? currentGuildId : undefined,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Delete failed");
    reloadCommands();
  } catch (e) {
    alert("Failed to delete command: " + e.message);
  }
}

// Refresh servers list
async function refreshServers() {
  await loadGuilds();
  alert("Servers refreshed!");
}

// Refresh bot status for a specific guild
async function refreshBotStatus(guildId) {
  try {
    const data = await fetchJSON(`/api/guild/${guildId}/bot-status`);
    if (data.joined) {
      alert(
        `Bot is in server!\nMember Count: ${
          data.memberCount
        }\nJoined: ${new Date(data.joinedAt).toLocaleString()}`
      );
    } else {
      alert("Bot is not in this server");
    }
    await loadGuilds(); // Refresh the list
  } catch (error) {
    alert("Failed to fetch bot status: " + error.message);
  }
}

// Leave a guild
async function leaveGuild(guildId, guildName) {
  if (
    !confirm(
      `Are you sure you want the bot to leave "${guildName}"?\n\nThis will remove the bot from the server. You can re-invite it later.`
    )
  ) {
    return;
  }

  try {
    const response = await fetch(`/api/guild/${guildId}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to leave server");
    }

    alert(`Bot successfully left "${guildName}"`);
    await loadGuilds(); // Refresh the list
  } catch (error) {
    alert("Failed to leave server: " + error.message);
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
