/* Severe: the guidance of the editor (docs/severe-plan.md 6.2): what a drawing contradicts, and what an environment makes of storms. Pure, so that it is tested on its own.
 *
 *   HFSevereGuide.warnings(drawing)      // what the drawing says against itself: [{ level: 'warn' | 'info', index, text }] (index: the object, -1 for the day)
 *   HFSevereGuide.expect(ix)             // from the indices of an environment (HFSevereSounding.indices): { mode, hazards: [...], notes: [...] }, with the thresholds forecasters use (SPC's: 0-6 km shear of 20 m/s
 *                                        // and more for supercells, SRH over 150 and a low cloud base for tornadoes, a cap of -150 J/kg or more that storms do not break without strong lift)
 *   HFSevereGuide.sideNormal(pts, side)  // the unit vector (east, north) at right angles to the line from its first to its last point, towards its left or right
 *   HFSevereGuide.faceSide(pts, dir)     // the side of the line ('left' or 'right' of the way it is drawn) that looks towards the direction `dir` ([east, north]; the left when it is neither)
 *   HFSevereGuide.sideOfMotion(pts, m)   // the side a motion { u, v } carries the line towards ('left', 'right', or null when it only slides along the line or stands still)
 *   HFSevereGuide.reflectMotion(pts, m)  // the same motion with its part at right angles to the line turned round and its part along the line kept: what a line's arrow does when its sides are flipped
 *
 * A classic script that sets `globalThis.HFSevereGuide`.
 */
(function () {
  'use strict';

  function sideNormal(pts, side) {
    const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (!(L > 0)) return null;
    const lx = -dy / L, ly = dx / L;                                                                         // the left of the way the line is drawn (x east, y north)
    return side === 'right' ? [-lx, -ly] : [lx, ly];
  }
  const dotN = (pts, side, m) => { const n = sideNormal(pts, side); return n ? n[0] * m[0] + n[1] * m[1] : 0; };
  function faceSide(pts, dir) { return dotN(pts, 'left', dir) < 0 ? 'right' : 'left'; }
  function sideOfMotion(pts, m) { const d = dotN(pts, 'left', [m.u || 0, m.v || 0]); return Math.abs(d) < 1e-9 ? null : d > 0 ? 'left' : 'right'; }
  function reflectMotion(pts, m) {
    const n = sideNormal(pts, 'left'); if (!n) return { u: m.u, v: m.v };
    const d = n[0] * m.u + n[1] * m.v; return { u: Math.round((m.u - 2 * d * n[0]) * 10) / 10, v: Math.round((m.v - 2 * d * n[1]) * 10) / 10 };
  }
  const lengthOf = (pts) => { let s = 0; for (let i = 0; i < pts.length - 1; i++) s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return s; };

  function warnings(drawing) {
    const out = [], objs = (drawing && drawing.objects) || [], name = { cold: 'cold front', warm: 'warm front', stationary: 'stationary front', occluded: 'occluded front' };
    objs.forEach((o, index) => {
      const lined = o.pts && o.pts.length >= 2, m = o.motion || { u: 0, v: 0 }, sp = Math.hypot(m.u || 0, m.v || 0);
      if (o.type === 'front') {
        const kind = o.kind || 'cold', cold = o.cold || 'left', toCold = lined ? sideNormal(o.pts, cold) : null, toward = toCold ? (m.u || 0) * toCold[0] + (m.v || 0) * toCold[1] : 0;
        if ((kind === 'cold' || kind === 'occluded') && toward > 1) out.push({ level: 'warn', index, text: 'This ' + name[kind] + ' moves into the cold air: a cold front advances towards the warm air. Turn its arrow or flip its sides.' });
        if (kind === 'warm' && toward < -1) out.push({ level: 'warn', index, text: 'This warm front moves into the warm air: a warm front pushes the cold air back. Turn its arrow or flip its sides.' });
        if (kind === 'stationary' && sp > 3) out.push({ level: 'info', index, text: 'A stationary front that moves at ' + sp.toFixed(1) + ' m/s is not stationary: give it an arrow under 3 m/s, or make it a cold or warm front.' });
        if (o.contrast !== undefined && o.contrast < 2) out.push({ level: 'info', index, text: 'A front with a temperature contrast under 2 K is hardly a front.' });
      } else if (o.type === 'outflow') {
        const toCool = lined ? sideNormal(o.pts, o.cool || 'left') : null, toward = toCool ? (m.u || 0) * toCool[0] + (m.v || 0) * toCool[1] : 0;
        if (toward > 1) out.push({ level: 'warn', index, text: 'This outflow boundary moves back into its own cold air: a gust front pushes out into the warm air, and its ticks point the way it goes. Turn its arrow or flip its sides.' });
      } else if (o.type === 'dryline') {
        if (o.contrast !== undefined && o.contrast < 3) out.push({ level: 'warn', index, text: 'A dryline needs a contrast in the dew point: under 3 K it is only a line.' });
      }
      if (lined && ['front', 'dryline', 'outflow', 'trough'].includes(o.type) && lengthOf(o.pts) < 40) out.push({ level: 'info', index, text: 'This line is under 40 km long: a front or a dryline is hundreds of kilometres.' });
    });
    return out;
  }

  /* what to expect: the storm mode first (it takes the instability, the cap and the shear in that order), then the hazards each threshold opens */
  function expect(ix) {
    const cape = ix.mlcape, cin = ix.mlcin, sh = ix.shear06, srh1 = ix.srh01, srh3 = ix.srh03, lcl = ix.mllcl, stp = ix.stp, notes = [], hazards = [];
    let mode;
    if (!(cape >= 250)) mode = 'No storms: there is hardly any instability (' + Math.round(cape || 0) + ' J/kg of CAPE).';
    else if (cin <= -150) mode = 'Capped: a lid of ' + Math.round(-cin) + ' J/kg stops storms unless something lifts the air strongly.';
    else if (sh >= 18 && srh3 >= 150) mode = 'Supercells.';
    else if (sh >= 15) mode = 'Organised multicell storms and lines.';
    else mode = 'Pulse storms: short-lived, with downbursts.';
    if (cape >= 250 && cin > -150) {
      if (sh >= 18 && srh3 >= 150) {
        if (cape >= 2000) hazards.push(cape >= 3000 ? 'very large hail' : 'large hail');
        if (stp >= 1 && lcl < 1500) hazards.push(stp >= 3 ? 'strong tornadoes' : 'tornadoes');
        else if (srh1 >= 100 && lcl < 1500) hazards.push('weak tornadoes');
        hazards.push('damaging wind');
      } else if (sh >= 15) { hazards.push('damaging wind'); if (cape >= 2000) hazards.push('large hail'); }
      else hazards.push(cape >= 1500 ? 'downbursts and hail' : 'brief gusty winds');
      if (cin <= -50) notes.push('a cap of ' + Math.round(-cin) + ' J/kg: storms need lift (a front, a dryline) to start');
      if (lcl >= 1500) notes.push('a high cloud base (' + Math.round(lcl) + ' m): hail and wind more likely than tornadoes');
      else if (lcl < 1000) notes.push('a low cloud base (' + Math.round(lcl) + ' m): helps tornadoes');
    }
    return { mode, hazards, notes };
  }

  globalThis.HFSevereGuide = { warnings, expect, sideNormal, faceSide, sideOfMotion, reflectMotion };
})();
