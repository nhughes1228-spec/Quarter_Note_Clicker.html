(() => {
const PARSER_VERSION = 2;
function parseMusicXML(xmlText, options = {}){
  const Parser = options.DOMParser || globalThis.DOMParser;
  if (!Parser) throw new Error("An XML parser is required.");
  const doc = new Parser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid MusicXML file.");
  const text = (el, selector) => (el.querySelector(selector)?.textContent || "").trim();
  const title = text(doc, "work > work-title") || text(doc, "movement-title") || "Untitled Work";
  const composer = text(doc, 'creator[type="composer"]');
  const part = doc.querySelector("score-partwise > part");
  if (!part) throw new Error("No partwise MusicXML part found.");
  let divisions = 1, measureStart = 0;
  const events = [];
  const steps = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  const duration = node => {
    if (node.querySelector("grace")) return 0;
    const value = Number(text(node, "duration"));
    return Number.isFinite(value) && value >= 0 ? value / divisions : 0;
  };
  Array.from(part.children).filter(n => n.localName === "measure").forEach((measure, measureIndex) => {
    let cursor = 0, end = 0, previous = null;
    const measureNumber = parseInt(measure.getAttribute("number"), 10) || measureIndex + 1;
    for (const node of measure.children){
      const tag = node.localName;
      if (tag === "attributes"){
        const value = Number(text(node, "divisions"));
        if (value > 0 && Number.isFinite(value)) divisions = value;
        continue;
      }
      if (tag === "backup" || tag === "forward"){
        cursor = Math.max(0, cursor + duration(node) * (tag === "backup" ? -1 : 1));
        end = Math.max(end, cursor);
        previous = null;
        continue;
      }
      if (tag !== "note") continue;
      const beats = duration(node);
      const rest = !!node.querySelector("rest");
      const pitches = [];
      if (!rest){
        const step = text(node, "pitch > step").toUpperCase();
        const octaveText = text(node, "pitch > octave");
        const octave = Number(octaveText);
        const alter = Number(text(node, "pitch > alter") || 0);
        if (!(step in steps) || !octaveText || !Number.isFinite(octave) || !Number.isFinite(alter)){
          throw new Error("Unsupported or invalid pitch in measure " + measureNumber + ".");
        }
        pitches.push((octave + 1) * 12 + steps[step] + alter);
      }
      if (node.querySelector("chord") && previous && !rest && previous.type !== "rest"){
        previous.pitches.push(...pitches);
        previous.type = "chord";
        previous.durationBeats = Math.max(previous.durationBeats, beats);
        end = Math.max(end, previous.startTimeBeats - measureStart + beats);
        continue;
      }
      previous = {
        idx: events.length, type: rest ? "rest" : "note", measureNumber, beat: cursor + 1,
        startTimeBeats: measureStart + cursor, durationBeats: beats, pitches,
        velocity: options.velocity ?? 0.6
      };
      events.push(previous);
      cursor += beats;
      end = Math.max(end, cursor);
    }
    measureStart += end;
  });
  events.sort((a,b) => a.startTimeBeats - b.startTimeBeats || a.idx - b.idx);
  events.forEach((event, index) => { event.idx = index; });
  return { title, composer, events };
}
globalThis.ScoreMusicXML = { parseMusicXML, PARSER_VERSION };
})();

