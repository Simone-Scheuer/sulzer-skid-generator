/**
 * Pump Skid Baseframe Generator
 *
 * Generates the welded steel baseframe for an API 610 pump-and-driver set.
 * Pick a pump and a driver and the tool sizes the frame and crossmembers,
 * lays out the machined mounting pads and bolt holes, sets the deck drainage
 * slope, estimates steel mass and cost, and exports a DXF drawing plus an
 * OnShape configuration payload.
 *
 * Everything is derived from one geometry model expressed in "skid coordinates":
 * origin at the bottom-left corner, x along the length, y across the width,
 * millimetres, y-up. Each renderer (SVG plan, three.js scene, DXF) reads that
 * single model so the views stay consistent.
 *
 * Sizing rules are intentionally simplified for a demonstration: representative
 * equipment dimensions and a flat 1.5x dynamic factor. A real design would size
 * members against load calculations and a full bolt/weld check.
 */

'use strict';

// ---------------------------------------------------------------------------
// Reference data (real Sulzer / IEC designations; dimensions are representative)
// ---------------------------------------------------------------------------
const PUMPS = [
  { id:'ohhl', name:'OHHL · OH2 low-flow',        L:1100, W:560,  H:580,  mass:290,  shaft:240 },
  { id:'ohh',  name:'OHH · OH2 overhung',         L:1450, W:680,  H:720,  mass:480,  shaft:300 },
  { id:'mbn',  name:'MBN · BB1 between-bearings',  L:1900, W:820,  H:820,  mass:760,  shaft:380 },
  { id:'bbt',  name:'BBT · BB2 between-bearings',  L:2150, W:880,  H:900,  mass:1020, shaft:420 },
  { id:'hpt',  name:'HPT · BB5 barrel multistage', L:2600, W:1000, H:1050, mass:1680, shaft:480 },
];

const DRIVERS = [
  { id:'m200', name:'IEC 200L · 30 kW motor',      L:780,  W:420, H:500, mass:360,  shaft:240 },
  { id:'m280', name:'IEC 280M · 90 kW motor',      L:1020, W:560, H:640, mass:690,  shaft:300 },
  { id:'m355', name:'IEC 355M · 250 kW motor',     L:1350, W:700, H:800, mass:1250, shaft:380 },
  { id:'turb', name:'Steam turbine · single-stage', L:1600, W:760, H:820, mass:980,  shaft:400 },
];

const DECK_PLATE_KG_PER_M2 = 47.1;                              // 6 mm steel plate
const RATE = { material:1.30, fab:3.20, coating:45, bolt:4 };   // USD
const GRADE_COST_MULTIPLIER = { 'A240-316L':3.4, 'S355JR':1.12, 'S275JR':1 };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const el = id => document.getElementById(id);
const roundTo50 = v => Math.round(v / 50) * 50;
const num = n => Math.round(n).toLocaleString('en-US');

// Main rail channel, selected by design load (kg).
function selectRail(load) {
  if (load < 800)  return { profile:'UPN 160', kgPerM:18.8, depth:160, flange:65 };
  if (load < 2000) return { profile:'UPN 200', kgPerM:25.3, depth:200, flange:75 };
  if (load < 3500) return { profile:'UPN 260', kgPerM:37.9, depth:260, flange:90 };
  return { profile:'UPN 300', kgPerM:46.2, depth:300, flange:100 };
}

// Hold-down bolt, sized by the equipment mass it carries (kg).
function selectBolt(mass) {
  if (mass < 500)  return { size:'M16', hole:18 };
  if (mass < 1000) return { size:'M20', hole:22 };
  if (mass < 2000) return { size:'M24', hole:26 };
  return { size:'M30', hole:33 };
}

// ---------------------------------------------------------------------------
// Engineering model: reads the form and returns geometry + computed spec.
// ---------------------------------------------------------------------------
function buildModel() {
  const pump   = PUMPS.find(p => p.id === el('pump').value);
  const driver = DRIVERS.find(d => d.id === el('driver').value);
  const gap    = Math.max(150, +el('gap').value || 350);
  const clear  = Math.max(100, +el('clear').value || 200);
  const grade  = el('grade').value;
  const slopeRatio = +el('slope').value;
  const endClear = 150;

  // Overall envelope: equipment in-line on a common shaft centreline + clearances.
  const L = roundTo50(endClear + pump.L + gap + driver.L + endClear);
  const W = roundTo50(Math.max(pump.W, driver.W) + 2 * clear);

  const operatingMass = pump.mass + driver.mass;
  const designLoad = operatingMass * 1.5;            // simplified dynamic factor
  const rail = selectRail(designLoad);
  const height = rail.depth + 6;                      // rail depth + deck plate
  const flange = rail.flange;

  const slopeDeg = Math.atan(1 / slopeRatio) * 180 / Math.PI;
  const slopePct = 100 / slopeRatio;
  const slopeDrop = Math.round(L / slopeRatio);
  const shim  = Math.abs(pump.shaft - driver.shaft);
  const lower = pump.shaft < driver.shaft ? 'pump' : 'driver';

  // Equipment centres on the shaft centreline.
  const cy = W / 2;
  const pumpCx   = endClear + pump.L / 2;
  const driverCx = endClear + pump.L + gap + driver.L / 2;

  const pumpBolt   = selectBolt(pump.mass);
  const driverBolt = selectBolt(driver.mass);
  const anchorBolt = { size:'M24', hole:26 };

  // Foot bolt patterns sit inside each footprint.
  const pumpFootL   = Math.round(pump.L * 0.6),   pumpFootW   = Math.round(pump.W - 160);
  const driverFootL = Math.round(driver.L * 0.6), driverFootW = Math.round(driver.W - 160);

  // Hold-down holes (four per unit) + perimeter anchor holes.
  const holes = [];
  [
    { cx:pumpCx,   fL:pumpFootL,   fW:pumpFootW,   bolt:pumpBolt,   type:'pump' },
    { cx:driverCx, fL:driverFootL, fW:driverFootW, bolt:driverBolt, type:'driver' },
  ].forEach(({ cx, fL, fW, bolt, type }) => {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      holes.push({ x:cx + sx * fL / 2, y:cy + sy * fW / 2, d:bolt.hole, t:type });
    }
  });

  const anchorInset = 70;
  const anchorBays = Math.max(1, Math.ceil((L - 2 * anchorInset) / 1500));
  for (let i = 0; i <= anchorBays; i++) {
    const x = anchorInset + (L - 2 * anchorInset) * i / anchorBays;
    holes.push({ x, y:anchorInset,     d:anchorBolt.hole, t:'anchor' });
    holes.push({ x, y:W - anchorInset, d:anchorBolt.hole, t:'anchor' });
  }
  const anchorCount = holes.filter(h => h.t === 'anchor').length;

  // Machined pads under each equipment foot (excludes anchors).
  const PAD = 140;
  const pads = holes
    .filter(h => h.t !== 'anchor')
    .map(h => ({ x:h.x - PAD / 2, y:h.y - PAD / 2, w:PAD, h:PAD }));

  // Crossmembers: ends + under each equipment foot line, then filled so no bay
  // spans more than 700 mm (loads transfer into steel, not unsupported deck).
  let stations = [endClear, L - endClear,
    pumpCx - pumpFootL / 2, pumpCx + pumpFootL / 2,
    driverCx - driverFootL / 2, driverCx + driverFootL / 2];
  stations = [...new Set(stations.map(Math.round))].sort((a, b) => a - b);

  const crossX = [stations[0]];
  for (let i = 1; i < stations.length; i++) {
    const prev = crossX[crossX.length - 1], next = stations[i], span = next - prev;
    if (span > 700) {
      const n = Math.ceil(span / 700);
      for (let k = 1; k < n; k++) crossX.push(Math.round(prev + span * k / n));
    }
    crossX.push(next);
  }

  const cross = crossX.map(x => ({ x:x - flange / 2, y:flange, w:flange, h:W - 2 * flange }));
  const rails = [{ x:0, y:0, w:L, h:flange }, { x:0, y:W - flange, w:L, h:flange }];
  const ends  = [{ x:0, y:flange, w:flange, h:W - 2 * flange }, { x:L - flange, y:flange, w:flange, h:W - 2 * flange }];
  const equip = [
    { x:endClear, y:cy - pump.W / 2, w:pump.L, h:pump.W, label:'PUMP', color:'#36b3a8' },
    { x:endClear + pump.L + gap, y:cy - driver.W / 2, w:driver.L, h:driver.W, label:'DRIVER', color:'#5aa9e6' },
  ];

  // Mass + rough fabricated cost.
  const railLengthM = (2 * L + cross.length * (W - 2 * flange)) / 1000;
  const deckAreaM2 = (L * W) / 1e6;
  const steelMass = Math.round(railLengthM * rail.kgPerM + deckAreaM2 * DECK_PLATE_KG_PER_M2);
  const boltCount = 8 + anchorCount;
  const cost = Math.round(
    steelMass * RATE.material * GRADE_COST_MULTIPLIER[grade] +
    steelMass * RATE.fab +
    deckAreaM2 * RATE.coating +
    boltCount * RATE.bolt
  );

  return {
    pump, driver, gap, grade, endClear,
    slopeRatio, slopeDeg, slopePct, slopeDrop, shim, lower,
    L, W, height, rail, nCross:cross.length, operatingMass, designLoad, steelMass, cost,
    cy, pumpCx, driverCx, pumpBolt, driverBolt, anchorBolt, anchorCount,
    holes, pads, cross, rails, ends, equip,
  };
}

// ---------------------------------------------------------------------------
// SVG plan view
// ---------------------------------------------------------------------------
function renderPlan(m) {
  const pad = 360, vw = m.L + pad * 2, vh = m.W + pad * 2, fs = Math.round(vw / 48);
  const X = x => pad + x;             // skid -> SVG
  const Y = y => pad + (m.W - y);     // flip y (SVG is y-down)
  const rect = (r, fill, stroke, sw) =>
    `<rect x="${X(r.x)}" y="${Y(r.y + r.h)}" width="${r.w}" height="${r.h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;

  let s = `<svg class="plan" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">`;
  s += `<rect x="${pad}" y="${pad}" width="${m.L}" height="${m.W}" fill="#0d1016" stroke="#8a99a8" stroke-width="6"/>`;
  m.rails.forEach(r => s += rect(r, '#8a99a81f', '#8a99a8', 3));
  m.ends.forEach(r => s += rect(r, '#8a99a81f', '#8a99a8', 3));
  m.cross.forEach(r => s += rect(r, '#39414b55', '#5b6675', 2));

  m.equip.forEach(e => {
    s += `<rect x="${X(e.x)}" y="${Y(e.y + e.h)}" width="${e.w}" height="${e.h}" fill="none" stroke="${e.color}" stroke-width="4" stroke-dasharray="20 12"/>`;
    s += `<text x="${X(e.x + e.w / 2)}" y="${Y(e.y + e.h / 2)}" fill="${e.color}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" font-family="monospace">${e.label}</text>`;
  });
  m.pads.forEach(p => s += rect(p, 'none', '#6f7a86', 2));

  const holeColor = { pump:'#36b3a8', driver:'#5aa9e6', anchor:'#d9a441' };
  m.holes.forEach(h => {
    const cx = X(h.x), cy = Y(h.y), r = h.d / 2, c = holeColor[h.t];
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="3"/>`;
    s += `<line x1="${cx - r - 8}" y1="${cy}" x2="${cx + r + 8}" y2="${cy}" stroke="${c}66" stroke-width="2"/>`;
    s += `<line x1="${cx}" y1="${cy - r - 8}" x2="${cx}" y2="${cy + r + 8}" stroke="${c}66" stroke-width="2"/>`;
  });

  // Shaft centreline + overall dimensions.
  s += `<line x1="${pad - 70}" y1="${Y(m.cy)}" x2="${pad + m.L + 70}" y2="${Y(m.cy)}" stroke="#5aa9e655" stroke-width="2" stroke-dasharray="30 14 6 14"/>`;
  const tick = (x, y) => `<line x1="${x}" y1="${y - 24}" x2="${x}" y2="${y + 24}" stroke="#7e8895" stroke-width="3"/>`;
  const yLine = pad + m.W + 210;
  s += `<line x1="${pad}" y1="${yLine}" x2="${pad + m.L}" y2="${yLine}" stroke="#7e8895" stroke-width="3"/>${tick(pad, yLine)}${tick(pad + m.L, yLine)}`;
  s += `<text x="${pad + m.L / 2}" y="${yLine + fs + 8}" fill="#cfd8e0" font-size="${fs}" text-anchor="middle" font-family="monospace">${num(m.L)}</text>`;
  const xLine = pad - 180;
  s += `<line x1="${xLine}" y1="${pad}" x2="${xLine}" y2="${pad + m.W}" stroke="#7e8895" stroke-width="3"/><line x1="${xLine - 24}" y1="${pad}" x2="${xLine + 24}" y2="${pad}" stroke="#7e8895" stroke-width="3"/><line x1="${xLine - 24}" y1="${pad + m.W}" x2="${xLine + 24}" y2="${pad + m.W}" stroke="#7e8895" stroke-width="3"/>`;
  s += `<text x="${xLine - 14}" y="${pad + m.W / 2}" fill="#cfd8e0" font-size="${fs}" text-anchor="middle" font-family="monospace" transform="rotate(-90 ${xLine - 14} ${pad + m.W / 2})">${num(m.W)}</text>`;
  s += `</svg>`;

  el('plan').outerHTML = s.replace('<svg class="plan"', '<svg class="plan" id="plan"');
}

// ---------------------------------------------------------------------------
// Computed spec table
// ---------------------------------------------------------------------------
function renderSpecs(m) {
  const rows = [
    ['Skid length', num(m.L), 'mm'],
    ['Skid width', num(m.W), 'mm'],
    ['Frame height', num(m.height), 'mm'],
    ['Main rails', `2 × ${m.rail.profile}`, ''],
    ['Crossmembers', m.nCross, ''],
    ['Deck slope', `1:${m.slopeRatio}`, `(${m.slopePct.toFixed(2)}%)`],
    ['Slope drop', num(m.slopeDrop), 'mm'],
    ['Operating mass', num(m.operatingMass), 'kg'],
    ['Design load ×1.5', num(m.designLoad), 'kg'],
    ['Steel mass', num(m.steelMass), 'kg'],
    ['Pump hold-down', `4 × ${m.pumpBolt.size}`, ''],
    ['Driver hold-down', `4 × ${m.driverBolt.size}`, ''],
    ['Anchor bolts', `${m.anchorCount} × ${m.anchorBolt.size}`, ''],
  ];
  let html = rows.map(([k, v, u]) => `<tr><td>${k}</td><td>${v}<span class="u">${u}</span></td></tr>`).join('');
  html += `<tr class="cost-row"><td>Est. fabricated cost</td><td>$${num(m.cost)}</td></tr>`;
  el('specs').innerHTML = html;
}

// ---------------------------------------------------------------------------
// OnShape configuration payload (configuration-update format)
// ---------------------------------------------------------------------------
function renderConfigPayload(m) {
  const quantity = (id, expr) => ({ btType:'BTMParameterQuantity-147', parameterId:id, expression:expr });
  const choice   = (id, value) => ({ btType:'BTMParameterEnum-145', parameterId:id, namespace:'', value });

  const payload = {
    currentConfiguration: [
      quantity('skidLength', `${m.L} mm`),
      quantity('skidWidth', `${m.W} mm`),
      quantity('frameHeight', `${m.height} mm`),
      quantity('deckSlope', `${m.slopeDeg.toFixed(3)} deg`),
      quantity('crossmemberCount', `${m.nCross}`),
      quantity('pumpBoltHole', `${m.pumpBolt.hole} mm`),
      quantity('driverBoltHole', `${m.driverBolt.hole} mm`),
      quantity('anchorBoltHole', `${m.anchorBolt.hole} mm`),
      quantity('anchorCount', `${m.anchorCount}`),
      choice('mainRailProfile', m.rail.profile.replace(/\s/g, '_')),
      choice('steelGrade', m.grade),
    ],
  };
  el('json').textContent = JSON.stringify(payload, null, 2);
}

// ---------------------------------------------------------------------------
// DXF export: plain ASCII R12, multi-layer, millimetres. Opens in any CAD.
// ---------------------------------------------------------------------------
function generateDXF(m) {
  const n = v => (+v).toFixed(2);
  const line = (x1, y1, x2, y2, layer) =>
    `0\nLINE\n8\n${layer}\n10\n${n(x1)}\n20\n${n(y1)}\n30\n0\n11\n${n(x2)}\n21\n${n(y2)}\n31\n0\n`;
  const circle = (x, y, r, layer) =>
    `0\nCIRCLE\n8\n${layer}\n10\n${n(x)}\n20\n${n(y)}\n30\n0\n40\n${n(r)}\n`;
  const text = (x, y, h, str, layer) =>
    `0\nTEXT\n8\n${layer}\n10\n${n(x)}\n20\n${n(y)}\n30\n0\n40\n${n(h)}\n1\n${str}\n`;
  const rect = (r, layer) =>
    line(r.x, r.y, r.x + r.w, r.y, layer) +
    line(r.x + r.w, r.y, r.x + r.w, r.y + r.h, layer) +
    line(r.x + r.w, r.y + r.h, r.x, r.y + r.h, layer) +
    line(r.x, r.y + r.h, r.x, r.y, layer);

  const layers = [
    ['FRAME', 2], ['CROSS', 4], ['DECK', 8], ['EQUIP', 3], ['PADS', 6],
    ['HOLES', 1], ['DIMS', 7], ['NOTES', 7], ['TITLE', 5],
  ];

  let body = '';
  body += rect({ x:0, y:0, w:m.L, h:m.W }, 'DECK');
  m.rails.forEach(r => body += rect(r, 'FRAME'));
  m.ends.forEach(r => body += rect(r, 'FRAME'));
  m.cross.forEach(r => body += rect(r, 'CROSS'));
  m.pads.forEach(p => body += rect(p, 'PADS'));
  m.equip.forEach(e => {
    body += rect(e, 'EQUIP');
    body += text(e.x + e.w / 2 - 90, e.y + e.h / 2 - 25, 50, e.label, 'EQUIP');
  });
  m.holes.forEach(h => {
    body += circle(h.x, h.y, h.d / 2, 'HOLES');
    body += line(h.x - h.d, h.y, h.x + h.d, h.y, 'HOLES');   // centre marks
    body += line(h.x, h.y - h.d, h.x, h.y + h.d, 'HOLES');
  });

  // Overall dimensions.
  const dimY = -120;
  body += line(0, dimY, m.L, dimY, 'DIMS') + line(0, dimY - 30, 0, dimY + 30, 'DIMS') +
    line(m.L, dimY - 30, m.L, dimY + 30, 'DIMS') + text(m.L / 2 - 90, dimY - 90, 55, `${Math.round(m.L)}`, 'DIMS');
  const dimX = -150;
  body += line(dimX, 0, dimX, m.W, 'DIMS') + line(dimX - 30, 0, dimX + 30, 0, 'DIMS') +
    line(dimX - 30, m.W, dimX + 30, m.W, 'DIMS') + text(dimX - 120, m.W / 2, 55, `${Math.round(m.W)}`, 'DIMS');

  // Title + general notes.
  const titleY = m.W + 90;
  const pumpName = m.pump.name.split(' · ')[0], driverName = m.driver.name.split(' · ')[0];
  body += text(0, titleY + 170, 75, `PUMP SKID BASEFRAME  -  ${pumpName} / ${driverName}`, 'TITLE');
  body += text(0, titleY + 90, 45, `API 610  |  ${m.rail.profile} rails  |  ${m.grade}  |  slope 1:${m.slopeRatio}  |  DRAWN S.SCHEUER  REV A  (mm)`, 'TITLE');

  const notes = [
    `1. WELDS 6mm CONT. FILLET ALL-AROUND TO AWS D1.1.`,
    `2. MOUNTING PADS MACHINED FLAT & COPLANAR WITHIN 0.10mm AFTER WELDING.`,
    `3. DECK 6mm PLATE, SLOPE 1:${m.slopeRatio} TOWARD PUMP END, SEAL-WELDED.`,
    `4. PUMP HOLD-DOWN 4x O${m.pumpBolt.hole}(${m.pumpBolt.size}); DRIVER 4x O${m.driverBolt.hole}(${m.driverBolt.size}); ANCHOR ${m.anchorCount}x O${m.anchorBolt.hole}(${m.anchorBolt.size}).`,
    `5. STRESS-RELIEVE BEFORE FINAL MACHINING. GALV/PAINT PER SPEC.`,
  ];
  notes.forEach((note, i) => body += text(0, -260 - i * 80, 42, note, 'NOTES'));

  let layerTable = `0\nTABLE\n2\nLAYER\n70\n${layers.length}\n`;
  layers.forEach(([name, color]) => layerTable += `0\nLAYER\n2\n${name}\n70\n0\n62\n${color}\n6\nCONTINUOUS\n`);
  layerTable += `0\nENDTAB\n`;

  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n` +
    `0\nSECTION\n2\nTABLES\n${layerTable}0\nENDSEC\n` +
    `0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;
}

function downloadFile(name, contents, mime) {
  const blob = new Blob([contents], { type:mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// 3D preview (three.js). Simplified blocks on the generated frame.
// ---------------------------------------------------------------------------
let scene3d = {};

function makeBox(w, h, d, color, metalness, roughness) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, metalness, roughness })
  );
}

function initScene() {
  try {
    const canvas = el('view');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d12);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(3.6, 2.4, 3.8);

    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.autoRotate = false;
    controls.minDistance = 2.2;
    controls.maxDistance = 10;
    controls.target.set(0, 0.3, 0);

    scene.add(new THREE.AmbientLight(0xb8c4d0, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.95); key.position.set(4, 6, 3); scene.add(key);
    const fill = new THREE.DirectionalLight(0x6f86a8, 0.5); fill.position.set(-4, 2, -3); scene.add(fill);
    const grid = new THREE.GridHelper(20, 40, 0x1d2530, 0x141a22); grid.position.y = -0.02; scene.add(grid);

    const skid = new THREE.Group();
    scene.add(skid);

    scene3d = { renderer, scene, camera, controls, skid, canvas };
    scene3d.resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', scene3d.resize);
    scene3d.resize();

    (function loop() {
      requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    })();
  } catch (err) {
    el('view').outerHTML =
      `<div class="v-fallback">3D render unavailable; specs, plan, DXF and payload are unaffected. (${err.message})</div>`;
    el('vhint').style.display = 'none';
    scene3d = null;
  }
}

function buildScene(m) {
  if (!scene3d) return;
  const g = scene3d.skid;
  while (g.children.length) g.remove(g.children[0]);

  const S = 1 / 1000;                                   // mm -> m
  const L = m.L * S, W = m.W * S, H = m.height * S;
  const STEEL = 0x8a96a3, DECK = 0x59636e;
  const beam = (w, h, d, color) => makeBox(w, h, d, color, 0.8, 0.5);

  // Frame grouped on its own so the true drainage slope tilts the deck only.
  const frame = new THREE.Group();
  g.add(frame);
  const railA = beam(L, H, 0.06, STEEL); railA.position.set(0, H / 2, W / 2 - 0.03); frame.add(railA);
  const railB = beam(L, H, 0.06, STEEL); railB.position.set(0, H / 2, -(W / 2 - 0.03)); frame.add(railB);
  const endA = beam(0.06, H, W, STEEL); endA.position.set(-L / 2 + 0.03, H / 2, 0); frame.add(endA);
  const endB = beam(0.06, H, W, STEEL); endB.position.set(L / 2 - 0.03, H / 2, 0); frame.add(endB);
  m.cross.forEach(c => {
    const x = (c.x + c.w / 2) / 1000 - L / 2;
    const member = beam(0.05, H * 0.85, W - 0.12, STEEL);
    member.position.set(x, H * 0.45, 0);
    frame.add(member);
  });
  const deck = beam(L, 0.012, W, DECK); deck.position.set(0, H + 0.006, 0); frame.add(deck);
  frame.rotation.z = Math.atan(1 / m.slopeRatio);

  const topY = H + 0.012, PAD_H = 0.025;

  // Pads, anchors, equipment and coupling are parented to the frame group so
  // they tilt with the deck and stay flush at any drainage slope.
  m.pads.forEach(p => {
    const pad = makeBox(0.14, PAD_H, 0.14, 0xb9c4ce, 0.6, 0.35);
    pad.position.set((p.x + 70) * S - L / 2, topY + PAD_H / 2, (p.y + 70) * S - W / 2);
    frame.add(pad);
  });
  m.holes.filter(h => h.t === 'anchor').forEach(h => {
    const stud = makeBox(0.05, 0.05, 0.05, 0x2b3038, 0.5, 0.5);
    stud.position.set(h.x * S - L / 2, topY + 0.025, h.y * S - W / 2);
    frame.add(stud);
  });

  const pumpX = m.pumpCx * S - L / 2, driverX = m.driverCx * S - L / 2;
  const pump = makeBox(m.pump.L * S, m.pump.H * S, m.pump.W * S, 0x2f9e8f, 0.45, 0.55);
  pump.position.set(pumpX, topY + PAD_H + m.pump.H * S / 2, 0); frame.add(pump);
  const driver = makeBox(m.driver.L * S, m.driver.H * S, m.driver.W * S, 0x4f7fae, 0.45, 0.55);
  driver.position.set(driverX, topY + PAD_H + m.driver.H * S / 2, 0); frame.add(driver);

  // Spacer coupling + guard bridging the shaft ends.
  const couplingX = (m.endClear + m.pump.L + m.gap / 2) * S - L / 2;
  const shaftCentre = Math.max(m.pump.shaft, m.driver.shaft) * S;
  const coupling = makeBox(m.gap * S + 0.10, 0.13, 0.13, 0xc9923a, 0.4, 0.6);
  coupling.position.set(couplingX, topY + PAD_H + shaftCentre, 0); frame.add(coupling);

  if (scene3d.resize) scene3d.resize();
}

// ---------------------------------------------------------------------------
// Wire-up
// ---------------------------------------------------------------------------
let lastModel = null;

function render() {
  const m = buildModel();
  renderPlan(m);
  renderSpecs(m);
  renderConfigPayload(m);
  buildScene(m);
  lastModel = m;
}

function init() {
  el('pump').innerHTML = PUMPS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  el('driver').innerHTML = DRIVERS.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  el('pump').value = 'mbn';
  el('driver').value = 'm280';

  ['pump', 'driver', 'gap', 'clear', 'slope', 'grade'].forEach(id => el(id).addEventListener('input', render));

  el('copy').addEventListener('click', () => {
    navigator.clipboard.writeText(el('json').textContent).then(() => {
      const btn = el('copy'), label = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = label), 1300);
    });
  });

  el('dxf').addEventListener('click', () => {
    const m = lastModel || buildModel();
    downloadFile(`pump-skid-${m.pump.id}-${m.driver.id}.dxf`, generateDXF(m), 'application/dxf');
  });

  initScene();
  render();
}

document.addEventListener('DOMContentLoaded', init);
