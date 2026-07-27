const NPC_CHATTER_MODULE_ID = "npc-chatter";
const NPC_CHATTER_TABLE_IDS_FLAG = "tableIds";
const NPC_CHATTER_AUTOMATIC_SETTING = "automaticChatter";
const NPC_CHATTER_INTERVAL_SETTING = "automaticIntervalSeconds";

class NpcChatter {
  static timer;

  getChatterTables({warn = true} = {}) {
    const chatterFolder = game.folders.find(folder =>
      folder.type === "RollTable"
      && folder.name.trim().toLowerCase() === "npc chatter"
    );

    const tables = game.tables.filter(table => {
      const hasChatterName = table.name.trim().toLowerCase().endsWith("chatter");
      const isInChatterFolder = chatterFolder && table.folder?.id === chatterFolder.id;
      return hasChatterName || isInChatterFolder;
    });

    if (warn && !tables.length) {
      ui.notifications.warn(
        "NPC Chatter could not find any tables ending in “Chatter” or tables in an “NPC Chatter” folder."
      );
    }
    return tables;
  }

  static _getActor(target) {
    if (target?.documentName === "Actor") return target;
    return target?.actor ?? target?.document?.actor ?? null;
  }

  getAssignedTableIds(target) {
    const actor = NpcChatter._getActor(target);
    const value = actor?.getFlag?.(NPC_CHATTER_MODULE_ID, NPC_CHATTER_TABLE_IDS_FLAG)
      ?? actor?.flags?.[NPC_CHATTER_MODULE_ID]?.[NPC_CHATTER_TABLE_IDS_FLAG];
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(String).filter(Boolean))];
  }

  getTablesForToken(token, {warn = false} = {}) {
    const assignedIds = this.getAssignedTableIds(token);
    if (assignedIds.length) {
      const tables = assignedIds.map(id => game.tables.get(id)).filter(Boolean);
      if (warn && !tables.length) {
        ui.notifications.warn(
          `The Roll Tables assigned to “${token.name}” no longer exist. Assign another table from the token HUD.`
        );
      }
      return tables;
    }

    const tables = this.getChatterTables({warn: false})
      .filter(table => NpcChatter._matchesTable(token, table));
    if (warn && !tables.length) {
      ui.notifications.warn(
        `No chatter table is assigned to “${token.name}”. Use the table button on its token HUD to assign one.`
      );
    }
    return tables;
  }

  async assignTables(target, tableIds = []) {
    const actor = NpcChatter._getActor(target);
    if (!actor) {
      ui.notifications.error("NPC Chatter could not find an actor to configure.");
      return null;
    }

    const requestedIds = Array.isArray(tableIds) ? tableIds : [tableIds];
    const validIds = [...new Set(requestedIds.map(String))]
      .filter(id => game.tables.get(id));
    if (validIds.length) {
      await actor.setFlag(NPC_CHATTER_MODULE_ID, NPC_CHATTER_TABLE_IDS_FLAG, validIds);
    } else {
      await actor.unsetFlag(NPC_CHATTER_MODULE_ID, NPC_CHATTER_TABLE_IDS_FLAG);
    }
    return validIds;
  }

  async openTableAssignment(target) {
    const actor = NpcChatter._getActor(target);
    if (!actor) {
      ui.notifications.error("NPC Chatter could not find an actor to configure.");
      return null;
    }
    if (!game.user.isGM && !actor.isOwner) {
      ui.notifications.error(`You cannot configure chatter for “${actor.name}”.`);
      return null;
    }

    const tables = [...(game.tables.contents ?? game.tables)]
      .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
    if (!tables.length) {
      ui.notifications.warn("Create at least one Roll Table before assigning NPC chatter.");
      return null;
    }

    const assignedIds = new Set(this.getAssignedTableIds(actor));
    const escape = value => foundry.utils.escapeHTML(String(value));
    const tableChoices = tables.map(table => `
      <label class="checkbox">
        <input type="checkbox" name="npc-chatter-table" value="${escape(table.id)}"
          ${assignedIds.has(table.id) ? "checked" : ""}>
        ${escape(table.name)}
      </label>
    `).join("");
    const content = `
      <p>Select one or more Roll Tables for <strong>${escape(actor.name)}</strong>.
      Each time this NPC speaks, one assigned table is chosen at random.</p>
      <div class="form-group stacked">
        <label>Chatter Roll Tables</label>
        <div style="max-height: 320px; overflow-y: auto; display: grid; gap: 0.35rem;">
          ${tableChoices}
        </div>
      </div>
      <p class="hint">Clearing the assignment restores the legacy table-name matching behavior.</p>
    `;

    const selectedIds = await foundry.applications.api.DialogV2.wait({
      window: {title: `NPC Chatter — ${actor.name}`},
      content,
      buttons: [
        {
          action: "save",
          label: "Save Assignment",
          icon: "fa-solid fa-floppy-disk",
          default: true,
          callback: (_event, button) => [
            ...button.form.querySelectorAll('input[name="npc-chatter-table"]:checked')
          ].map(input => input.value)
        },
        {
          action: "clear",
          label: "Use Legacy Matching",
          icon: "fa-solid fa-eraser",
          callback: () => []
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fa-solid fa-xmark",
          callback: () => null
        }
      ],
      rejectClose: false,
      modal: true
    });
    if (selectedIds === null || selectedIds === undefined) return null;

    const savedIds = await this.assignTables(actor, selectedIds);
    const message = savedIds.length
      ? `Assigned ${savedIds.length} chatter table${savedIds.length === 1 ? "" : "s"} to “${actor.name}”.`
      : `“${actor.name}” will use legacy chatter-table matching.`;
    ui.notifications.info(message);
    return savedIds;
  }

  randomGlobalChatterEvery(milliseconds, options = {}) {
    const interval = Number(milliseconds);
    if (!Number.isFinite(interval) || interval < 1000) {
      ui.notifications.error("NPC Chatter intervals must be at least 1000 milliseconds.");
      return;
    }

    this.turnOffGlobalTimerChatter();
    NpcChatter.timer = window.setInterval(() => {
      void this.globalChatter(options);
    }, interval);
    return NpcChatter.timer;
  }

  syncAutomaticTimer() {
    this.turnOffGlobalTimerChatter();
    if (!game.settings.get(NPC_CHATTER_MODULE_ID, NPC_CHATTER_AUTOMATIC_SETTING)) return false;
    if (!game.user?.isGM) return false;

    const activeGm = game.users?.activeGM;
    if (activeGm && activeGm.id !== game.user.id) return false;

    const configuredSeconds = Number(
      game.settings.get(NPC_CHATTER_MODULE_ID, NPC_CHATTER_INTERVAL_SETTING)
    );
    const seconds = Number.isFinite(configuredSeconds) ? configuredSeconds : 60;
    this.randomGlobalChatterEvery(Math.max(5, seconds) * 1000);
    return true;
  }

  static _getChatterScene() {
    const sceneType = game.settings.get(NPC_CHATTER_MODULE_ID, "scenetype");
    if (sceneType === "active") {
      return game.scenes.active ?? game.scenes.find(scene => scene.active);
    }
    return game.scenes.viewed ?? canvas.scene;
  }

  static _tableNameMatcher(table) {
    return table.name.replace(/\s*chatter\s*$/i, "").trim().toLowerCase();
  }

  static _matchesTable(token, table) {
    const matcher = NpcChatter._tableNameMatcher(table);
    return Boolean(matcher) && token.name.toLowerCase().includes(matcher);
  }

  static _randomEntry(entries) {
    if (!entries.length) return undefined;
    return entries[Math.floor(Math.random() * entries.length)];
  }

  static _resultText(result) {
    return String(result?.description || result?.name || "").trim();
  }

  static _bubbleOptions(options = {}) {
    const normalized = {...options};
    if (normalized.emote) {
      normalized.cssClasses = [...new Set([...(normalized.cssClasses ?? []), "emote"])];
    }
    delete normalized.emote;
    return normalized;
  }

  static async _speak(token, table, options = {}) {
    const {results} = await table.roll();
    const message = NpcChatter._resultText(results[0]);
    if (!message) {
      ui.notifications.warn(`NPC Chatter rolled an empty result from “${table.name}”.`);
      return null;
    }

    return canvas.hud.bubbles.broadcast(
      token,
      message,
      NpcChatter._bubbleOptions(options)
    );
  }

  async globalChatter(options = {}) {
    const scene = NpcChatter._getChatterScene();
    if (!scene) {
      ui.notifications.warn("NPC Chatter could not find the configured scene.");
      return null;
    }

    const playerActorIds = new Set(
      game.users.filter(user => user.character).map(user => user.character.id)
    );
    const npcTokens = scene.tokens.filter(token => {
      if (playerActorIds.has(token.actorId)) return false;
      return !scene.isView || token.viewed;
    });
    const candidates = npcTokens.map(token => ({
      token,
      tables: this.getTablesForToken(token)
    })).filter(candidate => candidate.tables.length);

    if (!candidates.length) {
      ui.notifications.warn(
        "No NPCs in this scene have assigned chatter tables. Configure one from a token HUD."
      );
      return null;
    }

    const candidate = NpcChatter._randomEntry(candidates);
    const table = NpcChatter._randomEntry(candidate.tables);
    return NpcChatter._speak(candidate.token, table, options);
  }

  async tokenChatter(token, options = {}) {
    if (!token) {
      ui.notifications.error("No token was provided to NPC Chatter.");
      return null;
    }

    const tables = this.getTablesForToken(token, {warn: true});
    if (!tables.length) return null;
    const table = NpcChatter._randomEntry(tables);
    return NpcChatter._speak(token, table, options);
  }

  async selectedChatter(options = {}) {
    const token = NpcChatter._randomEntry(canvas.tokens.controlled);
    if (!token) {
      ui.notifications.warn("Select a token before using Selected Chatter.");
      return null;
    }
    return this.tokenChatter(token, options);
  }

  turnOffGlobalTimerChatter() {
    if (NpcChatter.timer !== undefined) window.clearInterval(NpcChatter.timer);
    NpcChatter.timer = undefined;
  }
}

Hooks.once("init", () => {
  game.settings.register(NPC_CHATTER_MODULE_ID, "scenetype", {
    name: "Chatter Scene",
    hint: "Choose whether global chatter uses the active scene or the scene you are currently viewing.",
    type: String,
    config: true,
    scope: "world",
    default: "viewed",
    choices: {
      active: "Active Scene",
      viewed: "Viewed Scene"
    }
  });

  game.settings.register(NPC_CHATTER_MODULE_ID, NPC_CHATTER_AUTOMATIC_SETTING, {
    name: "Automatic Chatter",
    hint: "Periodically make a random configured NPC speak. Only the active GM client runs the timer.",
    type: Boolean,
    config: true,
    scope: "world",
    default: false,
    onChange: () => {
      game.npcChatter?.syncAutomaticTimer();
      ui.controls?.render({reset: true});
    }
  });

  game.settings.register(NPC_CHATTER_MODULE_ID, NPC_CHATTER_INTERVAL_SETTING, {
    name: "Automatic Chatter Interval",
    hint: "Seconds between automatic chatter attempts.",
    type: Number,
    config: true,
    scope: "world",
    default: 60,
    range: {
      min: 5,
      max: 3600,
      step: 5
    },
    onChange: () => game.npcChatter?.syncAutomaticTimer()
  });
});

Hooks.once("ready", () => {
  const api = new NpcChatter();
  for (const method of [
    "getChatterTables",
    "getAssignedTableIds",
    "getTablesForToken",
    "assignTables",
    "openTableAssignment",
    "randomGlobalChatterEvery",
    "syncAutomaticTimer",
    "globalChatter",
    "tokenChatter",
    "selectedChatter",
    "turnOffGlobalTimerChatter"
  ]) {
    api[method] = api[method].bind(api);
  }
  game.npcChatter = api;
  game.modules.get(NPC_CHATTER_MODULE_ID).api = api;
  api.syncAutomaticTimer();
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const tools = controls?.tokens?.tools;
  if (!tools) return;

  const globalTool = {
    name: "npc-chatter-global",
    title: "NPC Chatter: Make a random NPC speak",
    icon: "fa-solid fa-comment-dots",
    button: true,
    order: 850,
    onChange: () => void game.npcChatter.globalChatter()
  };
  const automaticTool = {
    name: "npc-chatter-automatic",
    title: "NPC Chatter: Toggle automatic chatter",
    icon: "fa-solid fa-comments",
    toggle: true,
    active: game.settings.get(NPC_CHATTER_MODULE_ID, NPC_CHATTER_AUTOMATIC_SETTING),
    order: 851,
    onChange: (_event, active) =>
      void game.settings.set(NPC_CHATTER_MODULE_ID, NPC_CHATTER_AUTOMATIC_SETTING, active)
  };

  if (Array.isArray(tools)) tools.push(globalTool, automaticTool);
  else {
    tools[globalTool.name] = globalTool;
    tools[automaticTool.name] = automaticTool;
  }
});

Hooks.on("renderTokenHUD", (hud, html) => {
  if (!game.user?.isGM) return;
  const token = hud.object;
  if (!NpcChatter._getActor(token)) return;

  const root = typeof jQuery !== "undefined" && html instanceof jQuery ? html[0] : html;
  const column = root?.querySelector(".col.right") ?? root?.querySelector(".right");
  if (!column) return;

  const assignedCount = game.npcChatter.getAssignedTableIds(token).length;
  const assignButton = document.createElement("button");
  assignButton.type = "button";
  assignButton.classList.add("control-icon", "npc-chatter-assign");
  if (assignedCount) assignButton.classList.add("active");
  assignButton.dataset.tooltip = assignedCount
    ? `NPC Chatter: ${assignedCount} assigned table${assignedCount === 1 ? "" : "s"}`
    : "NPC Chatter: Assign Roll Tables";
  assignButton.setAttribute("aria-label", assignButton.dataset.tooltip);
  assignButton.innerHTML = '<i class="fa-solid fa-table-list" inert></i>';
  assignButton.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    await game.npcChatter.openTableAssignment(token);
    hud.render();
  });

  const speakButton = document.createElement("button");
  speakButton.type = "button";
  speakButton.classList.add("control-icon", "npc-chatter-speak");
  speakButton.dataset.tooltip = "NPC Chatter: Speak now";
  speakButton.setAttribute("aria-label", speakButton.dataset.tooltip);
  speakButton.innerHTML = '<i class="fa-solid fa-comment-dots" inert></i>';
  speakButton.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    await game.npcChatter.tokenChatter(token);
  });

  column.append(assignButton, speakButton);
});

Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  const actor = app.document;
  if (!game.user?.isGM || actor?.documentName !== "Actor") return;
  controls.push({
    label: "NPC Chatter Tables",
    icon: "fa-solid fa-comments",
    onClick: () => void game.npcChatter.openTableAssignment(actor)
  });
});

Hooks.on("getActorSheetHeaderButtons", (app, controls) => {
  const actor = app.actor ?? app.document ?? app.object;
  if (!game.user?.isGM || actor?.documentName !== "Actor") return;
  controls.push({
    label: "NPC Chatter",
    class: "npc-chatter-assignment",
    icon: "fa-solid fa-comments",
    onclick: () => void game.npcChatter.openTableAssignment(actor)
  });
});

Hooks.on("updateUser", (_user, changes) => {
  if (
    changes
    && "active" in changes
    && game.settings.get(NPC_CHATTER_MODULE_ID, NPC_CHATTER_AUTOMATIC_SETTING)
  ) {
    game.npcChatter?.syncAutomaticTimer();
  }
});
