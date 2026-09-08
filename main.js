const {
  NOTE_STAGES,
  BATON_ITEM,
  BATON_UPGRADES,
  ENDGAME_LIBRARY_UNLOCK,
  hasBatonTechnique,
  batonUpgradeUnlockedInState,
  BUILDINGS,
  FAMILY_ORDER,
  NOTE_UPGRADES,
  ACHIEVEMENTS,
  SYNERGY_UPGRADES,
  INK_UPGRADES,
  FACILITIES,
  FACILITY_PREVIEW_IMAGE,
  getFacility,
  countPurchased,
} = window.ScoreData || {};

const {
  fmtNotesHud,
  fmtExact,
  fmtPatronsHud,
  fmtPct,
  renderEmptyState,
  formatDeltaTip,
  upgradeTagState,
  setButtonState,
  setButtonEffectTip,
  instrumentBuyLabel,
  batonBuyLabel,
} = window.ScoreRender || {};

const {
  buildingCostAtOwned: buildingCostAtOwnedCore,
  sumCostForK: sumCostForKCore,
  buyCountForMode: buyCountForModeCore,
  batonBaseClickForState: batonBaseClickForStateCore,
  batonClickMultForState: batonClickMultForStateCore,
  globalNpsMultiplierForState: globalNpsMultiplierForStateCore,
  baseInstrumentNpsForState: baseInstrumentNpsForStateCore,
  totalNpsForState: totalNpsForStateCore,
  notesPerClickForState: notesPerClickForStateCore,
} = window.ScoreEconomy || {};

const {
  SAVE_KEY,
  LEGACY_SAVE_KEYS,
  createDefaultState,
  loadState,
  saveState,
  clearSaveState,
} = window.ScoreState || {};

const {
  wireNoteButtonOnce: wireNoteButtonOnceCore,
} = window.ScoreUIEvents || {};

const {
  ensureLibraryState: ensureLibraryStateCore,
  renderLibrary: renderLibraryCore,
  stopPlayback: stopLibraryPlaybackCore,
  bindUI: bindLibraryUICore,
} = window.ScoreLibrary || {};

  // iOS Safari: prevent double-tap zoom on the main click target
  (() => {
    const btn = document.getElementById("noteBtn");
    if (!btn) return;

    let lastTouchEnd = 0;
    btn.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });
  })();

  // Safari/WebKit compositing bug: force a one-time repaint after first paint
  (function repaintKick(){
    const kick = () => {
      document.body.classList.add("repaint-kick");
      void document.body.offsetHeight;
      requestAnimationFrame(() => document.body.classList.remove("repaint-kick"));
    };
    window.addEventListener("load", kick, { once: true });
  })();

  // Disable browser context menu on the game page.
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

(() => {
  // ---------- Utilities ----------
  const $ = (sel)=>document.querySelector(sel);
  const $$ = (sel)=>Array.from(document.querySelectorAll(sel));
  const now = ()=>Date.now();
  const fmtInt = (n) => Math.floor(Math.max(0, n || 0)).toLocaleString();

  let lastSaveAttempt = 0;
  let libraryUI = null;
  const toastRegistry = new Map();
  function toast(msg, opts = {}){
    const wrap = $("#toast");
    if (!wrap) return;

    const key = opts.key || null;
    const ttl = Math.max(900, opts.ttl ?? 2200);
    const fadeMs = Math.max(180, Math.min(500, opts.fadeMs ?? 320));
    const maxStack = window.matchMedia("(max-width: 980px)").matches ? 2 : 4;

    let t = key ? toastRegistry.get(key)?.el : null;
    if (!t){
      t = document.createElement("div");
      t.className = "t";
      wrap.appendChild(t);
      if (key) toastRegistry.set(key, { el: t, fadeTimer: null, removeTimer: null });
    }

    t.textContent = msg;
    t.style.opacity = "1";
    t.style.transform = "translateY(0)";
    t.style.transition = "";

    const rec = key ? toastRegistry.get(key) : { el: t, fadeTimer: null, removeTimer: null };
    if (rec.fadeTimer) clearTimeout(rec.fadeTimer);
    if (rec.removeTimer) clearTimeout(rec.removeTimer);

    rec.fadeTimer = setTimeout(()=>{
      t.style.opacity = "0";
      t.style.transform = "translateY(4px)";
      t.style.transition = `all ${fadeMs}ms ease`;
    }, Math.max(200, ttl - fadeMs));

    rec.removeTimer = setTimeout(()=>{
      if (key && toastRegistry.get(key)?.el === t) toastRegistry.delete(key);
      if (t.parentNode) t.remove();
    }, ttl);

    if (key) toastRegistry.set(key, rec);

    while (wrap.children.length > maxStack){
      const first = wrap.firstElementChild;
      if (!first) break;
      for (const [k, v] of toastRegistry.entries()){
        if (v.el === first){
          if (v.fadeTimer) clearTimeout(v.fadeTimer);
          if (v.removeTimer) clearTimeout(v.removeTimer);
          toastRegistry.delete(k);
          break;
        }
      }
      first.remove();
    }
  }

  // ---------- Real Note Art (from /assets) ----------
  function currentStage(){
    const idx = Math.max(0, Math.min(NOTE_STAGES.length-1, S.noteStageIdx || 0));
    return NOTE_STAGES[idx];
  }

  function noteMarkup(stage){
    const src = stage?.img || "assets/note-whole.png";
    const alt = stage?.label || "Note";
    return `<img class="noteImg" src="${src}" alt="${alt}" draggable="false">`;
  }

  function batonBaseClick(){
    return batonBaseClickForState(S);
  }

  function batonClickMult(){
    return batonClickMultForState(S);
  }

  function canAffordPatrons(cost){ return (S.patrons || 0) >= cost; }

  function unlockFacility(id){
    if (isBlocked()) return;
    actions.advanceTo(S, now(), false);
    const result = actions.buyVenue(S, id);
    if (!result.ok) return;
    addRecentUnlock("Venue", result.name);
    toast(`Venue: ${result.name} (Inherited x${result.entry.nps.toFixed(2)} NPS • x${result.entry.click.toFixed(2)} Click)`);
    save(false); renderAll();
  }
  function buyFacilityUpgrade(id){
    if (isBlocked()) return;
    actions.advanceTo(S, now(), false);
    const result = actions.buyVenueUpgrade(S, id);
    if (!result.ok) return;
    addRecentUnlock("Facility", result.name);
    toast("Facility: " + result.name);
    save(false); renderAll();
  }
  function finishEndowmentAndReset(){
    const result = actions.endowment(S, now());
    if (!result.ok) return;
    S = result.state;
    if (stopLibraryPlaybackCore) stopLibraryPlaybackCore();
    setTab("start"); save(false); renderAll();
    toast(`Endowment gained: +${fmtInt(result.gain)}. The Music Library is now open.`);
  }
  function offerPatronsToEndowment(){
    if (isBlocked()) return;
    if (isLibraryUnlocked(S)) return;
    if (!canStartEndowment(S)){
      toast("The Endowment Rite is not ready yet.");
      return;
    }
    const gain = endowmentGainFromPatrons(S.patrons || 0);
    if (gain <= 0){
      toast(`Need ${fmtInt(ENDOWMENT_BASE_PATRONS)} held Patrons to gain an Endowment.`);
      return;
    }
    const ok = confirm(
      `Establishing an Endowment will reset Notes, Ink, Patrons, Facilities, and your current run.\n` +
      `You will gain +${fmtInt(gain)} Endowment.\n` +
      `Music Library access will remain unlocked.\n\nProceed?`
    );
    if (!ok) return;
    finishEndowmentAndReset(gain);
  }

  function renderEndowmentPanel(){
    const panel = $("#endowmentPanel");
    if (!panel) return;

    const titleEl = $("#endowmentTitle");
    const bodyEl = $("#endowmentBody");
    const progressEl = $("#endowmentProgress");
    const costEl = $("#endowmentCostLine");
    const offerBtn = $("#endowmentOfferBtn");

    const canSee = hasFinalVenueUnlocked(S) && !isLibraryUnlocked(S);
    panel.hidden = !canSee;
    if (!canSee) return;

    const fullUp = finalVenueFullyUpgraded(S);
    const hasPatrons = (S.patrons || 0) >= ENDOWMENT_REQUIRED_PATRONS;
    const unlocked = fullUp && hasPatrons;
    const gain = endowmentGainFromPatrons(S.patrons || 0);
    const nextGainPatrons = patronsForEndowmentGain(gain + 1);

    if (unlocked && !S.ui.endowmentReadyShown && !libraryMysteryOverlay.classList.contains("show")){
      showEndowmentReadyReveal();
    }

    panel.classList.toggle("locked", !unlocked);
    panel.classList.toggle("ready", unlocked);

    if (titleEl){
      titleEl.textContent = unlocked ? "Endowment" : "Unknown Patron Rite";
    }
    if (bodyEl){
      if (unlocked){
        bodyEl.innerHTML =
          `This is your double-prestige. Convert your <b>currently held Patrons</b> into Endowment, ` +
          `reset all the way to the start, and keep the Music Library unlocked forever.`;
      } else {
        bodyEl.innerHTML =
          `A hidden process is sealed here. Fully upgrade <b>${getFacility(FINAL_FACILITY_ID)?.name || "the final venue"}</b> and hold at least ` +
          `<b>${fmtInt(ENDOWMENT_REQUIRED_PATRONS)}</b> Patrons to reveal it.`;
      }
    }
    if (progressEl){
      progressEl.textContent = unlocked
        ? `Held Patrons: ${fmtInt(S.patrons || 0)} • Endowment gain: +${fmtInt(gain)} • Total Endowment: ${fmtInt(S.library?.endowments || 0)}`
        : `Held Patrons: ${fmtInt(S.patrons || 0)} / ${fmtInt(ENDOWMENT_REQUIRED_PATRONS)} • Total Endowment: ${fmtInt(S.library?.endowments || 0)}`;
    }
    if (costEl){
      costEl.textContent = unlocked
        ? `Next +1 Endowment at ${fmtInt(nextGainPatrons)} held Patrons`
        : `Need ${fmtInt(ENDOWMENT_REQUIRED_PATRONS)} held Patrons`;
    }
    if (offerBtn){
      offerBtn.textContent = "Establish Endowment";
      const enabled = unlocked && gain > 0 && !isBlocked();
      let reason = "";
      if (!unlocked) reason = "Reveal requirements not met yet.";
      else if (gain <= 0) reason = `Need ${fmtInt(ENDOWMENT_BASE_PATRONS)} held Patrons.`;
      setButtonState(offerBtn, enabled, reason);
    }
  }

  // ---------- Prestige (Patrons reset ladder each run) ----------
  const actions = window.ScoreActions.createGameActions(window.ScoreData, window.ScoreEconomy, window.ScoreState);
  const { facilityUpgradeProgress, facilityCarryBonusFromCurrent, nextLockedFacilityForState,
    facilityEntryBonusFromCurrent, facilityBaseMultForState, facilityMults, patronBonus,
    FINAL_FACILITY_ID, ENDOWMENT_REQUIRED_PATRONS, ENDOWMENT_BASE_PATRONS,
    endowmentGainFromPatrons, patronsForEndowmentGain, patronsFromRun, runNotesForPatrons,
    runNotesUntilNextPatron } = actions.rules;
  const isLibraryUnlocked = (s = S) => actions.rules.isLibraryUnlocked(s);
  const hasFinalVenueUnlocked = (s = S) => actions.rules.hasFinalVenueUnlocked(s);
  const finalVenueFullyUpgraded = (s = S) => actions.rules.finalVenueFullyUpgraded(s);
  const canStartEndowment = (s = S) => actions.rules.canStartEndowment(s);

  function prestigePreview(){
    const wouldEarnThisRun = patronsFromRun(S.runNotes || 0);
    const gain = Math.max(0, wouldEarnThisRun);
    return { wouldEarnThisRun, gain };
  }

  function confirmPrestige(gain){
    const firstPrompt = !S.ui.firstPrestigePromptShown && (S.patronsEver || 0) === 0;
    if (firstPrompt){
      S.ui.firstPrestigePromptShown = true;
      if (gain < 10){
        return confirm(
          `I would wait until your Patrons can have a bigger impact before taking a bow.\n\n` +
          `You would gain +${gain} Patron(s) right now.\n` +
          `Ink, Archive upgrades, and Facilities persist.\n\n` +
          `Take a bow anyway?`
        );
      }
      return confirm(
        `First Take-a-bow check:\n\n` +
        `You will gain +${gain} Patron(s).\n` +
        `This resets Notes, instruments, NOTE-upgrades, Synergies, and Conducting Skills.\n` +
        `Ink, Archive upgrades, and Facilities persist.\n\n` +
        `Proceed?`
      );
    }

    return confirm(
      `“Take a bow” will reset your run (Notes, instruments, NOTE-upgrades, Synergies, Conducting Skills).\n` +
      `You keep Ink + Archive upgrades + Facilities.\n\n` +
      `You will gain +${gain} Patron(s).\n\nProceed?`
    );
  }

  function doPrestige(){
    if (isBlocked()) return;
    actions.advanceTo(S, now(), false);

    const { gain } = prestigePreview();
    if (gain <= 0){
      toast("No new Patrons yet. Keep composing.");
      return;
    }
    const ok = confirmPrestige(gain);
    actions.advanceTo(S, now(), true);
    if (!ok) return;
    const result = actions.prestige(S);
    if (!result.ok) return;

    toast(`You gained ${gain} Patron(s).`);
    save(false);
    setPrestigeTabVisibility();
    setLibraryTabVisibility();
    setTab("prestige");
    renderAll();
    maybeShowLibraryMysteryAfterPrestige();
  }

  // ---------- State ----------

  function load(){
    return loadState(
      localStorage,
      SAVE_KEY,
      LEGACY_SAVE_KEYS,
      createDefaultState,
      BUILDINGS,
      (s) => batonClickMultForState(s),
      now
    );
  }

  let S = load();
  if (ensureLibraryStateCore) ensureLibraryStateCore(S);
  checkAchievements(false);

  function save(showToast=true){
    lastSaveAttempt = now();
    const result = saveState(localStorage, SAVE_KEY, S, now);
    showSaveStatus(result.ok ? "" : result.message);
    if (showToast && result.ok) toast("Saved.");
    return result.ok;
  }
  function showSaveStatus(message){
    const el = $("#saveStatus");
    if (el){ el.hidden = !message; el.textContent = message; }
  }
  // ---------- Tutorial / Overlays ----------
  const tutOverlay = $("#tutorialOverlay");
  const tutVeil = $("#tutorialVeil");
  const prestigeExplainOverlay = $("#prestigeExplainOverlay");
  const libraryMysteryOverlay = $("#libraryMysteryOverlay");
  const libraryMysteryTitle = $("#libraryMysteryTitle");
  const libraryMysteryMsg = $("#libraryMysteryMsg");
  const coachTip = $("#coachTip");
  const coachTipTitle = $("#coachTipTitle");
  const coachTipMsg = $("#coachTipMsg");
  const PICCOLO = BUILDINGS.find(b => b.id === "piccolo");
  function nextPiccoloCostForState(s){
    if (!PICCOLO) return 0;
    return buildingCostAtOwned(PICCOLO, s.owned?.piccolo || 0);
  }

  const COACH_STEPS = [
    {
      title: "Buy Your First Baton",
      msg: () => `Click the note until you can afford a Baton (${fmtExact(buildingCostAtOwned(BATON_ITEM, S.batonOwned || 0), !!S.settings.abbrevLarge)} Notes).`,
      target: "#noteBtn",
      completeWhen: (s) => (s.notes || 0) >= buildingCostAtOwned(BATON_ITEM, s.batonOwned || 0),
      advanceOnOk: false
    },
    {
      title: "Buy A Baton",
      msg: "Buy your first Baton to raise click power and gain Ink.",
      target: "#buyBatonBtn",
      completeWhen: (s) => (s.batonOwned || 0) >= 1,
      advanceOnOk: false
    },
    {
      title: "Save For Piccolo",
      msg: () => {
        const cost = nextPiccoloCostForState(S);
        if ((S.notes || 0) >= cost){
          return "Great, you can afford one now. Buy your first Piccolo.";
        }
        return `Click the note until you can afford your first Piccolo (${fmtExact(cost, !!S.settings.abbrevLarge)} Notes).`;
      },
      target: (s) => ((s.notes || 0) >= nextPiccoloCostForState(s) ? 'button[data-buy="piccolo"]' : "#noteBtn"),
      ensure: () => {
        S.ui.familyOpen.Winds = true;
        renderFamilies();
      },
      completeWhen: (s) => (s.owned?.piccolo || 0) >= 1,
      advanceOnOk: false
    },
    {
      title: "Choose Your Play Style",
      msg: "From here, spend notes how you want: focus on active clicking and baton growth, focus on idle instruments, or mix both styles. Keep going until you reach enough notes to prestige, then the next tooltip will appear.",
      target: "#noteBtn",
      completeWhen: () => false,
      advanceOnOk: true
    }
  ];

  let coachTargetSelector = null;
  function clearCoachHighlight(){
    $$(".tip-highlight").forEach(el => el.classList.remove("tip-highlight"));
  }
  function setCoachHighlight(selector){
    clearCoachHighlight();
    const el = selector ? $(selector) : null;
    if (!el) return null;
    el.classList.add("tip-highlight");
    return el;
  }
  function hideCoachTip(){
    if (coachTip) coachTip.hidden = true;
    coachTargetSelector = null;
    clearCoachHighlight();
  }
  function coachTooltipsEnabled(){
    return !!S.ui.hasStarted &&
      !!S.ui.tutorialCompleted &&
      !S.settings.disableTooltips &&
      !S.ui.tooltipsDone &&
      S.ui.tab === "main" &&
      !tutOverlay.classList.contains("show") &&
      !prestigeExplainOverlay.classList.contains("show");
  }
  function maybeShowCoachTip(){
    if (!coachTooltipsEnabled()){
      hideCoachTip();
      return;
    }

    let idx = S.ui.tooltipStep || 0;
    while (idx < COACH_STEPS.length && COACH_STEPS[idx].completeWhen(S)){
      idx++;
      S.ui.tooltipStep = idx;
      S.ui.tooltipAckStep = -1;
    }
    if (idx >= COACH_STEPS.length){
      S.ui.tooltipsDone = true;
      hideCoachTip();
      save(false);
      return;
    }
    const step = COACH_STEPS[idx];
    if (!step) return;

    if (S.ui.tooltipAckStep === idx){
      hideCoachTip();
      return;
    }

    if (step.ensure) step.ensure();
    const stepTarget = (typeof step.target === "function") ? step.target(S) : step.target;
    coachTargetSelector = stepTarget;
    const targetEl = setCoachHighlight(stepTarget);
    if (targetEl?.scrollIntoView){
      targetEl.scrollIntoView({ behavior: S.settings.reduceMotion ? "auto" : "smooth", block:"center", inline:"center" });
    }

    coachTipTitle.textContent = step.title;
    coachTipMsg.textContent = (typeof step.msg === "function") ? step.msg() : step.msg;
    coachTip.hidden = false;
  }

  function isBlocked(){
    // IMPORTANT: while on start screen, game is blocked
    if (!S.ui.hasStarted) return true;
    return !!S.ui.blocked ||
      tutOverlay.classList.contains("show") ||
      prestigeExplainOverlay.classList.contains("show") ||
      libraryMysteryOverlay.classList.contains("show");
  }

  function clearHighlight(){
    // IMPORTANT: ONLY remove tutorial-highlight
    // Never remove any base classes like "noteBtn" (that caused the square button bug).
    $$(".tutorial-highlight").forEach(el => el.classList.remove("tutorial-highlight"));
  }

  function setSpotlightRect(x, y, w, h, r){
    tutVeil.style.setProperty("--tx", `${Math.round(x)}px`);
    tutVeil.style.setProperty("--ty", `${Math.round(y)}px`);
    tutVeil.style.setProperty("--tw", `${Math.round(w)}px`);
    tutVeil.style.setProperty("--th", `${Math.round(h)}px`);
    tutVeil.style.setProperty("--tr", `${Math.round(r)}px`);
  }

  function setSpotlightToElement(el){
    if (!tutVeil) return;
    if (!el){
      const w = 240;
      const h = 140;
      const x = (window.innerWidth - w) / 2;
      const y = (window.innerHeight - h) / 2;
      setSpotlightRect(x, y, w, h, 28);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = 12;

    let x = r.left - pad;
    let y = r.top - pad;
    let w = r.width + pad * 2;
    let h = r.height + pad * 2;

    x = Math.max(8, x);
    y = Math.max(8, y);
    w = Math.max(24, Math.min(w, window.innerWidth - x - 8));
    h = Math.max(24, Math.min(h, window.innerHeight - y - 8));

    const cs = getComputedStyle(el);
    const rawRadius = parseFloat(cs.borderTopLeftRadius) || 14;
    const rad = Math.min(Math.max(rawRadius + 12, 24), Math.min(w, h) / 2);

    setSpotlightRect(x, y, w, h, rad);
  }

  function highlight(selector){
    clearHighlight();
    const el = $(selector);
    if (!el) return null;
    el.classList.add("tutorial-highlight");
    setSpotlightToElement(el);
    return el;
  }

  // Keep spotlight aligned on scroll/resize while tutorial is visible
  let spotlightTargetSelector = null;
  function updateSpotlightFromSelector(){
    if (!spotlightTargetSelector) return;
    const el = $(spotlightTargetSelector);
    if (!el) return;
    setSpotlightToElement(el);
  }
  window.addEventListener("resize", ()=> {
    if (!tutOverlay.classList.contains("show")) return;
    updateSpotlightFromSelector();
  }, { passive:true });
  window.addEventListener("scroll", ()=> {
    if (!tutOverlay.classList.contains("show")) return;
    updateSpotlightFromSelector();
  }, { passive:true });

  const TUTORIAL_STEPS = [
    {
      title: "Click the large note",
      msg: "Click the large whole note to gain Notes.",
      target: "#noteBtn",
      ensure: () => {}
    },
    {
      title: "Buy Batons",
      msg: "Batons increase your base click power and each Baton also grants +1 Ink.",
      target: "[data-baton-row='true']",
      ensure: () => {}
    },
    {
      title: "Upgrade your conducting",
      msg: "Conducting Skills unlock in order as you buy more Batons. They multiply click power and change the note symbol.",
      target: "#batonDropdown summary",
      ensure: () => { $("#batonDropdown").open = true; }
    },
    {
      title: "Start automatic production",
      msg: "Purchase instruments (start with Piccolo) to begin producing Notes every second.",
      target: "[data-inst-row='piccolo']",
      ensure: () => {
        const pic = BUILDINGS.find(b => b.id === "piccolo");
        if (!pic) return;
        S.ui.familyOpen[pic.family] = true;
        renderFamilies();
      }
    },
    {
      title: "Ink is permanent",
      msg: "Every instrument you purchase gives Ink. Use Ink to buy permanent Archive Upgrades.",
      target: "#inkDropdown summary",
      ensure: () => { $("#inkDropdown").open = true; }
    }
  ];

  function setTutorialScrollLock(locked){
    document.documentElement.classList.toggle("tutorial-lock", !!locked);
    document.body.classList.toggle("tutorial-lock", !!locked);
  }
  function setTutorialRepositioning(isRepositioning){
    if (!tutVeil) return;
    tutVeil.classList.toggle("repositioning", !!isRepositioning);
  }

  function showTutorial(){
    actions.advanceTo(S, now(), isBlocked());
    // FORCE tutorial to run on Main screen
    setTab("main");
    setTutorialScrollLock(true);
    tutOverlay.classList.add("show");
    tutOverlay.setAttribute("aria-hidden","false");
    advanceTutorial(0, true);
  }
  function hideTutorial(){
    actions.advanceTo(S, now(), isBlocked());
    tutOverlay.classList.remove("show");
    tutOverlay.setAttribute("aria-hidden","true");
    setTutorialScrollLock(false);
    setTutorialRepositioning(false);
    clearHighlight();
    spotlightTargetSelector = null;
    setSpotlightToElement(null);
  }

  function advanceTutorial(stepDelta=1, absolute=false){
    const max = TUTORIAL_STEPS.length;
    if (absolute) S.ui.tutorialStep = stepDelta;
    else S.ui.tutorialStep = (S.ui.tutorialStep || 0) + stepDelta;

    if (S.ui.tutorialStep >= max){
      S.ui.tutorialCompleted = true;
      S.ui.tutorialStep = 0;
      hideTutorial();
      save(false);
      renderAll();
      return;
    }

    const step = TUTORIAL_STEPS[S.ui.tutorialStep];
    if (!step) return;

    // Ensure main is visible for targets
    setTab("main");
    renderAll();
    step.ensure();

    $("#tutTitle").textContent = step.title;
    $("#tutMsg").textContent = step.msg;

    spotlightTargetSelector = step.target;
    setTutorialRepositioning(true);

    requestAnimationFrame(() => {
      step.ensure();
      clearHighlight();

      const targetEl = $(step.target);
      if (!targetEl){
        setTutorialRepositioning(false);
        setSpotlightToElement(null);
        return;
      }

      const behavior = S.settings.reduceMotion ? "auto" : "smooth";

      // Scroll first, then reveal the spotlight to avoid a visible "snap" from stale coordinates.
      if (targetEl.scrollIntoView){
        targetEl.scrollIntoView({ behavior, block:"center", inline:"center" });
      }

      const finalizeSpotlight = () => {
        highlight(step.target);
        updateSpotlightFromSelector();
        setTutorialRepositioning(false);
      };

      if (behavior === "smooth"){
        setTimeout(finalizeSpotlight, 260);
      } else {
        requestAnimationFrame(finalizeSpotlight);
      }
    });

    save(false);
  }

  function showPrestigeExplain(){
    actions.advanceTo(S, now(), isBlocked());
    S.ui.blocked = true;
    prestigeExplainOverlay.classList.add("show");
    prestigeExplainOverlay.setAttribute("aria-hidden","false");
    save(false);
  }
  function hidePrestigeExplain(){
    actions.advanceTo(S, now(), isBlocked());
    prestigeExplainOverlay.classList.remove("show");
    prestigeExplainOverlay.setAttribute("aria-hidden","true");
    S.ui.blocked = false;
    save(false);
  }

  function showLibraryOverlay(title, htmlMessage){
    actions.advanceTo(S, now(), isBlocked());
    if (!libraryMysteryOverlay) return;
    if (libraryMysteryTitle) libraryMysteryTitle.textContent = title;
    if (libraryMysteryMsg) libraryMysteryMsg.innerHTML = htmlMessage;
    S.ui.blocked = true;
    libraryMysteryOverlay.classList.add("show");
    libraryMysteryOverlay.setAttribute("aria-hidden","false");
    save(false);
  }

  function showLibraryMystery(){
    showLibraryOverlay(
      "A Whispered Opportunity",
      `Patrons are looking for a way to secure the orchestra forever.<br/><br/>` +
      `When the <b>${getFacility(FINAL_FACILITY_ID)?.name || "final venue"}</b> is fully upgraded and you hold at least <b>${fmtInt(ENDOWMENT_REQUIRED_PATRONS)}</b> Patrons, ` +
      `a hidden Endowment Rite can begin.<br/><br/>` +
      `Current progress: ${fmtInt(S.patrons || 0)} / ${fmtInt(ENDOWMENT_REQUIRED_PATRONS)} held Patrons`
    );
    S.ui.libraryForeshadowShown = true;
    save(false);
  }

  function showEndowmentReadyReveal(){
    const gain = endowmentGainFromPatrons(S.patrons || 0);
    showLibraryOverlay(
      "The Endowment Awakes",
      `Your patrons are ready.<br/><br/>` +
      `You can now perform a double-prestige in the Prestige Hall and convert held Patrons into Endowment.<br/><br/>` +
      `Current result: <b>+${fmtInt(gain)}</b> Endowment.`
    );
    S.ui.endowmentReadyShown = true;
    save(false);
  }

  function hideLibraryMystery(){
    actions.advanceTo(S, now(), isBlocked());
    if (!libraryMysteryOverlay) return;
    libraryMysteryOverlay.classList.remove("show");
    libraryMysteryOverlay.setAttribute("aria-hidden","true");
    S.ui.blocked = false;
    save(false);
  }

  function maybeShowLibraryMysteryAfterPrestige(){
    if (isLibraryUnlocked(S)) return;
    if (!hasFinalVenueUnlocked(S)) return;
    if (S.ui.libraryForeshadowShown) return;
    showLibraryMystery();
  }

  $("#startBtn").addEventListener("click", ()=>{
    S.ui.hasStarted = true;
    const resumeTab = (S.ui.lastTab && S.ui.lastTab !== "start") ? S.ui.lastTab : "main";
    if (!S.ui.tutorialCompleted){
      showTutorial();
    } else {
      setTab(resumeTab);
      hideTutorial();
    }
    save(false);
    renderAll();
  });

  $("#tutNextBtn").addEventListener("click", ()=> advanceTutorial(1,false));
  $("#tutSkipBtn").addEventListener("click", ()=>{
    S.ui.tutorialCompleted = true;
    S.ui.tutorialStep = 0;
    hideTutorial();
    save(false);
    renderAll();
  });
  $("#coachTipOkBtn").addEventListener("click", ()=>{
    const idx = S.ui.tooltipStep || 0;
    const step = COACH_STEPS[idx];
    if (step?.advanceOnOk){
      S.ui.tooltipStep = idx + 1;
      S.ui.tooltipAckStep = -1;
    } else {
      S.ui.tooltipAckStep = idx;
    }
    save(false);
    renderAll();
  });
  $("#coachTipDisableBtn").addEventListener("click", ()=>{
    S.ui.tooltipStep = (S.ui.tooltipStep || 0) + 1;
    S.ui.tooltipAckStep = -1;
    if ((S.ui.tooltipStep || 0) >= COACH_STEPS.length){
      S.ui.tooltipsDone = true;
    }
    save(false);
    renderAll();
  });

  $("#prestigeExplainOkBtn").addEventListener("click", ()=>{
    S.ui.prestigeExplained = true;
    hidePrestigeExplain();
    save(false);
    renderAll();
  });
  $("#prestigeExplainGoHallBtn").addEventListener("click", ()=>{
    S.ui.prestigeExplained = true;
    hidePrestigeExplain();
    S.ui.hasPrestiged = true;
    setPrestigeTabVisibility();
    setTab("prestige");
    renderAll();
  });
  $("#libraryMysteryOkBtn").addEventListener("click", ()=>{
    hideLibraryMystery();
    renderAll();
  });

  function setPrestigeTabVisibility(){
    const show = !!S.ui.hasPrestiged || (S.patronsEver || 0) > 0;
    const btn = $("#prestigeTabBtn");
    btn.hidden = !show;
  }

  function setLibraryTabVisibility(){
    const btn = $("#libraryTabBtn");
    if (!btn) return;

    if (isLibraryUnlocked(S)){
      btn.hidden = false;
      btn.disabled = false;
      btn.classList.remove("mysteryTab");
      btn.textContent = "Music Library";
      btn.title = "";
      return;
    }

    if (hasFinalVenueUnlocked(S)){
      btn.hidden = false;
      btn.disabled = true;
      btn.classList.add("mysteryTab");
      btn.textContent = "?";
      btn.title = `??? Reach ${fmtInt(ENDOWMENT_REQUIRED_PATRONS)} Patrons and fully upgrade ${getFacility(FINAL_FACILITY_ID)?.name || "the final venue"}.`;
      return;
    }

    btn.hidden = true;
    btn.disabled = true;
    btn.classList.remove("mysteryTab");
    btn.textContent = "Music Library";
    btn.title = "";
  }

  // ---------- Economy ----------
  function buildingCostAtOwned(b, owned){
    return buildingCostAtOwnedCore(b, owned);
  }

  function sumCostForK(b, k){
    return sumCostForKCore(S, b, k, BATON_ITEM);
  }

  // For x10/x100 modes, buy as many as affordable up to the mode cap.
  function buyCountForMode(b, mode){
    return buyCountForModeCore(S, b, mode, BATON_ITEM, NOTE_UPGRADES, BATON_UPGRADES);
  }

  function facilityNpsMultOnly(){
    return facilityMults(S).nps;
  }

  function batonBaseClickForState(s){
    return batonBaseClickForStateCore(s);
  }

  function batonClickMultForState(s){
    return batonClickMultForStateCore(s, BATON_UPGRADES, hasBatonTechnique);
  }

  function globalNpsMultiplierForState(s){
    return globalNpsMultiplierForStateCore(s, facilityMults, patronBonus);
  }

  function baseInstrumentNpsForState(s, b){
    return baseInstrumentNpsForStateCore(s, b);
  }

  function totalNpsForState(s){
    return totalNpsForStateCore(s, BUILDINGS, facilityMults, patronBonus);
  }

  function notesPerClickForState(s){
    return notesPerClickForStateCore(s, {
      buildings: BUILDINGS,
      batonUpgrades: BATON_UPGRADES,
      hasBatonTechnique,
      facilityMults,
      patronBonus,
    });
  }



  function totalNps(){
    return totalNpsForState(S);
  }

  function effectiveInstrumentNps(b){
    return baseInstrumentNpsForState(S, b) * globalNpsMultiplierForState(S);
  }

  function effectiveFamilyNps(familyId){
    let sum = 0;
    for (const b of BUILDINGS){
      if (b.family !== familyId) continue;
      sum += baseInstrumentNpsForState(S, b);
    }
    return sum * globalNpsMultiplierForState(S);
  }

  function notesPerClick(){
    return notesPerClickForState(S);
  }

  function buyBuilding(id, mode){
    if (isBlocked()) return false;
    actions.advanceTo(S, now(), false);
    const r = actions.buyUnits(S, id, mode);
    if (r.ok) toast(`Bought ${r.count} × ${r.name} (+${r.count} Ink).`, { key: `buy:${id}`, ttl: 2100 });
    return r.ok;
  }
  function buyBaton(mode){
    if (isBlocked()) return false;
    actions.advanceTo(S, now(), false);
    const r = actions.buyUnits(S, BATON_ITEM.id, mode);
    if (r.ok){
      addRecentUnlock("Baton", `Bought ${r.count} baton${r.count === 1 ? "" : "s"}`);
      toast(`Bought ${r.count} × Baton (+${fmtExact(r.count * BATON_ITEM.basePer, false)} base click, +${r.count} Ink).`, { key: "buy:baton", ttl: 2100 });
    }
    return r.ok;
  }
  function buyNoteUpgrade(id, silent=false){
    if (isBlocked()) return false;
    actions.advanceTo(S, now(), false);
    const result = actions.buyUpgrade(S, "note", id);
    if (result.ok){
      addRecentUnlock("Upgrade", result.name);
      if (!silent) toast("Upgrade: " + result.name);
    }
    return result.ok;
  }
  function buySynergyUpgrade(id, silent=false){
    if (isBlocked()) return false;
    actions.advanceTo(S, now(), false);
    const result = actions.buyUpgrade(S, "synergy", id);
    if (result.ok){
      addRecentUnlock("Synergy", result.name);
      if (!silent) toast("Synergy: " + result.name);
    }
    return result.ok;
  }
  function buyInkUpgrade(id, silent=false){
    if (isBlocked()) return false;
    actions.advanceTo(S, now(), false);
    const result = actions.buyUpgrade(S, "ink", id);
    if (result.ok){
      addRecentUnlock("Archive", result.name);
      if (!silent) toast("Archive: " + result.name);
    }
    return result.ok;
  }
  function buyBatonUpgrade(id, silent=false){
    if (isBlocked()) return false;
    actions.advanceTo(S, now(), false);
    const result = actions.buyUpgrade(S, "baton", id);
    if (result.ok){
      addRecentUnlock("Technique", result.name);
      if (!silent) toast("Technique: " + result.name);
    }
    return result.ok;
  }
  function availableUpgradeOptions(state = S){
    return actions.availableUpgrades(state);
  }
  function buyAllAvailableUpgrades(){
    if (isBlocked()) return;
    actions.advanceTo(S, now(), false);
    const result = actions.buyAllUpgrades(S);
    if (!result.ok){ toast("No unlocked upgrades are currently affordable."); return; }
    for (const item of result.purchased) addRecentUnlock("Upgrade", item.name);
    toast(`Bought ${result.purchased.length} upgrades • Started with ${result.purchased[0].name}.`);
    renderAll();
  }
  // ✅ Global “manual click” debounce (prevents double-fire from touch/click overlap)
  let lastManualClickAt = 0;

  function clickNote(){
    if (isBlocked()) return;
    actions.advanceTo(S, now(), false);

    const t = now();
    if (t - lastManualClickAt < 35) return;
    lastManualClickAt = t;

    actions.click(S);
  }

  // ✅ FAST TAP (mobile) + click (desktop) wiring — bound ONCE
  function wireNoteButtonOnce(){
    const btn = document.getElementById("noteBtn");
    wireNoteButtonOnceCore(btn, now, () => {
      clickNote();
      renderHUD();
    });
  }

  // ---------- Offline Progress ----------
  function applyOffline(){
    const result = actions.advanceTo(S, now(), isBlocked() || !S.ui.tutorialCompleted);
    if (result.seconds > 2 && result.notes > 0){
      toast(`Welcome back! +${fmtExact(result.notes, S.settings.abbrevLarge)} Notes from ${Math.floor(result.seconds/60)}m offline.`);
    }
  }
  // ---------- Tabs ----------
  let statsLiveTimer = null;

  function startStatsLive(){
    stopStatsLive();
    renderStats();
    statsLiveTimer = setInterval(() => {
      if (S.ui.tab !== "stats") return;
      renderStats();
      const timeStr = new Date().toLocaleString();
      $("#statsClock").textContent = timeStr;
    }, 250);
  }
  function stopStatsLive(){
    if (statsLiveTimer){
      clearInterval(statsLiveTimer);
      statsLiveTimer = null;
    }
  }

  function setTab(tab){
    if (tab === "library" && !isLibraryUnlocked(S)){
      toast("The library remains sealed for now.");
      tab = ((S.patronsEver || 0) > 0 || S.ui.hasPrestiged) ? "prestige" : "main";
    }
    const prevTab = S.ui.tab;
    S.ui.tab = tab;
    if (tab !== "start") S.ui.lastTab = tab;
    document.body.classList.toggle("start-screen", tab === "start");

    $("#tab-start").hidden = tab !== "start";
    $("#tab-main").hidden = tab !== "main";
    $("#tab-stats").hidden = tab !== "stats";
    $("#tab-achievements").hidden = tab !== "achievements";
    $("#tab-prestige").hidden = tab !== "prestige";
    $("#tab-library").hidden = tab !== "library" || !isLibraryUnlocked(S);
    $("#tab-settings").hidden = tab !== "settings";

    // Only highlight actual nav buttons (no start button)
    $$("button[data-tab]").forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === tab));

    if (tab === "stats") startStatsLive();
    else stopStatsLive();
    if (tab === "achievements"){
      renderAchievements();
      renderRecentUnlocks();
    }
    if (tab === "library" && renderLibraryCore){
      renderLibraryCore(S, { fmtExact, useSuffix: !!S.settings.abbrevLarge });
    }
    if (prevTab === "library" && tab !== "library" && stopLibraryPlaybackCore){
      stopLibraryPlaybackCore();
    }
    renderAll();
    if (tab === "library" && !S.library.order.length) libraryUI?.syncCatalog(false, false);
    save(false);
  }
  $$("button[data-tab]").forEach(btn=>{
    btn.addEventListener("click", ()=> {
      // if not started, prevent navigating away from start
      if (!S.ui.hasStarted) return;
      if (btn.disabled) return;
      setTab(btn.getAttribute("data-tab"));
    });
  });

  // ---------- UI Helpers ----------
  function setBuyMode(mode){
    S.buyMode = mode;
    ["buy1","buy10","buy100","buyMax"].forEach(id=>{
      const btn = $("#"+id);
      if (!btn) return;
      const m = btn.getAttribute("data-buymode");
      btn.classList.toggle("active", m === mode);
    });
    [["mBuy1","1"],["mBuy10","10"],["mBuy100","100"],["mBuyMax","max"]].forEach(([id,m])=>{
      const btn = $("#"+id);
      if (btn && m !== "max") btn.classList.toggle("active", m === mode);
    });
    [["dBuy1","1"],["dBuy10","10"],["dBuy100","100"],["dBuyMax","max"]].forEach(([id,m])=>{
      const btn = $("#"+id);
      if (btn && m !== "max") btn.classList.toggle("active", m === mode);
    });
    save(false);
    renderFamilies();
    refreshDynamicShopStates();
    updateFloatingControls();
    syncDockQuickActionButtons();
  }

  let dockQuickAction = "next";

  function normalizeDockQuickAction(action){
    return (action === "upgrades") ? "upgrades" : "next";
  }

  function currentDockQuickAction(){
    return normalizeDockQuickAction(dockQuickAction);
  }

  function setDockQuickAction(action){
    dockQuickAction = normalizeDockQuickAction(action);
    hideDockActionMenu();
    syncDockQuickActionButtons();
    refreshDynamicShopStates();
  }

  function syncDockQuickActionButtons(){
    const action = currentDockQuickAction();
    const label = action === "upgrades" ? "Upgrades ▾" : "Next ▾";
    const activeAsMode = action === "next" && S.buyMode === "max";

    ["mBuyMax", "dBuyMax"].forEach((id) => {
      const btn = $("#"+id);
      if (!btn) return;
      btn.textContent = label;
      btn.classList.toggle("active", activeAsMode);
      btn.classList.toggle("primary", action === "upgrades");
      btn.title = action === "upgrades"
        ? "Click: buy all unlocked affordable upgrades. Hold to switch."
        : "Click: set buy quantity to Next. Hold to switch.";
    });

    const menu = $("#dockActionMenu");
    if (menu){
      menu.querySelectorAll("button[data-dock-action]").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-dock-action") === action);
      });
    }
  }

  function runDockQuickAction(){
    if (currentDockQuickAction() === "upgrades"){
      buyAllAvailableUpgrades();
      return;
    }
    setBuyMode("max");
  }

  function positionDockActionMenu(anchor){
    const menu = $("#dockActionMenu");
    if (!menu || !anchor) return;
    menu.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - menuRect.width - 8, rect.right - menuRect.width));
    const top = Math.max(8, rect.top - menuRect.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function openDockActionMenu(anchor){
    const menu = $("#dockActionMenu");
    if (!menu) return;
    menu.hidden = false;
    positionDockActionMenu(anchor);
    menu._anchor = anchor;
    anchor.setAttribute("aria-expanded", "true");
    menu.querySelector("button.active, button")?.focus({ preventScroll: true });
  }

  function hideDockActionMenu(){
    const menu = $("#dockActionMenu");
    if (!menu) return;
    menu.hidden = true;
    menu._anchor?.setAttribute("aria-expanded", "false");
  }

  function wireDockQuickActionButton(btn){
    if (btn) window.ScoreUIEvents.wireActionSelector(btn, {
      open: openDockActionMenu, close: hideDockActionMenu, execute: runDockQuickAction
    });
  }

  const INK_TAB_LABELS = {
    nps: "Notes/sec",
    clicknps: "Click % of NPS",
    clickmult: "Click Power",
  };
  function inkUpgradeCategory(u){
    if (u.group) return u.group;
    if (u.id.startsWith("iu_clicknps_")) return "clicknps";
    if (u.id.startsWith("iu_clickmult_")) return "clickmult";
    return "nps";
  }
  function normalizeInkTab(tab){
    return INK_TAB_LABELS[tab] ? tab : "nps";
  }
  function syncInkTabButtons(){
    const active = normalizeInkTab(S.ui.inkTab);
    $$("button[data-inktab]").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-inktab") === active);
    });
  }
  function setInkTab(tab){
    const next = normalizeInkTab(tab);
    if (S.ui.inkTab === next){
      syncInkTabButtons();
      return;
    }
    S.ui.inkTab = next;
    syncInkTabButtons();
    renderInkUpgrades();
    refreshDynamicShopStates();
    save(false);
  }

  function updateFloatingControls(){
    const mainActive = (S.ui.tab === "main") && !!S.ui.hasStarted && !!S.ui.tutorialCompleted && !tutOverlay.classList.contains("show");
    const mobile = $("#mobileActionBar");
    const desktopDock = $("#desktopBuyDock");
    const isMobile = window.matchMedia("(max-width: 980px)").matches;

    const noteBtn = $("#noteBtn");
    let noteVisible = true;
    if (noteBtn){
      const r = noteBtn.getBoundingClientRect();
      noteVisible = (r.bottom > 80) && (r.top < (window.innerHeight - 80));
    }

    const seg = $("#buyModeSeg");
    const headerBottom = $("header")?.getBoundingClientRect().bottom || 0;
    let segVisible = true;
    if (seg){
      const r = seg.getBoundingClientRect();
      segVisible = (r.bottom > headerBottom + 4) && (r.top < (window.innerHeight - 12));
    }

    if (mobile) mobile.hidden = !mainActive || !isMobile || noteVisible;
    if (desktopDock) desktopDock.hidden = !mainActive || isMobile || segVisible;
  }

  function instrumentLabelFamily(familyId){
    const f = FAMILY_ORDER.find(x=>x.id===familyId);
    return f ? f.label : familyId;
  }

  const achievementBanner = $("#achievementBanner");
  const achievementBannerName = $("#achievementBannerName");
  const achievementBannerDesc = $("#achievementBannerDesc");
  const achievementBannerBonus = $("#achievementBannerBonus");
  let achievementBannerActive = false;
  const achievementBannerQueue = [];

  function achievementCategory(a){
    const id = a?.id || "";
    if (id.startsWith("ach_woodwind_all_") || id.startsWith("ach_brass_all_") || id.startsWith("ach_strings_all_") || id.startsWith("ach_perc_all_") || id.startsWith("ach_sections_balanced_")){
      return "Section Sets";
    }
    if (id.startsWith("ach_baton") || id.startsWith("ach_batons_owned") || id.startsWith("ach_note_stage")){
      return "Baton Progression";
    }
    if (id.startsWith("ach_ink") || id.startsWith("ach_archive")){
      return "Ink & Archive";
    }
    if (id.startsWith("ach_patrons") || id.startsWith("ach_facility_up")){
      return "Prestige & Venue";
    }
    if (id.startsWith("ach_synergy")){
      return "Synergies";
    }
    return "Core Milestones";
  }

  function achievementBonusText(a){
    const pct = ((a.mult - 1) * 100).toFixed(2);
    return a.kind === "click" ? `+${pct}% click power` : `+${pct}% Notes/sec`;
  }

  function playNextAchievementBanner(){
    if (achievementBannerActive) return;
    if (!achievementBanner || achievementBannerQueue.length === 0) return;
    const a = achievementBannerQueue.shift();
    if (!a) return;

    achievementBannerActive = true;
    achievementBannerName.textContent = a.name;
    achievementBannerDesc.textContent = a.desc || achievementCategory(a);
    achievementBannerBonus.textContent = achievementBonusText(a);

    achievementBanner.hidden = false;
    achievementBanner.classList.remove("show");
    void achievementBanner.offsetWidth;
    achievementBanner.classList.add("show");

    const liveMs = S.settings.reduceMotion ? 2160 : 3900;
    const outMs = S.settings.reduceMotion ? 108 : 290;
    setTimeout(()=>{
      achievementBanner.classList.remove("show");
      setTimeout(()=>{
        if (!achievementBanner.classList.contains("show")) achievementBanner.hidden = true;
        achievementBannerActive = false;
        playNextAchievementBanner();
      }, outMs);
    }, liveMs);
  }

  function queueAchievementBanner(a){
    if (!a) return;
    achievementBannerQueue.push(a);
    playNextAchievementBanner();
  }


  function checkAchievements(showToast=true){
    const unlocked = actions.awardAchievements(S);
    if (showToast) for (const a of unlocked){ addRecentUnlock("Achievement", a.name); queueAchievementBanner(a); }
    if (unlocked.length) save(false);
    return unlocked.length;
  }

  function addRecentUnlock(type, name){
    if (!S.recentUnlocks) S.recentUnlocks = [];
    S.recentUnlocks.unshift({
      type,
      name,
      at: new Date().toLocaleString()
    });
    if (S.recentUnlocks.length > 30) S.recentUnlocks.length = 30;
  }

  function applyVisualSettings(){
    document.body.classList.toggle("reduce-motion", !!S.settings.reduceMotion);
    document.body.classList.toggle("high-contrast", !!S.settings.highContrast);
  }


  const {refreshDynamicShopStates,renderHUD,renderBatonShop,renderBatonUpgrades,renderFamilies,renderInstrumentsForFamily,renderInstrumentUpgrades,renderSynergyForFamily,renderInkUpgrades,renderFacility,renderStats,renderAchievements,renderRecentUnlocks,renderSettings} = window.ScoreRender.createScreens({
    getState: ()=>S, actions,isBlocked,globalNpsMultiplierForState,buyCountForMode,sumCostForK,buildingCostAtOwned,fmtInt,currentDockQuickAction,availableUpgradeOptions,syncDockQuickActionButtons,totalNps,notesPerClick,prestigePreview,runNotesUntilNextPatron,runNotesForPatrons,currentStage,noteMarkup,effectiveFamilyNps,effectiveInstrumentNps,instrumentLabelFamily,normalizeInkTab,syncInkTabButtons,INK_TAB_LABELS,inkUpgradeCategory,facilityMults,facilityCarryBonusFromCurrent,nextLockedFacilityForState,facilityEntryBonusFromCurrent,canAffordPatrons,renderEndowmentPanel,batonBaseClick,batonClickMult,achievementCategory,achievementBonusText,applyVisualSettings
  });

  function renderAll(){
    setPrestigeTabVisibility();
    setLibraryTabVisibility();
    renderHUD();
    if (S.ui.tab === "main" || S.ui.tab === "start"){
      renderBatonShop(); renderBatonUpgrades(); renderFamilies();
    }
    if (S.ui.tab === "prestige"){ renderInkUpgrades(); renderFacility(); }
    if (S.ui.tab === "stats") renderStats();
    if (S.ui.tab === "achievements"){
      renderAchievements();
      renderRecentUnlocks();
    }
    if (S.ui.tab === "library" && renderLibraryCore){
      renderLibraryCore(S, { fmtExact, useSuffix: !!S.settings.abbrevLarge });
    }
    if (S.ui.tab === "settings") renderSettings();
    refreshDynamicShopStates();
    maybeShowCoachTip();
    updateFloatingControls();
    // keep spotlight aligned if tutorial is open
    if (tutOverlay.classList.contains("show")) updateSpotlightFromSelector();
  }

  let lastHeavy = 0;
  function tick(){
    if (document.hidden) return;
    const t = now();

    actions.advanceTo(S, t, isBlocked());
    if (isBlocked()){
      if (S.ui.tab !== "start") renderHUD();
      return;
    }

    if (!S.settings.disableTooltips && !S.ui.prestigeExplained && (S.patronsEver || 0) === 0 && (S.runNotes || 0) >= runNotesForPatrons(1)){
      showPrestigeExplain();
      renderHUD();
      return;
    }

    if (t - lastSaveAttempt > 30000) save(false);

    renderHUD();

    if (t - lastHeavy > 350){
      lastHeavy = t;
      const newAchievements = checkAchievements(true);
      if (newAchievements > 0){
        renderHUD();
        if (S.ui.tab === "stats") renderStats();
      }
      if (S.ui.tab === "achievements"){
        renderAchievements();
        renderRecentUnlocks();
      }
      if (S.ui.tab === "main"){ renderBatonShop(); renderBatonUpgrades(); renderFamilies(); }
      if (S.ui.tab === "prestige"){ renderInkUpgrades(); renderFacility(); }
      if (S.ui.tab === "library" && renderLibraryCore) renderLibraryCore(S, { fmtExact, useSuffix: !!S.settings.abbrevLarge });
      refreshDynamicShopStates();
      maybeShowCoachTip();
      updateFloatingControls();
      if (tutOverlay.classList.contains("show")) updateSpotlightFromSelector();
    }
  }

  // ---------- Wire Buttons (ONCE) ----------
  window.ScoreUIEvents.wireShopInputs(document, {
    getState: ()=>S, save: ()=>save(false),
    baton: ()=>{ if (buyBaton(S.buyMode)) renderAll(); },
    purchases: {
      "data-buy": id=>{ if (buyBuilding(id, S.buyMode)) renderAll(); },
      "data-bt": id=>{ buyBatonUpgrade(id); renderAll(); },
      "data-nu": id=>{ buyNoteUpgrade(id); renderAll(); },
      "data-syn": id=>{ buySynergyUpgrade(id); renderAll(); },
      "data-iu": id=>{ buyInkUpgrade(id); renderAll(); },
      "data-fup": buyFacilityUpgrade, "data-fac": unlockFacility
    }
  });
  wireNoteButtonOnce();
  if (bindLibraryUICore){
    libraryUI = bindLibraryUICore({
      getState: () => S,
      settle: () => actions.advanceTo(S, now(), isBlocked()),
      save: () => save(false),
      renderAll,
      toast
    });
  }

  $("#prestigeBtn").addEventListener("click", ()=>{
    doPrestige();
  });
  $("#endowmentOfferBtn").addEventListener("click", ()=>{
    offerPatronsToEndowment();
  });

  $("#saveBtn").addEventListener("click", ()=> save(true));

  // ✅ Hard Reset: always land on START SCREEN
  $("#resetBtn").addEventListener("click", ()=>{
    const ok = confirm("Hard reset will erase your save completely (including Ink, Patrons, Facilities). Are you sure?");
    if (!ok) return;

    // remove current + prior save keys
    const cleared = clearSaveState(localStorage, SAVE_KEY, LEGACY_SAVE_KEYS);
    if (!cleared.ok){ showSaveStatus(cleared.message); return; }

    S = actions.reset(now());
    if (ensureLibraryStateCore) ensureLibraryStateCore(S);
    if (stopLibraryPlaybackCore) stopLibraryPlaybackCore();
    if (libraryMysteryOverlay.classList.contains("show")) hideLibraryMystery();
    if (prestigeExplainOverlay.classList.contains("show")) hidePrestigeExplain();

    // replace the note button node to guarantee only one set of listeners
    const oldBtn = document.getElementById("noteBtn");
    if (oldBtn && oldBtn.parentNode){
      const fresh = oldBtn.cloneNode(true);
      oldBtn.parentNode.replaceChild(fresh, oldBtn);
    }

    lastManualClickAt = 0;
    wireNoteButtonOnce();

    stopStatsLive();
    toast("Reset complete.");

    // force START screen
    S.ui.tab = "start";
    setTab("start");
    renderAll();
  });

  document.querySelectorAll("button[data-buymode]").forEach(btn=>{
    btn.addEventListener("click", ()=> setBuyMode(btn.getAttribute("data-buymode")));
  });
  document.querySelectorAll("button[data-mbuymode]").forEach(btn=>{
    btn.addEventListener("click", ()=> setBuyMode(btn.getAttribute("data-mbuymode")));
  });
  document.querySelectorAll("button[data-dbuymode]").forEach(btn=>{
    btn.addEventListener("click", ()=> setBuyMode(btn.getAttribute("data-dbuymode")));
  });
  wireDockQuickActionButton($("#mBuyMax"));
  wireDockQuickActionButton($("#dBuyMax"));
  document.querySelectorAll("button[data-inktab]").forEach(btn=>{
    btn.addEventListener("click", ()=> setInkTab(btn.getAttribute("data-inktab")));
  });
  const mQuickNote = $("#mQuickNoteBtn");
  if (mQuickNote){
    mQuickNote.addEventListener("click", ()=>{
      clickNote();
      renderHUD();
      refreshDynamicShopStates();
    });
  }
  const dockActionMenu = $("#dockActionMenu");
  if (dockActionMenu){
    dockActionMenu.querySelectorAll("button[data-dock-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDockQuickAction(btn.getAttribute("data-dock-action"));
      });
    });
    dockActionMenu.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
  document.addEventListener("pointerdown", (e) => {
    const menu = $("#dockActionMenu");
    if (!menu || menu.hidden) return;
    const target = e.target;
    if (menu.contains(target)) return;
    if (target?.closest?.("#mBuyMax, #dBuyMax")) return;
    hideDockActionMenu();
  });
  document.addEventListener("keydown", e=>{
    if (e.key === "Escape" && !$("#dockActionMenu").hidden){
      const anchor = $("#dockActionMenu")._anchor;
      hideDockActionMenu(); anchor?.focus();
    }
  });
  window.addEventListener("resize", hideDockActionMenu);
  window.addEventListener("scroll", hideDockActionMenu, true);
  syncDockQuickActionButtons();

  $("#settingSuffix").addEventListener("change", (e)=>{
    S.settings.abbrevLarge = !!e.target.checked;
    save(false);
    renderAll();
  });
  $("#settingReduceMotion").addEventListener("change", (e)=>{
    S.settings.reduceMotion = !!e.target.checked;
    applyVisualSettings();
    save(false);
    renderAll();
  });
  $("#settingHighContrast").addEventListener("change", (e)=>{
    S.settings.highContrast = !!e.target.checked;
    applyVisualSettings();
    save(false);
    renderAll();
  });
  $("#settingDisableTooltips").addEventListener("change", (e)=>{
    S.settings.disableTooltips = !!e.target.checked;
    if (S.settings.disableTooltips){
      S.ui.tooltipsDone = true;
      hideCoachTip();
      if (prestigeExplainOverlay.classList.contains("show")){
        hidePrestigeExplain();
      }
    } else if (S.ui.hasStarted && S.ui.tutorialCompleted && (S.ui.tooltipStep || 0) < COACH_STEPS.length){
      S.ui.tooltipsDone = false;
      S.ui.tooltipAckStep = -1;
    }
    save(false);
    renderAll();
  });
  window.addEventListener("scroll", updateFloatingControls, { passive:true });
  window.addEventListener("resize", updateFloatingControls, { passive:true });

  window.render_game_to_text = ()=>JSON.stringify({ tab:S.ui.tab, notes:S.notes, nps:actions.totalNps(S), click:actions.notesPerClick(S), patrons:S.patrons, batons:S.batonOwned, owned:S.owned, blocked:isBlocked(), tutorialStep:S.ui.tutorialStep });

  // ---------- Boot ----------
  applyOffline();
  // Modal DOM does not survive reload; consume paused time before clearing its transient flag.
  S.ui.blocked = false;
  setBuyMode(S.buyMode);
  setPrestigeTabVisibility();
  setLibraryTabVisibility();

  // If not started, ALWAYS show start screen (real screen)
  if (!S.ui.hasStarted){
    setTab("start");
  } else {
    // otherwise restore last tab (but never "start")
    const last = (S.ui.tab && S.ui.tab !== "start") ? S.ui.tab : "main";
    setTab(last);
  }

  renderAll();
  if (S.ui.hasStarted && !S.ui.tutorialCompleted) showTutorial();
  setInterval(tick, 100);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden){ actions.advanceTo(S, now(), isBlocked()); save(false); }
    else tick();
  });
  window.addEventListener("pagehide", () => { actions.advanceTo(S, now(), isBlocked()); save(false); });
  const loadStatus = window.ScoreState.getLoadStatus();
  if (loadStatus.message) showSaveStatus(loadStatus.message);

  // Small toast only if already started
  if (S.ui.hasStarted && S.lifetimeNotes === 0 && S.notes === 0){
    toast("Click the note to start conducting!");
  }
})();
