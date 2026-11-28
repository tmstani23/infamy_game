// Speech bubbles over heads anywhere (cast 'say': { a: entity id, text, place }), 2026-11-28 (the shakedown
// crew, owner and hostages talk, English lines in bubbles like the wandering folk's, render/folk_fx.js 'folkSay').
// The same look: a dark slip with a brass edge and cream letters, a little see-through, a small tail down to the
// speaker. It rides on the speaker's sprite, so it shows only where he is drawn (street, room or island), holds a few
// seconds and fades. One at a time per speaker; at most max at once (the oldest goes).
// createSayFx({ scene, spriteOf }) -> { cast(c), update(dt, state), clear() }
import * as THREE from 'three';

const SAY = { seconds: 2.8, fade: 0.5, rise: 0.25, up: 3.05, pxPerUnit: 105, font: '600 24px Lantern, Georgia, serif', opacity: 0.9, max: 6 };
function sayTexture(text) {
  const probe = document.createElement('canvas').getContext('2d'); probe.font = SAY.font;
  const w = Math.ceil(Math.min(420, probe.measureText(text).width) + 30), h = 52, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(14,12,10,.74)'; g.strokeStyle = 'rgba(190,150,84,.9)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(2, 2, w - 4, 36, 8); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(w / 2 - 8, 38); g.lineTo(w / 2, 50); g.lineTo(w / 2 + 8, 38); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(w / 2 - 8, 38); g.lineTo(w / 2, 50); g.lineTo(w / 2 + 8, 38); g.stroke();
  g.fillStyle = 'rgba(14,12,10,1)'; g.fillRect(w / 2 - 7, 35, 14, 4);
  g.font = SAY.font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f1e4c7'; g.shadowColor = '#000'; g.shadowBlur = 3;
  g.fillText(text, w / 2, 21, w - 22);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { t, w, h };
}

export function createSayFx({ scene, spriteOf = () => null }) {
  const says = [];
  const drop = b => { scene.remove(b.m); b.m.material.map?.dispose(); b.m.material.dispose(); const i = says.indexOf(b); if (i >= 0) says.splice(i, 1); };
  function cast(c) {
    if (c.kind !== 'say' || !c.text || c.a == null) return;
    for (const b of says.filter(b => b.id === c.a)) drop(b);
    if (says.length >= SAY.max) drop(says[0]);
    const { t, w, h } = sayTexture(String(c.text));
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthTest: false }));
    m.renderOrder = 99870; m.center.set(0.5, 0); m.scale.set(w / SAY.pxPerUnit, h / SAY.pxPerUnit, 1); m.visible = false;
    scene.add(m);
    says.push({ m, id: c.a, age: 0 });
  }
  function update(dt, state) {
    for (const b of [...says]) {
      b.age += Math.min(dt, 0.1);
      const e = state?.entities?.[b.id], s = spriteOf(b.id);
      if (b.age >= SAY.seconds || !e || e.dead || e.downed) { drop(b); continue; }
      const shown = !!s?.pos && s.thing?.mesh?.visible !== false;
      b.m.visible = shown;
      if (!shown) continue;
      const a = Math.min(1, b.age / 0.15, (SAY.seconds - b.age) / SAY.fade);
      b.m.position.set(s.pos.x, s.pos.y + SAY.up * (e.tiny ? 0.6 : 1) + SAY.rise * Math.min(1, b.age / 0.3), s.pos.z);
      b.m.material.opacity = SAY.opacity * a;
    }
  }
  return { cast, update, clear: () => { for (const b of [...says]) drop(b); } };
}
