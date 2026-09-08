(() => {
// Rendering and UI formatting helpers for Score Order Idle.
function fmtSig4Suffix(n){
  if (!isFinite(n)) return "∞";
  const abs = Math.abs(n);
  if (abs < 1_000_000) {
    return n.toLocaleString(undefined,{maximumFractionDigits:2});
  }
  if (abs >= 1e36){
    const exp = Math.floor(Math.log10(abs));
    const mant = n / Math.pow(10, exp);
    return `${mant.toFixed(3)}e${exp}`;
  }
  const suffixes = [
    { v: 1e33, s: "D" },
    { v: 1e30, s: "N" },
    { v: 1e27, s: "O" },
    { v: 1e24, s: "S" },
    { v: 1e21, s: "s" },
    { v: 1e18, s: "Q" },
    { v: 1e15, s: "q" },
    { v: 1e12, s: "T" },
    { v: 1e9,  s: "B" },
    { v: 1e6,  s: "M" },
  ];
  const pick = suffixes.find(x => abs >= x.v) || suffixes[suffixes.length-1];
  const scaled = n / pick.v;

  const digits = Math.floor(Math.log10(Math.abs(scaled))) + 1;
  const decimals = Math.max(0, 4 - digits);
  return `${scaled.toFixed(decimals)}${pick.s}`;
}
function fmtNotesHud(n, useSuffix){
  if (!isFinite(n)) return "∞";
  if (useSuffix) return fmtSig4Suffix(n);
  const abs = Math.abs(n);
  if (abs < 1000) return Math.floor(n).toString();
  const units = ["K","M","B","T","Qa","Qi","Sx","Sp","Oc","No"];
  let u = -1, x = abs;
  while (x >= 1000 && u < units.length-1) { x/=1000; u++; }
  const val = (n/Math.pow(1000,u+1));
  return (val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)) + units[u];
}
function fmtExact(n, useSuffix){
  if (!isFinite(n)) return "∞";
  return useSuffix ? fmtSig4Suffix(n) : n.toLocaleString(undefined,{maximumFractionDigits:2});
}
function fmtPatronsHud(n){
  if (!isFinite(n)) return "∞";
  const abs = Math.abs(n);
  if (abs < 100000) return Math.floor(n).toLocaleString();
  return `${(n / 1000).toFixed(2)}k`;
}
function fmtPct(p){
  if (!isFinite(p)) return "—";
  return `${(p*100).toFixed(p >= 0.1 ? 1 : 2)}%`;
}
function renderEmptyState(text, subText=""){
  return `<div class="emptyState">${text}${subText ? `<div class="smallSans" style="margin-top:4px;">${subText}</div>` : ""}</div>`;
}
function formatDeltaTip(deltaNps, deltaClick){
  const npsTxt = (deltaNps !== 0) ? `${deltaNps > 0 ? "+" : ""}${fmtExact(deltaNps, true)} NPS` : "No NPS change";
  const clickTxt = (deltaClick !== 0) ? `${deltaClick > 0 ? "+" : ""}${fmtExact(deltaClick, true)} Click` : "No Click change";
  return `Effect: ${npsTxt} • ${clickTxt}`;
}
function upgradeTagState({
  owned,
  unlocked,
  afford,
  ownedText="Purchased",
  unlockedText="Available",
  lockedText="Locked",
  lockedClass="bad"
}){
  if (owned) return { cls: "good", text: ownedText };
  if (unlocked) return { cls: afford ? "warn" : "", text: unlockedText };
  return { cls: lockedClass, text: lockedText };
}
function setButtonState(btn, enabled, reason=""){
  if (!btn) return;
  btn.disabled = !enabled;
  if (!enabled && reason){
    btn.title = reason;
    btn.setAttribute("data-base-title", reason);
    return;
  }
  btn.removeAttribute("data-base-title");
  btn.removeAttribute("title");
}
function setButtonEffectTip(btn, tip){
  if (!btn || !tip) return;
  const base = btn.getAttribute("data-base-title");
  if (base) btn.title = `${base}\n${tip}`;
  else btn.title = tip;
}
function buyModeTarget(mode){
  if (mode === "100") return 100;
  if (mode === "10") return 10;
  return 1;
}
function instrumentBuyLabel(mode, k){
  if (mode === "max"){
    return (k > 0) ? `Buy Next (${k})` : "Buy Next";
  }
  const target = buyModeTarget(mode);
  if (k > 0 && k < target) return `Buy x${k}`;
  return `Buy x${target}`;
}
function batonBuyLabel(mode, k){
  if (mode === "max"){
    return (k > 0) ? `Buy Baton Next (${k})` : "Buy Baton Next";
  }
  const target = buyModeTarget(mode);
  if (k > 0 && k < target) return `Buy Baton x${k}`;
  return `Buy Baton x${target}`;
}


// Reconcile keyed rows without replacing live purchase targets or their focus.
function patchNode(current, next){
  if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName){
    current.replaceWith(next); return next;
  }
  if (current.nodeType === 3){
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return current;
  }
  if (current.nodeType !== 1) return current;
  for (const attr of [...current.attributes]){
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  }
  for (const attr of next.attributes){
    if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  }
  // Nested shop lists are refreshed independently by their own renderer.
  if (next.id && next.classList.contains("table") && !next.childNodes.length) return current;
  const children = [...next.childNodes];
  children.forEach((child, i)=>{
    if (current.childNodes[i]) patchNode(current.childNodes[i], child);
    else current.appendChild(child);
  });
  while (current.childNodes.length > children.length) current.lastChild.remove();
  return current;
}
function updateHTML(parent, html){
  if (parent._lastHTML === html) return;
  const next = parent.cloneNode(false);
  next.innerHTML = html;
  patchNode(parent, next);
  parent._lastHTML = html;
}
function beginRows(parent){ parent._renderKeys = new Set(); }
function putRow(parent, next, key){
  key = String(key);
  parent._renderKeys.add(key);
  next.dataset.renderKey = key;
  const current = [...parent.children].find(el=>el.dataset.renderKey === key);
  const signature = next.outerHTML;
  if (current){
    if (current._renderSignature !== signature){ patchNode(current, next); current._renderSignature = signature; }
    return current;
  }
  next._renderSignature = signature;
  parent.appendChild(next);
  return next;
}
function endRows(parent){
  for (const child of [...parent.children]){
    if (!parent._renderKeys.has(child.dataset.renderKey)) child.remove();
  }
}

function createScreens(context){
  const {actions,isBlocked,globalNpsMultiplierForState,buyCountForMode,sumCostForK,buildingCostAtOwned,fmtInt,currentDockQuickAction,availableUpgradeOptions,syncDockQuickActionButtons,totalNps,notesPerClick,prestigePreview,runNotesUntilNextPatron,runNotesForPatrons,currentStage,noteMarkup,effectiveFamilyNps,effectiveInstrumentNps,instrumentLabelFamily,normalizeInkTab,syncInkTabButtons,INK_TAB_LABELS,inkUpgradeCategory,facilityMults,facilityCarryBonusFromCurrent,nextLockedFacilityForState,facilityEntryBonusFromCurrent,canAffordPatrons,renderEndowmentPanel,batonBaseClick,batonClickMult,achievementCategory,achievementBonusText,applyVisualSettings} = context;
  const {BATON_ITEM,BATON_UPGRADES,BUILDINGS,NOTE_UPGRADES,SYNERGY_UPGRADES,INK_UPGRADES,FAMILY_ORDER,FACILITIES,FACILITY_PREVIEW_IMAGE,ACHIEVEMENTS,getFacility,countPurchased,hasBatonTechnique,batonUpgradeUnlockedInState} = window.ScoreData;
  const $ = selector=>document.querySelector(selector);
  let S;
  function refreshDynamicShopStates(){
    if (!["main", "prestige", "start"].includes(S.ui.tab)) return;
    const blocked = isBlocked();
    const useSuffix = !!S.settings.abbrevLarge;
    const globalNps = globalNpsMultiplierForState(S);

    const mobileModeIds = [["mBuy1","1"],["mBuy10","10"],["mBuy100","100"]];
    mobileModeIds.forEach(([id, mode])=>{
      const b = $("#"+id);
      if (b) b.classList.toggle("active", S.buyMode === mode);
    });
    syncDockQuickActionButtons();
    const upgradeOptions = currentDockQuickAction() === "upgrades" ? availableUpgradeOptions(S) : [];

    const batonBtn = $("#buyBatonBtn");
    if (batonBtn){
      const owned = S.batonOwned || 0;
      const k = buyCountForMode(BATON_ITEM, S.buyMode);
      const qty = (k > 0) ? k : 1;
      const cost = (k > 0) ? sumCostForK(BATON_ITEM, k) : buildingCostAtOwned(BATON_ITEM, owned);
      const gain = actions.previewUnits(S, BATON_ITEM.id, S.buyMode).click;
      const deltaClick = gain;
      const tip = `${formatDeltaTip(0, deltaClick)} • +${qty} Ink`;

      const batonLabel = batonBuyLabel(S.buyMode, k);
      if (batonBtn.textContent !== batonLabel) batonBtn.textContent = batonLabel;

      const enabled = !blocked && k > 0;
      let reason = "";
      if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (k <= 0) reason = `Need ${fmtExact(cost, useSuffix)} Notes for next Baton (${fmtExact(S.notes, useSuffix)}/${fmtExact(cost, useSuffix)}).`;
      setButtonState(batonBtn, enabled, reason);
      setButtonEffectTip(batonBtn, tip);

      const ownedEl = document.querySelector("[data-baton-owned]");
      if (ownedEl) ownedEl.textContent = `${owned}`;
      const costEl = $("#batonCostLine");
      if (costEl) costEl.textContent = `Cost: ${fmtExact(cost, useSuffix)} Notes`;
      const gainEl = $("#batonGainLine");
      if (gainEl) gainEl.textContent = `+${fmtExact(gain, useSuffix)} Notes/click`;
      const inkEl = $("#batonInkLine");
      if (inkEl) inkEl.textContent = `+${qty} Ink`;
    }

    const mQuickNote = $("#mQuickNoteBtn");
    if (mQuickNote){
      const enabled = !blocked;
      let reason = "";
      if (blocked) reason = "Unavailable while tutorial or modal is open.";
      setButtonState(mQuickNote, enabled, reason);
      if (!blocked) mQuickNote.title = `Tap note (+${fmtExact(notesPerClick(), useSuffix)}).`;
    }
    ["mBuyMax", "dBuyMax"].forEach((id) => {
      const btn = $("#"+id);
      if (!btn) return;
      const best = upgradeOptions[0] || null;
      const isUpgradeAction = currentDockQuickAction() === "upgrades";
      const enabled = !blocked;
      let reason = "";
      if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (isUpgradeAction && !best) reason = "No unlocked affordable upgrades right now.";
      setButtonState(btn, enabled, reason);
      if (isUpgradeAction && best){
        btn.title = `Starts with ${best.label} (${formatDeltaTip(best.delta.nps, best.delta.click)}).`;
      } else if (isUpgradeAction && !best){
        btn.title = "No unlocked affordable upgrades. Hold or press ArrowDown to switch.";
      } else if (!isUpgradeAction){
        btn.title = "Click: set buy quantity to Next. Hold to switch.";
      }
    });

    BUILDINGS.forEach(b=>{
      const buyBtn = document.querySelector(`button[data-buy="${b.id}"]`);
      if (!buyBtn || buyBtn.closest('[id^="tab-"]')?.hidden) return;

      const owned = S.owned[b.id] || 0;
      const k = buyCountForMode(b, S.buyMode);
      const cost = (k > 0) ? sumCostForK(b, k) : buildingCostAtOwned(b, owned);
      const qty = (k > 0) ? k : 1;
      const delta = actions.preview(S, s => actions.buyUnits(s, b.id, S.buyMode));
      const deltaNps = delta.nps;
      const deltaClick = delta.click;
      const tip = `${formatDeltaTip(deltaNps, deltaClick)} • +${qty} Ink`;

      const buyLabel = instrumentBuyLabel(S.buyMode, k);
      if (buyBtn.textContent !== buyLabel) buyBtn.textContent = buyLabel;

      const enabled = !blocked && k > 0;
      let reason = "";
      if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (k <= 0) reason = `Need ${fmtExact(cost, useSuffix)} Notes for next ${b.name} (${fmtExact(S.notes, useSuffix)}/${fmtExact(cost, useSuffix)}).`;
      setButtonState(buyBtn, enabled, reason);
      setButtonEffectTip(buyBtn, tip);

      const costEl = document.querySelector(`[data-buy-cost="${b.id}"]`);
      if (costEl) costEl.textContent = `Cost: ${fmtExact(cost, useSuffix)} Notes`;
      const inkEl = document.querySelector(`[data-buy-ink="${b.id}"]`);
      if (inkEl) inkEl.textContent = (k > 0) ? `+${k} Ink` : "+1 Ink";
    });

    document.querySelectorAll("button[data-bt]").forEach(btn=>{
      if (btn.closest('[id^="tab-"]')?.hidden) return;
      const u = BATON_UPGRADES.find(x => x.id === btn.getAttribute("data-bt"));
      if (!u) return;
      const owned = hasBatonTechnique(S, u.id);
      const unlocked = batonUpgradeUnlockedInState(S, u);
      const afford = S.notes >= u.costNotes;
      const enabled = !blocked && !owned && unlocked && afford;
      const deltaClick = actions.preview(S, s => actions.buyUpgrade(s, "baton", u.id)).click;
      const tip = formatDeltaTip(0, deltaClick);
      let reason = "";
      if (owned) reason = "Already purchased.";
      else if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!unlocked){
        const idx = BATON_UPGRADES.findIndex(x => x.id === u.id);
        const prevId = idx > 0 ? BATON_UPGRADES[idx - 1].id : null;
        if (prevId && !hasBatonTechnique(S, prevId)) reason = "Buy the previous Conducting Skill first.";
        else reason = `Need ${u.requireBatons || 0} Batons (${fmtInt(S.batonOwned || 0)}/${fmtInt(u.requireBatons || 0)}).`;
      }
      else if (!afford) reason = `Need ${fmtExact(u.costNotes, useSuffix)} Notes (${fmtExact(S.notes, useSuffix)}/${fmtExact(u.costNotes, useSuffix)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });

    document.querySelectorAll("button[data-nu]").forEach(btn=>{
      if (btn.closest('[id^="tab-"]')?.hidden) return;
      const u = NOTE_UPGRADES.find(x => x.id === btn.getAttribute("data-nu"));
      if (!u) return;
      const owned = !!S.noteUpgrades[u.id];
      const have = S.owned[u.buildingId] || 0;
      const unlocked = have >= u.requireOwned;
      const afford = S.notes >= u.costNotes;
      const enabled = !blocked && !owned && unlocked && afford;
      const b = BUILDINGS.find(x=>x.id===u.buildingId);
      const delta = actions.preview(S, s => actions.buyUpgrade(s, "note", u.id));
      const deltaNps = delta.nps;
      const deltaClick = delta.click;
      const tip = formatDeltaTip(deltaNps, deltaClick);
      let reason = "";
      if (owned) reason = "Already purchased.";
      else if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!unlocked) reason = `Need ${u.requireOwned} owned (${have}/${u.requireOwned}).`;
      else if (!afford) reason = `Need ${fmtExact(u.costNotes, useSuffix)} Notes (${fmtExact(S.notes, useSuffix)}/${fmtExact(u.costNotes, useSuffix)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });

    document.querySelectorAll("button[data-syn]").forEach(btn=>{
      if (btn.closest('[id^="tab-"]')?.hidden) return;
      const u = SYNERGY_UPGRADES.find(x => x.id === btn.getAttribute("data-syn"));
      if (!u) return;
      const owned = !!S.synergyUpgrades[u.id];
      const can = u.can(S);
      const afford = S.notes >= u.costNotes;
      const enabled = !blocked && !owned && can && afford;
      const delta = actions.preview(S, s => actions.buyUpgrade(s, u.costInk !== undefined ? "ink" : "synergy", u.id));
      const tip = formatDeltaTip(delta.nps, delta.click);
      let reason = "";
      if (owned) reason = "Already purchased.";
      else if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!can) reason = "Requirement not met yet.";
      else if (!afford) reason = `Need ${fmtExact(u.costNotes, useSuffix)} Notes (${fmtExact(S.notes, useSuffix)}/${fmtExact(u.costNotes, useSuffix)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });

    document.querySelectorAll("button[data-iu]").forEach(btn=>{
      if (btn.closest('[id^="tab-"]')?.hidden) return;
      const u = INK_UPGRADES.find(x => x.id === btn.getAttribute("data-iu"));
      if (!u) return;
      const owned = !!S.inkUpgrades[u.id];
      const afford = S.ink >= u.costInk;
      const enabled = !blocked && !owned && afford;
      const delta = actions.preview(S, s => actions.buyUpgrade(s, u.costInk !== undefined ? "ink" : "synergy", u.id));
      const tip = formatDeltaTip(delta.nps, delta.click);
      let reason = "";
      if (owned) reason = "Already purchased.";
      else if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!afford) reason = `Need ${u.costInk} Ink (${fmtInt(S.ink || 0)}/${fmtInt(u.costInk)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });

    document.querySelectorAll("button[data-fup]").forEach(btn=>{
      if (btn.closest('[id^="tab-"]')?.hidden) return;
      const id = btn.getAttribute("data-fup");
      const f = getFacility(S.facility.currentId);
      const up = f?.upgrades?.find(x => x.id === id);
      if (!up) return;
      const owned = !!S.facility.purchasedUpgrades[id];
      const afford = canAffordPatrons(up.cost);
      const enabled = !blocked && !owned && afford;
      const delta = actions.preview(S, s => actions.buyVenueUpgrade(s, id));
      const tip = formatDeltaTip(delta.nps, delta.click);
      let reason = "";
      if (owned) reason = "Already purchased.";
      else if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!afford) reason = `Need ${up.cost} Patron(s) (${fmtInt(S.patrons || 0)}/${fmtInt(up.cost)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });

    document.querySelectorAll("button[data-fac]").forEach(btn=>{
      if (btn.closest('[id^="tab-"]')?.hidden) return;
      const id = btn.getAttribute("data-fac");
      const f = getFacility(id);
      if (!f) return;
      const next = nextLockedFacilityForState(S);
      const sequential = !!next && next.id === id;
      const afford = sequential && canAffordPatrons(f.patronCostToUnlock);
      const enabled = !blocked && afford;
      const delta = actions.preview(S, s => actions.buyVenue(s, id));
      const tip = formatDeltaTip(delta.nps, delta.click);
      let reason = "";
      if (blocked) reason = "Unavailable while tutorial or modal is open.";
      else if (!sequential) reason = "Unlock the current next venue first.";
      else if (!afford) reason = `Need ${f.patronCostToUnlock} Patron(s) (${fmtInt(S.patrons || 0)}/${fmtInt(f.patronCostToUnlock)}).`;
      setButtonState(btn, enabled, reason);
      setButtonEffectTip(btn, tip);
    });
  }

  // ---------- Render ----------
  function renderHUD(){
    const nps = totalNps();
    const npc = notesPerClick();
    const useSuffix = !!S.settings.abbrevLarge;

    $("#notesHud").textContent = fmtNotesHud(S.notes, useSuffix);
    $("#npsHud").textContent = fmtExact(nps, useSuffix);
    $("#npcHud").textContent = fmtExact(npc, useSuffix);
    $("#inkHud").textContent = fmtNotesHud(S.ink, useSuffix);
    $("#patronsHud").textContent = fmtPatronsHud(S.patrons);

    $("#bigNotes").textContent = `${fmtNotesHud(S.notes, useSuffix)} Notes`;
    $("#npsMini").textContent = fmtExact(nps, useSuffix);

    $("#inkBonusMini").textContent = `x${S.metaNpsMult.toFixed(3)}`;
    $("#patronBonusMini").textContent = `x${(1 + (S.patrons||0) * 0.05).toFixed(2)}`;

    $("#runNotesLine").textContent = `Run Notes: ${fmtNotesHud(S.runNotes || 0, useSuffix)}`;
    $("#lifetimeNotesLine").textContent = `Lifetime Notes: ${fmtNotesHud(S.lifetimeNotes, useSuffix)}`;

    const p = prestigePreview();
    $("#patronLine").textContent = `You have: ${S.patrons} Patron(s) • Take-a-bow Gain: +${p.gain}`;

    const rem = runNotesUntilNextPatron(S);
    $("#nextPatronInfo").textContent = `Next Patron in: ${fmtExact(rem, useSuffix)} Notes`;
    const prestigeRow = $("#prestigeRow");
    if (prestigeRow){
      const showPrestigeRow = (S.runNotes || 0) >= runNotesForPatrons(1);
      prestigeRow.hidden = !showPrestigeRow;
    }

    const st = currentStage();
    const markup = noteMarkup(st);
    for (const button of [$("#noteBtn"), $("#mQuickNoteBtn")]){
      if (button && button._noteMarkup !== markup){ button.innerHTML = markup; button._noteMarkup = markup; }
    }
    $("#batonTag").textContent = st.label;
    const mQuickNote = $("#mQuickNoteBtn");


    const timeStr = new Date().toLocaleString();
    const clock = $("#clock");
    if (clock) clock.textContent = timeStr;
    $("#statsClock").textContent = timeStr;
    const ac = $("#achClock");
    if (ac) ac.textContent = timeStr;
    $("#settingsClock").textContent = timeStr;
    const pc = $("#prestigeClock");
    if (pc) pc.textContent = timeStr;
  }

  function renderBatonShop(){
    const el = $("#batonShopList");
    if (!el) return;

    const useSuffix = !!S.settings.abbrevLarge;
    const owned = S.batonOwned || 0;
    const k = buyCountForMode(BATON_ITEM, S.buyMode);
    const qty = (k > 0) ? k : 1;
    const cost = (k > 0) ? sumCostForK(BATON_ITEM, k) : buildingCostAtOwned(BATON_ITEM, owned);
    const afford = (k > 0) && !isBlocked();
    const gain = actions.previewUnits(S, BATON_ITEM.id, S.buyMode).click;

    const row = document.createElement("div");
    row.className = "mini";
    row.setAttribute("data-baton-row", "true");
    row.innerHTML = `
      <div class="name">
        <div class="top">
          <b>${BATON_ITEM.name}</b>
          <span class="tag good">Owned: <span class="mono" data-baton-owned>${owned}</span></span>
        </div>
        <div class="muted smallSans">Each baton improves click power and grants Ink.</div>
        <div class="cost" id="batonGainLine" style="margin-top:4px;">+${fmtExact(gain, useSuffix)} Notes/click</div>
        <div class="muted smallSans mono" id="batonInkLine">+${qty} Ink</div>
      </div>
      <div class="right">
        <button class="primary" id="buyBatonBtn" ${afford ? "" : "disabled"}>${batonBuyLabel(S.buyMode, k)}</button>
        <div class="cost mono" id="batonCostLine">Cost: ${fmtExact(cost, useSuffix)} Notes</div>
      </div>
    `;

    beginRows(el);
    putRow(el, row, "baton");
    endRows(el);

  }

  function renderBatonUpgrades(){
    const el = $("#batonUpgradeList");
    beginRows(el);
    const useSuffix = !!S.settings.abbrevLarge;

    const bd = $("#batonDropdown");
    bd.open = !!S.ui.batonOpen;


    const ordered = BATON_UPGRADES.slice();
    const next = ordered.find(u => !hasBatonTechnique(S, u.id)) || null;
    const relevant = ordered.filter(u => hasBatonTechnique(S, u.id) || (next && u.id === next.id));

    for (const u of relevant){
      const owned = hasBatonTechnique(S, u.id);
      const unlocked = batonUpgradeUnlockedInState(S, u);
      const afford = S.notes >= u.costNotes;
      const tag = upgradeTagState({
        owned,
        unlocked,
        afford,
        ownedText: "Purchased",
        unlockedText: "Available",
        lockedText: "Locked"
      });

      const div = document.createElement("div");
      div.className = "mini" + (owned ? " purchased" : "");
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${u.name}${owned ? " ✅" : ""}</b>
            <span class="tag ${tag.cls}">${tag.text}</span>
          </div>
          <div class="muted smallSans">${u.desc}</div>
          ${
            owned ? "" : `<div class="muted smallSans mono" style="margin-top:4px;">Requires ${fmtInt(u.requireBatons || 0)} Batons</div>`
          }
        </div>
        <div class="right">
          <button data-bt="${u.id}" ${(!owned && unlocked && afford && !isBlocked()) ? "" : "disabled"}>Buy</button>
          <div class="cost mono">${fmtExact(u.costNotes, useSuffix)} Notes</div>
        </div>
      `;
      putRow(el, div, u.id);
    }


    endRows(el);
  }

  function renderFamilies(){
    const stack = $("#familyStack");
    beginRows(stack);
    const useSuffix = !!S.settings.abbrevLarge;

    const total = totalNps();

    for (const fam of FAMILY_ORDER){
      const famBuildings = BUILDINGS.filter(b => b.family === fam.id);
      if (famBuildings.length === 0) continue;

      const isOpen = (S.ui.familyOpen[fam.id] !== undefined) ? S.ui.familyOpen[fam.id] : fam.defaultOpen;

      let d = document.createElement("details");
      d.dataset.family = fam.id;
      d.open = !!isOpen;



      const ownedCount = famBuildings.reduce((a,b)=>a+(S.owned[b.id]||0),0);

      const famNps = effectiveFamilyNps(fam.id);
      const famPct = total > 0 ? (famNps / total) : 0;

      const ownedTag = `<span class="tag good">Owned: <span class="mono">${ownedCount}</span></span>`;
      const npsTag   = `<span class="tag">NPS: <span class="mono">${fmtExact(famNps, useSuffix)}</span> • <span class="mono">${fmtPct(famPct)}</span></span>`;

      d.innerHTML = `
        <summary>
          <span class="familyHeader">
            <span>${instrumentLabelFamily(fam.id)}</span>
            ${ownedTag}
            ${npsTag}
          </span>
          <span class="tag">${famBuildings.length} instruments</span>
        </summary>
        <div class="detailsBody">
          <div class="table" id="instList-${fam.id}"></div>
          <details class="dropdown" data-synfam="${fam.id}" ${(S.ui.synergyOpen[fam.id] ? "open" : "")}>
            <summary>
              <span>Section Synergies (Notes)</span>
              <span class="tag">${instrumentLabelFamily(fam.id)}</span>
            </summary>
            <div class="detailsBody">
              <div class="table" id="synList-${fam.id}"></div>
            </div>
          </details>
        </div>
      `;

      d = putRow(stack, d, fam.id);



      renderInstrumentsForFamily(fam.id);
      renderSynergyForFamily(fam.id);
    }
    endRows(stack);
  }

  function renderInstrumentsForFamily(familyId){
    const el = document.getElementById(`instList-${familyId}`);
    if (!el) return;
    beginRows(el);

    const useSuffix = !!S.settings.abbrevLarge;
    const buildings = BUILDINGS.filter(b=>b.family===familyId);

    const total = totalNps();

    for (const b of buildings){
      const owned = S.owned[b.id] || 0;
      const k = buyCountForMode(b, S.buyMode);
      const cost = (k > 0) ? sumCostForK(b, k) : buildingCostAtOwned(b, owned);
      const afford = (k > 0) && !isBlocked();

      let perEachBase = b.nps * (S.buildingMult[b.id]||1);
      const gainPerBuy = perEachBase * globalNpsMultiplierForState(S);
      const instNps = effectiveInstrumentNps(b);
      const instPct = total > 0 ? (instNps / total) : 0;

      const label = instrumentBuyLabel(S.buyMode, k);
      const perEachHover = `Produces ${fmtExact(perEachBase, useSuffix)} Notes/sec each (before multipliers)`;

      const instOpen = (S.ui.instrumentUpOpen[b.id] !== undefined) ? S.ui.instrumentUpOpen[b.id] : false;

      const row = document.createElement("div");
      row.className = "mini instrumentRow";
      row.setAttribute("data-inst-row", b.id);
      row.style.setProperty("--inst-art", `url("assets/instrument-${b.id}.png")`);
      row.innerHTML = `
        <div class="name">
          <div class="top">
            <b title="${perEachHover}">${b.name}</b>
            <span class="tag good">Owned: <span class="mono">${owned}</span></span>
            <span class="tag">NPS: <span class="mono">${fmtExact(instNps, useSuffix)}</span> • <span class="mono">${fmtPct(instPct)}</span></span>
          </div>
          <div class="muted smallSans mono">+${fmtExact(gainPerBuy, useSuffix)} Notes/sec per instrument</div>
          <div class="muted smallSans mono" data-buy-ink="${b.id}">${k>0 ? `+${k} Ink` : "+1 Ink"}</div>

          <details class="dropdown instrumentUpgrades" data-inst="${b.id}" ${instOpen ? "open" : ""} style="margin-top:10px;">
            <summary>
              <span>Upgrades (Notes)</span>
              <span class="tag">${b.name}</span>
            </summary>
            <div class="detailsBody">
              <div class="table" id="instUp-${b.id}"></div>
            </div>
          </details>
        </div>

        <div class="right">
          <button class="primary" data-buy="${b.id}" ${afford ? "" : "disabled"}>${label}</button>
          <div class="cost mono" data-buy-cost="${b.id}">Cost: ${fmtExact(cost, useSuffix)} Notes</div>
        </div>
      `;

      putRow(el, row, b.id);





      renderInstrumentUpgrades(b.id);
    }
    endRows(el);
  }

  function renderInstrumentUpgrades(buildingId){
    const el = document.getElementById(`instUp-${buildingId}`);
    if (!el) return;
    beginRows(el);

    const useSuffix = !!S.settings.abbrevLarge;
    const ordered = NOTE_UPGRADES
      .filter(u => u.buildingId === buildingId)
      .sort((a,b)=>a.requireOwned - b.requireOwned);
    const next = ordered.find(u => !S.noteUpgrades[u.id]) || null;
    const relevant = ordered.filter(u => S.noteUpgrades[u.id] || (next && u.id === next.id));

    if (relevant.length === 0){
      el.innerHTML = renderEmptyState("Full Upgraded!");
      return;
    }

    for (const u of relevant){
      const owned = !!S.noteUpgrades[u.id];
      const have = S.owned[u.buildingId] || 0;
      const unlocked = have >= u.requireOwned;
      const afford = S.notes >= u.costNotes;
      const enabled = (!owned && unlocked && afford && !isBlocked());
      const tag = upgradeTagState({
        owned,
        unlocked,
        afford,
        ownedText: "Purchased",
        unlockedText: "Available",
        lockedText: "Locked"
      });

      const div = document.createElement("div");
      if (owned){
        div.className = "mini purchased compactPurchased";
        div.innerHTML = `
          <div class="name">
            <div class="top">
              <b>${u.name} ✅</b>
            </div>
          </div>
        `;
      } else {
        div.className = "mini";
        div.innerHTML = `
          <div class="name">
            <div class="top">
              <b>${u.name}</b>
              <span class="tag ${tag.cls}">${tag.text}</span>
            </div>
            <div class="muted smallSans">${u.desc}</div>
          </div>
          <div class="right">
            <button data-nu="${u.id}" ${enabled ? "" : "disabled"}>Buy</button>
            <div class="cost mono">${fmtExact(u.costNotes, useSuffix)} Notes</div>
          </div>
        `;
      }
      putRow(el, div, u.id);
    }


    endRows(el);
  }

  function renderSynergyForFamily(familyId){
    const el = document.getElementById(`synList-${familyId}`);
    if (!el) return;
    beginRows(el);

    const useSuffix = !!S.settings.abbrevLarge;
    const list = SYNERGY_UPGRADES.filter(u => (u.families || []).includes(familyId));
    if (list.length === 0){
      el.innerHTML = renderEmptyState("No synergies for this family yet.");
      return;
    }

    for (const u of list){
      const owned = !!S.synergyUpgrades[u.id];
      const can = u.can(S);
      const afford = S.notes >= u.costNotes;
      const enabled = (!owned && can && afford && !isBlocked());
      const tag = upgradeTagState({
        owned,
        unlocked: can,
        afford,
        ownedText: "Purchased",
        unlockedText: "Available",
        lockedText: "Locked"
      });

      const div = document.createElement("div");
      div.className = "mini" + (owned ? " purchased" : "");
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${u.name}${owned ? " ✅" : ""}</b>
            <span class="tag ${tag.cls}">${tag.text}</span>
          </div>
          <div class="muted smallSans">${u.desc}</div>
        </div>
        <div class="right">
          <button data-syn="${u.id}" ${enabled ? "" : "disabled"}>Buy</button>
          <div class="cost mono">${fmtExact(u.costNotes, useSuffix)} Notes</div>
        </div>
      `;
      putRow(el, div, u.id);
    }


    endRows(el);
  }

  function renderInkUpgrades(){
    const el = $("#inkUpgradeList");
    beginRows(el);
    S.ui.inkTab = normalizeInkTab(S.ui.inkTab);
    syncInkTabButtons();
    const activeTab = S.ui.inkTab;
    const filtered = INK_UPGRADES.filter(u => inkUpgradeCategory(u) === activeTab);
    const unlockedInTab = filtered.reduce((n, u) => n + (S.inkUpgrades?.[u.id] ? 1 : 0), 0);

    const meta = document.createElement("div");
    meta.className = "muted smallSans";
    meta.style.margin = "0 2px 6px";
    meta.textContent = `${INK_TAB_LABELS[activeTab]} • ${unlockedInTab} / ${filtered.length} purchased`;
    putRow(el, meta, "category");

    for (const u of filtered){
      const owned = !!S.inkUpgrades[u.id];
      const afford = S.ink >= u.costInk;
      const enabled = (!owned && afford && !isBlocked());
      const tag = upgradeTagState({
        owned,
        unlocked: afford,
        afford,
        ownedText: "Purchased",
        unlockedText: "Available",
        lockedText: "Locked",
        lockedClass: ""
      });

      const div = document.createElement("div");
      div.className = "mini" + (owned ? " purchased" : "");
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${u.name}${owned ? " ✅" : ""}</b>
            <span class="tag ${tag.cls}">${tag.text}</span>
          </div>
          <div class="muted smallSans">${u.desc}</div>
        </div>
        <div class="right">
          <button data-iu="${u.id}" ${enabled ? "" : "disabled"}>Buy</button>
          <div class="cost mono">${u.costInk} Ink</div>
        </div>
      `;
      putRow(el, div, u.id);
    }


    endRows(el);
  }

  function renderFacility(){
    const current = getFacility(S.facility.currentId);
    $("#facilityName").textContent = current ? current.name : "—";
    $("#facilityDesc").textContent = current ? current.desc : "—";
    const preview = $("#facilityPreview");
    if (preview){
      const img = FACILITY_PREVIEW_IMAGE[S.facility.currentId] || FACILITY_PREVIEW_IMAGE.shed;
      preview.style.backgroundImage = `url("${img}")`;
      preview.setAttribute("aria-label", current ? `${current.name} venue preview` : "Current venue");
    }

    const fac = facilityMults(S);
    $("#facilityBonus").textContent = `Global: x${fac.nps.toFixed(2)} NPS • x${fac.click.toFixed(2)} Click`;

    $("#facilityPatrons").textContent = `Patrons (available): ${S.patrons}`;
    $("#facilityEarned").textContent = `Patrons (earned): ${S.patronsEver}`;

    $("#facilityUpgradesTag").textContent = current ? current.name : "—";
    const carry = facilityCarryBonusFromCurrent(S, S.facility.currentId);
    const nextFacility = nextLockedFacilityForState(S);
    const entry = nextFacility ? facilityEntryBonusFromCurrent(S, nextFacility.id) : null;
    const masteryPct = Math.round(carry.ratio * 100);
    $("#facilityNextTag").textContent = `Venues • Mastery ${masteryPct}%`;

    const fud = $("#facilityUpgradesDetails");
    fud.open = !!S.ui.facilityUpOpen;


    const fnd = $("#facilityNextDetails");
    fnd.open = !!S.ui.facilityNextOpen;


    const upEl = $("#facilityUpgradesList");
    beginRows(upEl);
    if (!current){
      upEl.innerHTML = renderEmptyState("No facility.");
    } else {
      for (const up of current.upgrades){
        const owned = !!S.facility.purchasedUpgrades[up.id];
        const afford = canAffordPatrons(up.cost);
        const enabled = (!owned && afford && !isBlocked());
        const tag = upgradeTagState({
          owned,
          unlocked: afford,
          afford,
          ownedText: "Purchased",
          unlockedText: "Available",
          lockedText: "Locked",
          lockedClass: ""
        });

        const div = document.createElement("div");
        div.className = "mini" + (owned ? " purchased" : "");
        div.innerHTML = `
          <div class="name">
          <div class="top">
              <b>${up.name}${owned ? " ✅" : ""}</b>
              <span class="tag ${tag.cls}">${tag.text}</span>
            </div>
          <div class="muted smallSans">${up.desc}</div>
        </div>
        <div class="right">
          <button data-fup="${up.id}" ${enabled ? "" : "disabled"}>Buy</button>
          <div class="cost mono">${up.cost} Patron(s)</div>
        </div>
      `;
        putRow(upEl, div, up.id);
      }

    }

    endRows(upEl);
    const nextEl = $("#facilityNextList");
    beginRows(nextEl);

    const currentIdx = FACILITIES.findIndex(f => f.id === S.facility.currentId);
    for (let i=0;i<FACILITIES.length;i++){
      const f = FACILITIES[i];
      if (S.facility.unlocked[f.id]) continue;
      if (currentIdx !== -1 && i < currentIdx) continue;

      const sequential = !!nextFacility && nextFacility.id === f.id;
      const afford = sequential && canAffordPatrons(f.patronCostToUnlock);
      const enabled = afford && !isBlocked();
      const stepBoost = sequential ? entry : null;
      const boosted = stepBoost
        ? {
            nps: f.globalMult.nps * stepBoost.nps,
            click: f.globalMult.click * stepBoost.click
          }
        : {
            nps: f.globalMult.nps,
            click: f.globalMult.click
          };
      const div = document.createElement("div");
      div.className = "mini";
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${f.name}</b>
            <span class="tag ${afford ? "warn" : ""}">${sequential ? (afford ? "Available" : "Locked") : "Later"}</span>
          </div>
          <div class="muted smallSans">${f.desc}</div>
          <div class="muted smallSans mono" style="margin-top:4px;">
            Base: x${f.globalMult.nps.toFixed(2)} NPS • x${f.globalMult.click.toFixed(2)} Click
          </div>
          <div class="muted smallSans mono" style="margin-top:4px;">
            ${sequential
              ? `With current mastery (${carry.owned}/${carry.total}) and venue chain: x${boosted.nps.toFixed(2)} NPS • x${boosted.click.toFixed(2)} Click`
              : `Unlock the previous venue first to reveal its inherited bonus`}
          </div>
        </div>
        <div class="right">
          <button data-fac="${f.id}" ${enabled ? "" : "disabled"}>Buy Venue</button>
          <div class="cost mono">${f.patronCostToUnlock} Patron(s)</div>
        </div>
      `;
      putRow(nextEl, div, f.id);
    }

    endRows(nextEl);
    if (nextEl.children.length === 0){
      nextEl.innerHTML = renderEmptyState("All venues unlocked (for now).");
    } else {

    }

    renderEndowmentPanel();
  }

  function renderStats(){
    const el = $("#statsList");
    el.innerHTML = "";
    const useSuffix = !!S.settings.abbrevLarge;

    const nps = totalNps();
    const npc = notesPerClick();

    const totalOwned = BUILDINGS.reduce((a,b)=>a+(S.owned[b.id]||0),0);
    const byFam = {};
    for (const fam of FAMILY_ORDER){
      byFam[fam.id] = BUILDINGS.filter(b=>b.family===fam.id).reduce((a,b)=>a+(S.owned[b.id]||0),0);
    }

    const p = prestigePreview();
    const fac = facilityMults(S);
    const currentFac = getFacility(S.facility.currentId);
    const st = currentStage();

    const rows = [
      { k:"Notes", v: fmtExact(S.notes, useSuffix) },
      { k:"Notes/sec", v: fmtExact(nps, useSuffix) },
      { k:"Notes/click", v: fmtExact(npc, useSuffix) },
      { k:"Run Notes", v: fmtExact(S.runNotes || 0, useSuffix) },
      { k:"Lifetime Notes", v: fmtExact(S.lifetimeNotes, useSuffix) },
      { k:"Ink (current)", v: fmtExact(S.ink, false) },
      { k:"Patrons (available)", v: fmtExact(S.patrons, false) },
      { k:"Patrons (earned)", v: fmtExact(S.patronsEver, false) },
      { k:"Take-a-bow preview", v: `Gain +${p.gain} (based on this run)` },
      { k:"Next Patron (run notes remaining)", v: fmtExact(runNotesUntilNextPatron(S), useSuffix) },
      { k:"Clicks (lifetime)", v: fmtExact(S.stats.clicks || 0, false) },
      { k:"Instruments owned (total)", v: fmtExact(totalOwned, false) },
      { k:"Owned: Woodwinds", v: fmtExact(byFam.Winds || 0, false) },
      { k:"Owned: Brass", v: fmtExact(byFam.Brass || 0, false) },
      { k:"Owned: Percussion", v: fmtExact(byFam.Perc || 0, false) },
      { k:"Owned: Strings", v: fmtExact(byFam.Strings || 0, false) },
      { k:"Owned: Other", v: fmtExact(byFam.Other || 0, false) },
      { k:"Facility", v: currentFac ? currentFac.name : "—" },
      { k:"Facility mults", v: `x${fac.nps.toFixed(2)} NPS • x${fac.click.toFixed(2)} Click` },
      { k:"Baton stage (visual)", v: `${st.label}` },
      { k:"Batons owned", v: `${fmtInt(S.batonOwned || 0)}` },
      { k:"Baton base click", v: `${batonBaseClick()}` },
      { k:"Baton click multiplier", v: `x${batonClickMult().toFixed(2)}` },
      { k:"Achievements", v: `${countPurchased(S.achievements)} / ${ACHIEVEMENTS.length}` },
      { k:"Achievement mults", v: `x${(S.achNpsMult || 1).toFixed(3)} NPS • x${(S.achClickMult || 1).toFixed(3)} Click` },
    ];

    for (const r of rows){
      const div = document.createElement("div");
      div.className = "mini";
      div.innerHTML = `
        <div class="name">
          <div class="top"><b>${r.k}</b></div>
          <div class="muted smallSans mono">${r.v}</div>
        </div>
        <div class="right">
          <span class="tag">Stats</span>
        </div>
      `;
      el.appendChild(div);
    }
  }

  function renderAchievements(){
    const el = $("#achievementsList");
    if (!el) return;
    el.innerHTML = "";

    const unlockedCount = ACHIEVEMENTS.reduce((n, a)=> n + (S.achievements?.[a.id] ? 1 : 0), 0);
    $("#achCountTag").textContent = `${unlockedCount} / ${ACHIEVEMENTS.length}`;
    $("#achBonusLine").textContent =
      `Bonuses: x${(S.achNpsMult || 1).toFixed(3)} Notes/sec • x${(S.achClickMult || 1).toFixed(3)} Click`;

    const categoryOrder = {
      "Core Milestones": 0,
      "Baton Progression": 1,
      "Ink & Archive": 2,
      "Synergies": 3,
      "Prestige & Venue": 4,
      "Section Sets": 5
    };
    const ordered = ACHIEVEMENTS.slice().sort((a, b) => {
      const ca = achievementCategory(a);
      const cb = achievementCategory(b);
      const oa = categoryOrder[ca] ?? 99;
      const ob = categoryOrder[cb] ?? 99;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name);
    });

    const catTotals = {};
    const catUnlocked = {};
    for (const a of ACHIEVEMENTS){
      const cat = achievementCategory(a);
      catTotals[cat] = (catTotals[cat] || 0) + 1;
      if (S.achievements?.[a.id]) catUnlocked[cat] = (catUnlocked[cat] || 0) + 1;
    }

    let currentCat = "";
    for (const a of ordered){
      const cat = achievementCategory(a);
      if (cat !== currentCat){
        currentCat = cat;
        const h = document.createElement("div");
        h.className = "achGroupLabel";
        h.innerHTML = `<span>${cat}</span><span class="tag">${catUnlocked[cat] || 0} / ${catTotals[cat] || 0}</span>`;
        el.appendChild(h);
      }

      const owned = !!S.achievements?.[a.id];
      const unlocked = !!a.unlocked(S);
      const status = upgradeTagState({
        owned,
        unlocked,
        afford: unlocked,
        ownedText: "Unlocked",
        unlockedText: "Available",
        lockedText: "Locked"
      });
      const div = document.createElement("div");
      div.className = "mini" + (owned ? " purchased" : "");
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${a.name}${owned ? " ✅" : ""}</b>
            <span class="tag ${status.cls}">${status.text}</span>
          </div>
          <div class="muted smallSans">${a.desc}</div>
          <div class="muted smallSans mono" style="margin-top:4px;">Bonus: ${achievementBonusText(a)}</div>
          ${owned ? "" : `<div class="muted smallSans mono" style="margin-top:2px;">Progress: ${a.progress(S)}</div>`}
        </div>
        <div class="right">
          <span class="tag">${a.kind === "click" ? "Click Bonus" : "NPS Bonus"}</span>
        </div>
      `;
      el.appendChild(div);
    }
  }

  function renderRecentUnlocks(){
    const el = $("#recentUnlocksList");
    if (!el) return;
    el.innerHTML = "";

    const list = S.recentUnlocks || [];
    if (list.length === 0){
      el.innerHTML = renderEmptyState("No unlocks yet.", "Achievements and upgrades will appear here.");
      return;
    }

    list.slice(0, 10).forEach(r=>{
      const div = document.createElement("div");
      div.className = "mini";
      div.innerHTML = `
        <div class="name">
          <div class="top">
            <b>${r.type}</b>
            <span class="tag good">Unlocked</span>
          </div>
          <div class="muted smallSans">${r.name}</div>
        </div>
        <div class="right">
          <div class="cost mono">${r.at || "—"}</div>
        </div>
      `;
      el.appendChild(div);
    });
  }

  function renderSettings(){
    $("#settingSuffix").checked = !!S.settings.abbrevLarge;
    const rm = $("#settingReduceMotion");
    const hc = $("#settingHighContrast");
    const dt = $("#settingDisableTooltips");
    if (rm) rm.checked = !!S.settings.reduceMotion;
    if (hc) hc.checked = !!S.settings.highContrast;
    if (dt) dt.checked = !!S.settings.disableTooltips;
    applyVisualSettings();
  }


  const screens = {refreshDynamicShopStates,renderHUD,renderBatonShop,renderBatonUpgrades,renderFamilies,renderInstrumentsForFamily,renderInstrumentUpgrades,renderSynergyForFamily,renderInkUpgrades,renderFacility,renderStats,renderAchievements,renderRecentUnlocks,renderSettings};
  return Object.fromEntries(Object.entries(screens).map(([name,fn])=>[name,(...args)=>{
    S = context.getState(); return fn(...args);
  }]));
}
window.ScoreRender = {
  createScreens,
  beginRows, putRow, endRows, updateHTML,
  fmtSig4Suffix,
  fmtNotesHud,
  fmtExact,
  fmtPatronsHud,
  fmtPct,
  renderEmptyState,
  formatDeltaTip,
  upgradeTagState,
  setButtonState,
  setButtonEffectTip,
  buyModeTarget,
  instrumentBuyLabel,
  batonBuyLabel
};
})();
