(() => {
// Save/load helpers with backward compatibility for Score Order Idle.
const SAVE_KEY = "score_order_idle_v10";
const LEGACY_SAVE_KEYS = [
  "score_order_idle_v9",
  "score_order_idle_v8",
  "score_order_idle_v7",
  "score_order_idle_v6",
  "score_order_idle_v5",
  "score_order_idle_v4",
  "score_order_idle_v3",
];
function createDefaultState(buildings, nowFn){
  return {
    version: 12,
    notes: 0,
    lifetimeNotes: 0,
    runNotes: 0,
    ink: 0,
    patrons: 0,
    patronsEver: 0,
    owned: Object.fromEntries(buildings.map(b=>[b.id,0])),
    buildingMult: Object.fromEntries(buildings.map(b=>[b.id,1])),
    noteUpgrades: {},
    synergyUpgrades: {},
    runClickMult: 1,
    runNpsMult: 1,
    inkUpgrades: {},
    metaNpsMult: 1,
    metaClickMult: 1,
    clickFromNpsRate: 0,
    noteStageIdx: 0,
    batonUpgrades: {},
    batonOwned: 0,
    batonBaseExtra: 0,
    batonClickMult: 1,
    achievements: {},
    achNpsMult: 1,
    achClickMult: 1,
    facility: {
      currentId: "shed",
      unlocked: { shed: true },
      purchasedUpgrades: {},
      baseBonus: {
        shed: { nps: 1, click: 1 }
      }
    },
    library: {
      works: {},
      order: [],
      activeWorkId: null,
      view: "list",
      unlocked: false,
      endowmentStage: 0,
      endowments: 0
    },
    buyMode: "1",
    ui: {
      tab: "main",
      lastTab: "main",
      familyOpen: {},
      instrumentUpOpen: {},
      synergyOpen: {},
      facilityUpOpen: false,
      facilityNextOpen: false,
      batonOpen: false,
      inkTab: "nps",
      hasStarted: false,
      tutorialCompleted: false,
      tutorialStep: 0,
      tooltipStep: 0,
      tooltipAckStep: -1,
      tooltipsDone: false,
      prestigeExplained: false,
      firstPrestigePromptShown: false,
      libraryForeshadowShown: false,
      endowmentReadyShown: false,
      blocked: false,
      hasPrestiged: false
    },
    settings: {
      abbrevLarge: true,
      reduceMotion: false,
      highContrast: false,
      disableTooltips: false
    },
    stats: {
      clicks: 0,
      buildingsBought: 0,
      inkEarned: 0
    },
    recentUnlocks: [],
    lastTick: nowFn(),
    lastSave: nowFn(),
  };
}
function normalizeLoadedState(s, defaults, buildings, batonClickMultForState){
  for (const k of Object.keys(defaults)){
    if (s[k] === undefined) s[k] = defaults[k];
  }

  if (!s.owned) s.owned = {};
  if (!s.buildingMult) s.buildingMult = {};
  for (const b of buildings){
    if (s.owned[b.id] === undefined) s.owned[b.id] = 0;
    if (s.buildingMult[b.id] === undefined) s.buildingMult[b.id] = 1;
  }

  if (!s.noteUpgrades) s.noteUpgrades = {};
  if (!s.synergyUpgrades) s.synergyUpgrades = {};
  if (!s.inkUpgrades) s.inkUpgrades = {};
  if (!s.achievements) s.achievements = {};

  if (s.metaNpsMult === undefined) s.metaNpsMult = 1;
  if (s.metaClickMult === undefined) s.metaClickMult = 1;
  if (s.clickFromNpsRate === undefined) s.clickFromNpsRate = 0;
  if (s.achNpsMult === undefined) s.achNpsMult = 1;
  if (s.achClickMult === undefined) s.achClickMult = 1;

  if (!s.buyMode) s.buyMode = "1";

  if (!s.ui) s.ui = defaults.ui;
  if (!s.ui.familyOpen) s.ui.familyOpen = {};
  if (!s.ui.instrumentUpOpen) s.ui.instrumentUpOpen = {};
  if (!s.ui.synergyOpen) s.ui.synergyOpen = {};
  if (!s.ui.inkTab) s.ui.inkTab = "nps";
  if (!s.ui.tab) s.ui.tab = "main";
  if (!s.ui.lastTab) s.ui.lastTab = (s.ui.tab && s.ui.tab !== "start") ? s.ui.tab : "main";

  if (s.ui.hasStarted === undefined) s.ui.hasStarted = false;
  if (s.ui.tutorialCompleted === undefined) s.ui.tutorialCompleted = false;
  if (s.ui.tutorialStep === undefined) s.ui.tutorialStep = 0;
  if (s.ui.tooltipStep === undefined) s.ui.tooltipStep = 0;
  if (s.ui.tooltipAckStep === undefined) s.ui.tooltipAckStep = -1;
  if (s.ui.tooltipsDone === undefined) s.ui.tooltipsDone = !!s.ui.hasStarted;
  if (s.ui.prestigeExplained === undefined) s.ui.prestigeExplained = false;
  if (s.ui.firstPrestigePromptShown === undefined) s.ui.firstPrestigePromptShown = false;
  if (s.ui.libraryForeshadowShown === undefined) s.ui.libraryForeshadowShown = false;
  if (s.ui.endowmentReadyShown === undefined) s.ui.endowmentReadyShown = false;
  if (s.ui.blocked === undefined) s.ui.blocked = false;
  if (s.ui.hasPrestiged === undefined) s.ui.hasPrestiged = (s.patronsEver || 0) > 0;

  if (!s.settings) s.settings = defaults.settings;
  if (s.settings.abbrevLarge === undefined) s.settings.abbrevLarge = true;
  if (s.settings.reduceMotion === undefined) s.settings.reduceMotion = false;
  if (s.settings.highContrast === undefined) s.settings.highContrast = false;
  if (s.settings.disableTooltips === undefined) s.settings.disableTooltips = false;

  if (!s.stats) s.stats = defaults.stats;
  if (s.stats.clicks === undefined) s.stats.clicks = 0;
  if (s.stats.buildingsBought === undefined) s.stats.buildingsBought = 0;
  if (s.stats.inkEarned === undefined) s.stats.inkEarned = s.ink || 0;
  if (!s.recentUnlocks) s.recentUnlocks = [];

  if (!s.facility) s.facility = defaults.facility;
  if (!s.facility.currentId) s.facility.currentId = "shed";
  if (!s.facility.unlocked) s.facility.unlocked = { shed: true };
  if (!s.facility.purchasedUpgrades) s.facility.purchasedUpgrades = {};
  if (!s.facility.baseBonus) s.facility.baseBonus = {};
  if (!s.facility.baseBonus.shed) s.facility.baseBonus.shed = { nps: 1, click: 1 };

  if (!s.library || typeof s.library !== "object") s.library = defaults.library;
  if (!s.library.works || typeof s.library.works !== "object") s.library.works = {};
  if (!Array.isArray(s.library.order)) s.library.order = Object.keys(s.library.works);
  s.library.order = s.library.order.filter(id => !!s.library.works[id]);
  for (const id of Object.keys(s.library.works)){
    const work = s.library.works[id];
    if (!work || typeof work !== "object"){
      delete s.library.works[id];
      continue;
    }
    if (!work.id) work.id = id;
    if (!work.title) work.title = "Untitled Work";
    if (!work.composer) work.composer = "";
    if (work.createdAt === undefined) work.createdAt = Date.now();
    if (typeof work.xmlText !== "string") work.xmlText = "";
    if (!Array.isArray(work.events)) work.events = [];
    if (work.unlockedCount === undefined) work.unlockedCount = 0;
    work.unlockedCount = Math.max(0, Math.min(Math.floor(work.unlockedCount || 0), work.events.length));
    if (work.practice === undefined) work.practice = 0;
    if (work.practicePerSecond === undefined) work.practicePerSecond = 1;
    if (work.bpm === undefined) work.bpm = 120;
    work.practice = Math.max(0, Number(work.practice) || 0);
    work.practicePerSecond = Math.max(0, Number(work.practicePerSecond) || 0);
    work.bpm = Math.max(20, Number(work.bpm) || 120);
    if (work.completed === undefined) work.completed = (work.unlockedCount >= work.events.length && work.events.length > 0);
  }
  for (const id of Object.keys(s.library.works)){
    if (!s.library.order.includes(id)) s.library.order.push(id);
  }
  if (!s.library.activeWorkId || !s.library.works[s.library.activeWorkId]){
    s.library.activeWorkId = s.library.order[0] || null;
  }
  if (s.library.view !== "work" && s.library.view !== "list") s.library.view = "list";
  if (s.library.unlocked === undefined) s.library.unlocked = (s.library.order.length > 0);
  s.library.unlocked = !!s.library.unlocked;
  if (s.library.endowmentStage === undefined) s.library.endowmentStage = 0;
  s.library.endowmentStage = Math.max(0, Math.floor(Number(s.library.endowmentStage) || 0));
  if (s.library.endowments === undefined) s.library.endowments = 0;
  s.library.endowments = Math.max(0, Math.floor(Number(s.library.endowments) || 0));

  if (s.patronsEver === undefined) s.patronsEver = s.patrons || 0;
  if (s.patrons === undefined) s.patrons = s.patronsEver;

  if (s.noteStageIdx === undefined) s.noteStageIdx = 0;
  if (!s.batonUpgrades) s.batonUpgrades = {};
  for (const k of Object.keys(s.batonUpgrades)){
    const raw = s.batonUpgrades[k];
    s.batonUpgrades[k] = (raw && raw > 0) ? 1 : 0;
  }
  if (s.batonOwned === undefined) s.batonOwned = 0;
  if (s.batonBaseExtra === undefined) s.batonBaseExtra = 0;
  s.batonClickMult = batonClickMultForState(s);

  if (s.runNotes === undefined) s.runNotes = 0;

  return s;
}
const blockedSaveKeys = new Set();
let lastLoadStatus = { ok: true, message: "" };
const backupKey = key => key + "_backup";

function parseSavedState(raw){
  const s = JSON.parse(raw);
  if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error("Invalid save object.");
  for (const key of ["notes", "runNotes", "lifetimeNotes", "ink", "patrons", "patronsEver", "lastTick", "lastSave", "runClickMult", "runNpsMult", "metaNpsMult", "metaClickMult", "clickFromNpsRate", "batonOwned", "batonBaseExtra", "batonClickMult", "achNpsMult", "achClickMult", "noteStageIdx"]){
    if (s[key] !== undefined && (typeof s[key] !== "number" || !Number.isFinite(s[key]) || s[key] < 0)){
      throw new Error("Invalid save value: " + key);
    }
  }
  for (const key of ["owned", "buildingMult", "ui", "settings", "facility", "library", "stats", "noteUpgrades", "synergyUpgrades", "inkUpgrades", "batonUpgrades", "achievements"]){
    if (s[key] !== undefined && (!s[key] || typeof s[key] !== "object" || Array.isArray(s[key]))){
      throw new Error("Invalid save section: " + key);
    }
  }
  for (const key of ["owned", "buildingMult"]){
    for (const value of Object.values(s[key] || {})){
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid " + key + " value.");
    }
  }
  for (const [section, keys] of [["facility", ["unlocked", "purchasedUpgrades", "baseBonus"]], ["ui", ["familyOpen", "instrumentUpOpen", "synergyOpen"]], ["library", ["works"]]]){
    for (const key of keys){
      const value = s[section]?.[key];
      if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error("Invalid save map: " + section + "." + key);
    }
  }
  const pending = [s];
  while (pending.length){
    for (const value of Object.values(pending.pop())){
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite saved number.");
      if (value && typeof value === "object") pending.push(value);
    }
  }
  return s;
}

function loadState(storage, key, legacyKeys, defaultsFactory, buildings, batonClickMultForState, nowFn, logger = console){
  lastLoadStatus = { ok: true, message: "" };
  let foundInvalid = false;
  const candidates = [key, backupKey(key), ...legacyKeys];
  for (const candidate of candidates){
    let raw;
    try { raw = storage.getItem(candidate); }
    catch (error){
      blockedSaveKeys.add(key);
      lastLoadStatus = { ok: false, message: "Saved progress could not be read. Saving is paused to protect it.", error };
      return defaultsFactory(buildings, nowFn);
    }
    if (!raw) continue;
    try{
      const normalized = normalizeLoadedState(parseSavedState(raw), defaultsFactory(buildings, nowFn), buildings, batonClickMultForState);
      blockedSaveKeys.delete(key);
      if (candidate !== key){
        lastLoadStatus = { ok: true, recovered: true, message: "Progress recovered from " + (candidate === backupKey(key) ? "the backup save." : "an older save.") };
      }
      return normalized;
    }catch(error){
      foundInvalid = true;
      logger.warn("Could not read save " + candidate, error);
    }
  }
  if (foundInvalid){
    blockedSaveKeys.add(key);
    lastLoadStatus = { ok: false, message: "Saved progress could not be recovered. Saving is paused; the original data has been kept." };
  }
  return defaultsFactory(buildings, nowFn);
}

function saveState(storage, key, state, nowFn){
  if (blockedSaveKeys.has(key)) return { ok: false, message: lastLoadStatus.message };
  try{
    const timestamp = nowFn();
    const raw = JSON.stringify({ ...state, lastSave: timestamp }, (name, value) => {
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite save value: " + name);
      return value;
    });
    parseSavedState(raw);
    const previous = storage.getItem(key);
    let validPrevious = false;
    if (previous){
      try { parseSavedState(previous); validPrevious = true; } catch (_) { /* Keep an existing recovery backup. */ }
    }
    if (validPrevious) storage.setItem(backupKey(key), previous);
    storage.setItem(key, raw);
    state.lastSave = timestamp;
    return { ok: true };
  }catch(error){
    return { ok: false, message: "Progress could not be saved. Keep this page open and check browser storage.", error };
  }
}

function clearSaveState(storage, key, legacyKeys){
  try{
    for (const item of [key, backupKey(key), ...legacyKeys, ...legacyKeys.map(backupKey)]) storage.removeItem(item);
    blockedSaveKeys.delete(key);
    lastLoadStatus = { ok: true, message: "" };
    return { ok: true };
  }catch(error){
    return { ok: false, message: "The save could not be erased. Hard reset was cancelled.", error };
  }
}

window.ScoreState = {
  getLoadStatus: () => lastLoadStatus,
  SAVE_KEY,
  LEGACY_SAVE_KEYS,
  createDefaultState,
  normalizeLoadedState,
  loadState,
  saveState,
  clearSaveState
};
})();
