(() => {
function createGameActions(data, economy, stateAPI){
  const { BUILDINGS, BATON_ITEM, BATON_UPGRADES, NOTE_UPGRADES, SYNERGY_UPGRADES, INK_UPGRADES, ACHIEVEMENTS } = data;
  const rules = economy.createProgressionRules(data);
  const deps = { buildings: BUILDINGS, batonUpgrades: BATON_UPGRADES, hasBatonTechnique: data.hasBatonTechnique,
    facilityMults: rules.facilityMults, patronBonus: rules.patronBonus };
  const totalNps = s => economy.totalNpsForState(s, BUILDINGS, rules.facilityMults, rules.patronBonus);
  const notesPerClick = s => economy.notesPerClickForState(s, deps);
  const fail = reason => ({ ok: false, reason });
  const definitions = {
    note: [NOTE_UPGRADES, "noteUpgrades"],
    baton: [BATON_UPGRADES, "batonUpgrades"],
    synergy: [SYNERGY_UPGRADES, "synergyUpgrades"],
    ink: [INK_UPGRADES, "inkUpgrades"]
  };
  function buyUnits(s, id, mode){
    const b = id === BATON_ITEM.id ? BATON_ITEM : BUILDINGS.find(b => b.id === id);
    if (!b || !["1","10","100","max"].includes(mode)) return fail("Invalid purchase.");
    const count = economy.buyCountForMode(s, b, mode, BATON_ITEM, NOTE_UPGRADES, BATON_UPGRADES);
    const cost = economy.sumCostForK(s, b, count, BATON_ITEM);
    if (!(count > 0) || !Number.isFinite(cost) || s.notes < cost) return fail("Not enough Notes.");
    s.notes -= cost;
    if (id === BATON_ITEM.id){
      s.batonOwned += count;
      s.batonBaseExtra = +(s.batonBaseExtra + count * BATON_ITEM.basePer).toFixed(4);
    } else {
      s.owned[id] += count;
      s.stats.buildingsBought += count;
    }
    s.ink += count;
    s.stats.inkEarned += count;
    return { ok: true, count, cost, name: b.name };
  }
  function buyUpgrade(s, kind, id){
    const definition = definitions[kind];
    if (!definition) return fail("Unknown upgrade category.");
    const [list, key] = definition;
    const u = list.find(u => u.id === id);
    if (!u || s[key][id]) return fail("Unavailable upgrade.");
    if (kind === "note" && (s.owned[u.buildingId] || 0) < u.requireOwned) return fail("Ownership requirement not met.");
    if (kind === "baton" && !data.batonUpgradeUnlockedInState(s, u)) return fail("Baton requirement not met.");
    if (u.can && !u.can(s)) return fail("Requirement not met.");
    const currency = kind === "ink" ? "ink" : "notes";
    const cost = kind === "ink" ? u.costInk : u.costNotes;
    if (!Number.isFinite(cost) || s[currency] < cost) return fail("Not enough currency.");
    s[currency] -= cost;
    s[key][id] = kind === "baton" ? 1 : true;
    if (kind === "baton"){
      if (u.setStage !== undefined) s.noteStageIdx = Math.max(s.noteStageIdx || 0, u.setStage);
      s.batonClickMult = economy.batonClickMultForState(s, BATON_UPGRADES, data.hasBatonTechnique);
    } else u.apply(s);
    return { ok: true, kind, id, name: u.name, cost };
  }
  function buyVenue(s, id){
    const f = rules.nextLockedFacilityForState(s);
    if (!f || f.id !== id || s.patrons < f.patronCostToUnlock) return fail("Venue unavailable.");
    const entry = rules.facilityEntryBonusFromCurrent(s, id);
    s.patrons -= f.patronCostToUnlock;
    s.facility.baseBonus[id] = { nps: entry.nps, click: entry.click };
    s.facility.unlocked[id] = true;
    s.facility.currentId = id;
    return { ok: true, name: f.name, entry, cost: f.patronCostToUnlock };
  }
  function buyVenueUpgrade(s, id){
    const f = data.getFacility(s.facility.currentId);
    const up = f && f.upgrades.find(u => u.id === id);
    if (!up || s.facility.purchasedUpgrades[id] || s.patrons < up.cost) return fail("Venue upgrade unavailable.");
    s.patrons -= up.cost;
    s.facility.purchasedUpgrades[id] = true;
    return { ok: true, name: up.name, cost: up.cost };
  }
  function preview(s, action){
    const clone = JSON.parse(JSON.stringify(s));
    const result = action(clone);
    if (!result || !result.ok) return { nps: 0, click: 0, ok: false };
    return { ok: true, nps: totalNps(clone) - totalNps(s), click: notesPerClick(clone) - notesPerClick(s) };
  }
  function previewUnits(s, id, mode){
    const b = id === BATON_ITEM.id ? BATON_ITEM : BUILDINGS.find(b=>b.id===id);
    if (!b) return {ok:false,nps:0,click:0};
    const count = economy.buyCountForMode(s,b,mode,BATON_ITEM,NOTE_UPGRADES,BATON_UPGRADES);
    if (count > 0) return preview(s, clone=>buyUnits(clone,id,mode));
    // Show the next single unit's benefit even while it is unaffordable.
    const funded = {...s, notes:economy.sumCostForK(s,b,1,BATON_ITEM)};
    return preview(funded, clone=>buyUnits(clone,id,"1"));
  }
  function availableUpgrades(s){
    const options = [];
    for (const kind of ["note", "baton", "synergy"]){
      for (const u of definitions[kind][0]){
        if (s[definitions[kind][1]][u.id] || s.notes < u.costNotes) continue;
        if (kind === "note" && (s.owned[u.buildingId] || 0) < u.requireOwned) continue;
        if (kind === "baton" && !data.batonUpgradeUnlockedInState(s,u)) continue;
        if (u.can && !u.can(s)) continue;
        const delta = preview(s, clone => buyUpgrade(clone, kind, u.id));
        if (delta.ok) options.push({ kind, id: u.id, label: u.name, delta });
      }
    }
    return options.sort((a,b) => {
      if (Math.abs(b.delta.nps - a.delta.nps) > 1e-9) return b.delta.nps - a.delta.nps;
      if (Math.abs(b.delta.click - a.delta.click) > 1e-9) return b.delta.click - a.delta.click;
      return a.label.localeCompare(b.label);
    });
  }
  function buyAllUpgrades(s){
    const purchased = [];
    for (let best; (best = availableUpgrades(s)[0]); ){
      const result = buyUpgrade(s, best.kind, best.id);
      if (!result.ok) break;
      purchased.push(result);
    }
    return { ok: purchased.length > 0, purchased };
  }
  function awardAchievements(s){
    const unlocked = [];
    for (const a of ACHIEVEMENTS){
      if (s.achievements[a.id] || !a.unlocked(s)) continue;
      s.achievements[a.id] = true;
      const key = a.kind === "click" ? "achClickMult" : "achNpsMult";
      s[key] = (s[key] || 1) * a.mult;
      unlocked.push(a);
    }
    return unlocked;
  }
  function click(s){
    const gain = notesPerClick(s);
    s.notes += gain; s.runNotes += gain; s.lifetimeNotes += gain; s.stats.clicks++;
    return { ok: true, gain };
  }
  function prestige(s){
    const gain = rules.patronsFromRun(s.runNotes || 0);
    if (gain <= 0) return fail("No Patrons earned.");
    s.patrons += gain; s.patronsEver += gain;
    s.notes = 0; s.runNotes = 0;
    s.owned = Object.fromEntries(BUILDINGS.map(b => [b.id, 0]));
    s.buildingMult = Object.fromEntries(BUILDINGS.map(b => [b.id, 1]));
    s.noteUpgrades = {}; s.synergyUpgrades = {}; s.batonUpgrades = {};
    s.runClickMult = 1; s.runNpsMult = 1; s.noteStageIdx = 0;
    s.batonOwned = 0; s.batonBaseExtra = 0; s.batonClickMult = 1;
    s.ui.hasPrestiged = true;
    return { ok: true, gain };
  }
  const reset = timestamp => stateAPI.createDefaultState(BUILDINGS, () => timestamp);
  function endowment(s, timestamp){
    if (!rules.canStartEndowment(s)) return fail("Endowment unavailable.");
    const gain = rules.endowmentGainFromPatrons(s.patrons);
    const next = reset(timestamp);
    next.settings = { ...next.settings, ...s.settings };
    next.library.unlocked = true;
    next.library.endowments = (s.library.endowments || 0) + gain;
    next.ui.libraryForeshadowShown = true; next.ui.endowmentReadyShown = true;
    return { ok: true, gain, state: next };
  }
  function advanceTo(s, timestamp, paused = false){
    if (!Number.isFinite(timestamp)) return { seconds: 0, notes: 0 };
    const previous = Number.isFinite(s.lastTick) ? s.lastTick : timestamp;
    const seconds = paused ? 0 : Math.min(6 * 60 * 60, Math.max(0, timestamp - previous) / 1000);
    s.lastTick = Math.max(previous, timestamp);
    const gain = totalNps(s) * seconds;
    s.notes += gain; s.runNotes += gain; s.lifetimeNotes += gain;
    for (const work of Object.values(s.library?.works || {})){
      work.practice = Math.max(0, work.practice || 0) + Math.max(0, work.practicePerSecond || 0) * seconds;
    }
    return { seconds, notes: gain };
  }
  return { rules, totalNps, notesPerClick, buyUnits, buyUpgrade, buyVenue, buyVenueUpgrade,
    preview, previewUnits, availableUpgrades, buyAllUpgrades, awardAchievements, click, prestige, endowment, reset, advanceTo };
}
globalThis.ScoreActions = { createGameActions };
})();
