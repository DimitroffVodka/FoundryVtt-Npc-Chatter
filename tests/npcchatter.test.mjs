import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../npcchatter.js", import.meta.url), "utf8");

function createCollection(entries, extra = {}) {
  return Object.assign(entries, {
    contents: entries,
    find: entries.find.bind(entries),
    filter: entries.filter.bind(entries),
    get: id => entries.find(entry => entry.id === id),
    ...extra
  });
}

function createHarness({automaticChatter = false} = {}) {
  const hooks = new Map();
  const broadcasts = [];
  const warnings = [];
  const errors = [];
  const infos = [];
  const module = {};
  const folder = {id: "folder-1", type: "RollTable", name: "NPC Chatter"};
  const legacyTable = {
    id: "table-1",
    name: "Villager Chatter",
    folder,
    roll: async () => ({
      results: [{description: "Keep your voice down.", name: ""}]
    })
  };
  const assignedTable = {
    id: "table-2",
    name: "Things Guards Say",
    folder: null,
    roll: async () => ({
      results: [{description: "The gate closes at sundown.", name: ""}]
    })
  };
  const actorFlags = {};
  const actor = {
    id: "npc-1",
    name: "Villager",
    documentName: "Actor",
    isOwner: true,
    getFlag: (namespace, key) => actorFlags[namespace]?.[key],
    setFlag: async (namespace, key, value) => {
      actorFlags[namespace] ??= {};
      actorFlags[namespace][key] = value;
      return value;
    },
    unsetFlag: async (namespace, key) => {
      if (actorFlags[namespace]) delete actorFlags[namespace][key];
    }
  };
  const tokenDocument = {
    id: "token-1",
    actorId: actor.id,
    actor,
    name: "Villager A",
    viewed: true
  };
  const otherLevelToken = {
    id: "token-2",
    actorId: "npc-2",
    actor: null,
    name: "Villager B",
    viewed: false
  };
  const scene = {
    id: "scene-1",
    active: true,
    isView: true,
    tokens: createCollection([tokenDocument, otherLevelToken])
  };
  const registeredSettings = [];
  const settingValues = new Map([
    ["scenetype", "viewed"],
    ["automaticChatter", automaticChatter],
    ["automaticIntervalSeconds", 60]
  ]);
  const settingsWrites = [];
  const intervalCalls = [];
  const clearedIntervals = [];
  let nextIntervalId = 1;

  const context = vm.createContext({
    console,
    Math,
    Set,
    String,
    Boolean,
    Number,
    Hooks: {
      once: (name, callback) => hooks.set(name, callback),
      on: (name, callback) => hooks.set(name, callback)
    },
    game: {
      ready: true,
      folders: createCollection([folder]),
      tables: createCollection([legacyTable, assignedTable]),
      users: createCollection([], {activeGM: {id: "gm-1"}}),
      scenes: createCollection([scene], {active: scene}),
      user: {id: "gm-1", isGM: true, viewedScene: scene.id},
      i18n: {lang: "en"},
      settings: {
        get: (_namespace, key) => settingValues.get(key),
        set: async (_namespace, key, value) => {
          settingValues.set(key, value);
          settingsWrites.push([key, value]);
          return value;
        },
        register: (_namespace, key, config) => {
          registeredSettings.push([_namespace, key, config]);
          if (!settingValues.has(key)) settingValues.set(key, config.default);
        }
      },
      modules: {
        get: () => module
      }
    },
    canvas: {
      scene,
      tokens: {controlled: []},
      hud: {
        bubbles: {
          broadcast: async (...args) => {
            broadcasts.push(args);
            return "bubble";
          }
        }
      }
    },
    ui: {
      notifications: {
        warn: message => warnings.push(message),
        error: message => errors.push(message),
        info: message => infos.push(message)
      }
    },
    window: {
      setInterval: (callback, interval) => {
        const id = nextIntervalId++;
        intervalCalls.push({id, callback, interval});
        return id;
      },
      clearInterval: id => clearedIntervals.push(id)
    }
  });

  new vm.Script(source, {filename: "npcchatter.js"}).runInContext(context);
  hooks.get("init")();
  hooks.get("ready")();

  return {
    actor,
    actorFlags,
    api: context.game.npcChatter,
    assignedTable,
    broadcasts,
    clearedIntervals,
    context,
    errors,
    hooks,
    infos,
    intervalCalls,
    legacyTable,
    module,
    registeredSettings,
    settingValues,
    settingsWrites,
    tokenDocument,
    warnings
  };
}

test("registers the v14 API and user-facing settings", () => {
  const harness = createHarness();
  assert.equal(harness.module.api, harness.api);
  assert.equal(harness.api.globalChatter, harness.module.api.globalChatter);
  assert.deepEqual(
    harness.registeredSettings.map(([, key]) => key),
    ["scenetype", "automaticChatter", "automaticIntervalSeconds"]
  );
  assert.equal(typeof harness.api.openTableAssignment, "function");
  assert.equal(typeof harness.api.assignTables, "function");
});

test("explicit actor assignments can use any Roll Table name", async () => {
  const harness = createHarness();
  await harness.api.assignTables(harness.actor, [harness.assignedTable.id]);

  await harness.api.tokenChatter(harness.tokenDocument);

  assert.deepEqual(
    Array.from(harness.api.getAssignedTableIds(harness.actor)),
    [harness.assignedTable.id]
  );
  assert.equal(harness.broadcasts.length, 1);
  assert.equal(harness.broadcasts[0][0], harness.tokenDocument);
  assert.equal(harness.broadcasts[0][1], "The gate closes at sundown.");
  assert.deepEqual(harness.warnings, []);
});

test("global chatter prefers actor assignments and uses core bubble broadcasting", async () => {
  const harness = createHarness();
  await harness.api.assignTables(harness.actor, [harness.assignedTable.id]);

  const result = await harness.api.globalChatter();

  assert.equal(result, "bubble");
  assert.equal(harness.broadcasts.length, 1);
  assert.equal(harness.broadcasts[0][0], harness.tokenDocument);
  assert.equal(harness.broadcasts[0][1], "The gate closes at sundown.");
});

test("legacy table-name matching remains available without an assignment", async () => {
  const harness = createHarness();

  await harness.api.tokenChatter(harness.tokenDocument);

  assert.equal(harness.broadcasts.length, 1);
  assert.equal(harness.broadcasts[0][1], "Keep your voice down.");
});

test("clearing an assignment restores legacy matching", async () => {
  const harness = createHarness();
  await harness.api.assignTables(harness.actor, [harness.assignedTable.id]);
  await harness.api.assignTables(harness.actor, []);

  await harness.api.tokenChatter(harness.tokenDocument);

  assert.deepEqual(Array.from(harness.api.getAssignedTableIds(harness.actor)), []);
  assert.equal(harness.broadcasts[0][1], "Keep your voice down.");
});

test("selected chatter warns when no token is selected", async () => {
  const harness = createHarness();

  const result = await harness.api.selectedChatter();

  assert.equal(result, null);
  assert.match(harness.warnings[0], /Select a token/);
  assert.equal(harness.errors.length, 0);
});

test("scene controls provide manual and automatic chatter without macros", async () => {
  const harness = createHarness();
  const controls = {tokens: {tools: {}}};

  harness.hooks.get("getSceneControlButtons")(controls);

  assert.equal(controls.tokens.tools["npc-chatter-global"].button, true);
  assert.equal(controls.tokens.tools["npc-chatter-automatic"].toggle, true);
  controls.tokens.tools["npc-chatter-automatic"].onChange(null, true);
  await Promise.resolve();
  assert.deepEqual(harness.settingsWrites, [["automaticChatter", true]]);
});

test("actor sheets receive a chatter assignment control", () => {
  const harness = createHarness();
  const v2Controls = [];
  const legacyControls = [];

  harness.hooks.get("getHeaderControlsApplicationV2")(
    {document: harness.actor},
    v2Controls
  );
  harness.hooks.get("getActorSheetHeaderButtons")(
    {actor: harness.actor},
    legacyControls
  );

  assert.equal(v2Controls.length, 1);
  assert.equal(v2Controls[0].label, "NPC Chatter Tables");
  assert.equal(legacyControls.length, 1);
  assert.equal(legacyControls[0].label, "NPC Chatter");
});

test("automatic chatter runs only from the active GM and can be stopped", () => {
  const harness = createHarness({automaticChatter: true});

  assert.equal(harness.intervalCalls.length, 1);
  assert.equal(harness.intervalCalls[0].interval, 60000);
  harness.api.turnOffGlobalTimerChatter();
  assert.deepEqual(harness.clearedIntervals, [1]);
});
