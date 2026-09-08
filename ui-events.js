(() => {
// Shared UI event wiring helpers.
function wireNoteButtonOnce(button, nowFn, onManualClick){
  if (!button) return;
  if (button._wiredFastTap) return;
  button._wiredFastTap = true;

  let lastFast = 0;
  let pressTimer = 0;

  const clearPressed = () => {
    if (pressTimer){
      clearTimeout(pressTimer);
      pressTimer = 0;
    }
    button.classList.remove("is-pressed");
  };

  const pulsePressed = (holdMs = 110) => {
    button.classList.add("is-pressed");
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      button.classList.remove("is-pressed");
      pressTimer = 0;
    }, holdMs);
  };

  const doClick = () => {
    onManualClick();
  };

  button.addEventListener("pointerdown", (e) => {
    button.classList.add("is-pressed");

    if (e.pointerType === "mouse") return;

    e.preventDefault();
    lastFast = nowFn();
    doClick();
    pulsePressed(90);
  }, { passive: false });

  button.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "mouse") return;
    lastFast = nowFn();
    doClick();
    pulsePressed(70);
  });

  button.addEventListener("pointercancel", clearPressed);
  button.addEventListener("mouseleave", clearPressed);
  button.addEventListener("touchcancel", clearPressed);

  button.addEventListener("click", () => {
    if (nowFn() - lastFast < 650) return;
    pulsePressed(70);
    doClick();
  });
}


function wireShopInputs(root, options){
  root.addEventListener("click", e=>{
    const button = e.target.closest("button");
    if (!button || button.disabled) return;
    if (button.id === "buyBatonBtn"){ options.baton(); return; }
    for (const [attr, action] of Object.entries(options.purchases)){
      if (button.hasAttribute(attr)){ action(button.getAttribute(attr)); return; }
    }
  });
  root.addEventListener("toggle", e=>{
    const el = e.target, s = options.getState();
    const maps = {"data-family":"familyOpen", "data-inst":"instrumentUpOpen", "data-synfam":"synergyOpen"};
    for (const [attr, key] of Object.entries(maps)){
      if (el.hasAttribute?.(attr)){
        if (s.ui[key][el.getAttribute(attr)] !== el.open){
          s.ui[key][el.getAttribute(attr)] = el.open; options.save();
        }
        return;
      }
    }
    const key = {batonDropdown:"batonOpen",facilityUpgradesDetails:"facilityUpOpen",facilityNextDetails:"facilityNextOpen"}[el.id];
    if (key && s.ui[key] !== el.open){ s.ui[key] = el.open; options.save(); }
  }, true);
}
function wireActionSelector(button, {open, close, execute}){
  let timer, cancelled = false, held = false;
  const clear = ()=>{ clearTimeout(timer); timer = null; };
  button.setAttribute("aria-haspopup", "menu");
  button.addEventListener("pointerdown", e=>{
    if (e.button !== 0 || !e.isPrimary) return;
    clear(); cancelled = false; held = false;
    timer = setTimeout(()=>{ held = true; open(button); },420);
  });
  const cancel = ()=>{ clear(); cancelled = true; };
  button.addEventListener("pointerleave", cancel);
  button.addEventListener("pointercancel", cancel);
  button.addEventListener("pointerup", clear);
  button.addEventListener("click", e=>{
    e.preventDefault(); clear();
    if (held || (e.detail !== 0 && cancelled)) return;
    close(); execute();
  });
  button.addEventListener("keydown", e=>{
    if (e.key === "Enter" || e.key === " "){ clear(); held = false; cancelled = false; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp"){
      e.preventDefault(); open(button);
    }
    if (e.key === "Escape"){ clear(); close(); }
  });
  window.addEventListener("blur", cancel);
}
window.ScoreUIEvents = {
  wireShopInputs, wireActionSelector,
  wireNoteButtonOnce
};
})();
