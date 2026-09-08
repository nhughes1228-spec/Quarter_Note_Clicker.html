const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({console}); ctx.window = ctx;
for (const file of ["game-data.js","economy.js","state-save.js","game-actions.js"])
  vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),ctx,{filename:file});
const {ScoreData:D,ScoreState:P,ScoreEconomy:E,ScoreActions:A} = ctx;
const a = A.createGameActions(D,E,P);
const fresh = ()=>P.createDefaultState(D.BUILDINGS,()=>0);
const near = (x,y)=>assert.ok(Math.abs(x-y)<=1e-8*Math.max(1,Math.abs(y)),x+" != "+y);
let passed=0;
function test(name, fn){ fn(); console.log("PASS "+name); passed++; }
function storage(){
  const data = new Map();
  return {data,writes:0,fail:false,getItem:k=>data.get(k)??null,
    setItem(k,v){this.writes++;if(this.fail)throw Error("quota");data.set(k,v);},
    removeItem:k=>data.delete(k)};
}
const load = st=>P.loadState(st,P.SAVE_KEY,P.LEGACY_SAVE_KEYS,P.createDefaultState,D.BUILDINGS,
  s=>E.batonClickMultForState(s,D.BATON_UPGRADES,D.hasBatonTechnique),()=>0,{warn(){}});
test("read-only migration, backup recovery, failed writes retain progress",()=>{
  const st=storage(),s=fresh();s.notes=123456;s.batonUpgrades[D.BATON_UPGRADES[0].id]=12;
  st.data.set(P.SAVE_KEY,JSON.stringify(s));
  const loaded=load(st);assert.equal(loaded.notes,123456);assert.equal(st.writes,0);
  assert.equal(loaded.batonUpgrades[D.BATON_UPGRADES[0].id],1);
  st.fail=true;assert.equal(P.saveState(st,P.SAVE_KEY,loaded,()=>20).ok,false);assert.equal(load(st).notes,123456);
  st.fail=false;loaded.notes=456789;assert.ok(P.saveState(st,P.SAVE_KEY,loaded,()=>30).ok);
  assert.equal(JSON.parse(st.data.get(P.SAVE_KEY+"_backup")).notes,123456);
  st.data.set(P.SAVE_KEY,"{broken");assert.equal(load(st).notes,123456);assert.ok(P.getLoadStatus().recovered);
  assert.ok(P.saveState(st,P.SAVE_KEY,load(st),()=>40).ok);
  assert.ok(P.clearSaveState(st,P.SAVE_KEY,P.LEGACY_SAVE_KEYS).ok);assert.equal(st.data.size,0);
});
test("partial write failure and structurally corrupted saves recover safely",()=>{
  const st=storage(),s=fresh();s.notes=321;st.data.set(P.SAVE_KEY,JSON.stringify(s));
  const set=st.setItem.bind(st);st.setItem=(key,value)=>{if(key===P.SAVE_KEY)throw Error("primary write failed");set(key,value);};
  s.notes=900;assert.equal(P.saveState(st,P.SAVE_KEY,s,()=>30).ok,false);
  assert.equal(load(st).notes,321);assert.equal(JSON.parse(st.data.get(P.SAVE_KEY+"_backup")).notes,321);
  s.owned.piccolo="broken";st.data.set(P.SAVE_KEY,JSON.stringify(s));assert.equal(load(st).notes,321);
  st.removeItem=()=>{throw Error("denied")};assert.equal(P.clearSaveState(st,P.SAVE_KEY,P.LEGACY_SAVE_KEYS).ok,false);
});
test("unrecoverable saves are preserved; hard reset explicitly clears protection",()=>{
  const st=storage();st.data.set(P.SAVE_KEY,"invalid");load(st);
  assert.equal(P.saveState(st,P.SAVE_KEY,fresh(),()=>10).ok,false);
  assert.equal(st.data.get(P.SAVE_KEY),"invalid");
  P.clearSaveState(st,P.SAVE_KEY,P.LEGACY_SAVE_KEYS);
  assert.ok(P.saveState(st,P.SAVE_KEY,fresh(),()=>20).ok);
});
test("legacy recovery and storage-read failure",()=>{
  const st=storage(),s=fresh();s.notes=99;st.data.set(P.LEGACY_SAVE_KEYS[0],JSON.stringify(s));
  assert.equal(load(st).notes,99);assert.equal(st.writes,0);
  st.getItem=()=>{throw Error("unavailable")};load(st);assert.equal(P.getLoadStatus().ok,false);
  P.clearSaveState(storage(),P.SAVE_KEY,P.LEGACY_SAVE_KEYS);
});
test("active, catch-up and reload intervals agree; cap, pauses, backwards timestamps",()=>{
  const x=fresh();x.owned.piccolo=20;x.library.works.demo={practice:0,practicePerSecond:2};
  const y=JSON.parse(JSON.stringify(x));
  for(let t=100;t<=3600000;t+=100)a.advanceTo(x,t);
  a.advanceTo(y,3600000);near(x.notes,y.notes);near(x.library.works.demo.practice,y.library.works.demo.practice);
  const notes=y.notes;a.advanceTo(y,3600000);a.advanceTo(y,2000);assert.equal(y.notes,notes);
  a.advanceTo(y,7200000,true);assert.equal(y.notes,notes);
  a.advanceTo(y,7201000);near(y.notes,notes+a.totalNps(y));
  assert.equal(a.advanceTo(y,172801000).seconds,21600);
  const reloaded=JSON.parse(JSON.stringify(y)),before=reloaded.notes;
  a.advanceTo(reloaded,reloaded.lastTick);assert.equal(reloaded.notes,before);
  assert.equal(x.stats.clicks,0);
});
test("purchase validation and exact previews across early/late progression",()=>{
  for(const patrons of [0,100,1000000]){
    const s=fresh();s.notes=1e100;s.patrons=patrons;s.ink=1e6;s.clickFromNpsRate=.03;
    for(const b of D.BUILDINGS)s.owned[b.id]=100;
    const check=action=>{
      const before=[a.totalNps(s),a.notesPerClick(s)];
      const delta=a.preview(s,action);assert.ok(delta.ok);
      assert.ok(action(s).ok);near(a.totalNps(s)-before[0],delta.nps);near(a.notesPerClick(s)-before[1],delta.click);
    };
    check(x=>a.buyUnits(x,D.BATON_ITEM.id,"10"));
    check(x=>a.buyUnits(x,"piccolo","10"));
    check(x=>a.buyUpgrade(x,"note",D.NOTE_UPGRADES[0].id));
    check(x=>a.buyUpgrade(x,"baton",D.BATON_UPGRADES[0].id));
    check(x=>a.buyUpgrade(x,"ink",D.INK_UPGRADES[0].id));
    if(patrons>=100){
      check(x=>a.buyVenueUpgrade(x,D.getFacility("shed").upgrades[0].id));
      const next=a.rules.nextLockedFacilityForState(s);
      if(s.patrons>=next.patronCostToUnlock)check(x=>a.buyVenue(x,next.id));
    }
  }
  const s=fresh(),old=JSON.stringify(s);assert.equal(a.buyUnits(s,"piccolo","1").ok,false);
  assert.equal(a.buyUpgrade(s,"note",D.NOTE_UPGRADES[0].id).ok,false);assert.equal(JSON.stringify(s),old);
});
test("buy-all priority, Notes-only, achievements idempotent, prestige",()=>{
  const s=fresh();s.notes=1e30;s.ink=500;s.patrons=300;s.batonOwned=100;
  for(const b of D.BUILDINGS)s.owned[b.id]=100;
  const first=a.availableUpgrades(s)[0];
  const result=a.buyAllUpgrades(s);assert.ok(result.ok);assert.equal(result.purchased[0].id,first.id);
  assert.equal(s.ink,500);assert.equal(s.patrons,300);assert.equal(Object.keys(s.inkUpgrades).length,0);
  assert.ok(a.awardAchievements(s).length);assert.equal(a.awardAchievements(s).length,0);
  s.runNotes=500000;assert.ok(a.prestige(s).ok);assert.equal(s.patrons,301);assert.equal(s.notes,0);assert.equal(s.owned.piccolo,0);
});
test("pure real-action progression smoke and endowment reset",()=>{
  const s=fresh();
  for(let i=0;i<100;i++)a.click(s);
  assert.ok(a.buyUnits(s,D.BATON_ITEM.id,"1").ok);assert.ok(a.buyUnits(s,"piccolo","1").ok);
  for(let t=1000;t<=3600000;t+=1000){
    a.advanceTo(s,t);a.awardAchievements(s);
    a.buyUnits(s,"piccolo","1");
    const ink=D.INK_UPGRADES.filter(u=>!s.inkUpgrades[u.id]).sort((x,y)=>x.costInk-y.costInk)[0];
    if(ink)a.buyUpgrade(s,"ink",ink.id);
  }
  assert.ok(s.lifetimeNotes>100);assert.ok(s.owned.piccolo>1);
  s.patrons=1e20;
  for(const f of D.FACILITIES){
    if(f.id!=="shed")assert.ok(a.buyVenue(s,f.id).ok);
    for(const up of f.upgrades)assert.ok(a.buyVenueUpgrade(s,up.id).ok);
  }
  s.patrons=1000000;assert.ok(a.rules.canStartEndowment(s));
  const result=a.endowment(s,4000000);assert.ok(result.ok);assert.equal(result.gain,1);
  assert.equal(result.state.library.endowments,1);assert.equal(result.state.library.unlocked,true);
  assert.equal(result.state.notes,0);assert.equal(result.state.facility.currentId,"shed");
});
console.log(passed+" core test groups passed");

