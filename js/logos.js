// Roof logos. For now they live on this device only: nobody else sees an uploaded logo until there's
// a server, and a logo only goes public after the automated scan (roadmap: Trust & safety).
// Every upload is redrawn onto a canvas and re-encoded, which strips EXIF/metadata and caps the size.
const KEY = 'claim-clone-space:logos';
export const LOGO_PX = 256;
const MAX_FILE = 8 * 1024 * 1024;

let store = {};
try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
const cache = new Map(); // src -> Image (null while loading or if it failed)

function image(src) {
  if (!src) return null;
  if (cache.has(src)) return cache.get(src);
  cache.set(src, null);
  const img = new Image();
  img.onload = () => cache.set(src, img);
  img.onerror = () => cache.set(src, null);
  img.src = src;
  return null;
}

const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch { return false; } };

// A player's lot logo (only drawn while the lot is theirs).
export const lotLogo = (id) => image(store[id]);
export const lotLogoSrc = (id) => store[id] || null;
// The Architects ship their logos with the game; nobody can change them in the editor.
export const architectLogo = (id) => image(`assets/architects/${id}.png`);

export function clearLotLogo(id) { delete store[id]; persist(); }

// File -> square PNG (WebP if the PNG is heavy), letterboxed on transparency.
export function setLotLogo(id, file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file chosen.'));
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error('Use a PNG, JPG, WebP or GIF.'));
    if (file.size > MAX_FILE) return reject(new Error('That file is over 8 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = c.height = LOGO_PX;
      const g = c.getContext('2d');
      const s = Math.min(LOGO_PX / img.width, LOGO_PX / img.height);
      const w = img.width * s, h = img.height * s;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, (LOGO_PX - w) / 2, (LOGO_PX - h) / 2, w, h);
      let data = c.toDataURL('image/png');
      if (data.length > 160_000) {
        const webp = c.toDataURL('image/webp', 0.9);
        if (webp.startsWith('data:image/webp') && webp.length < data.length) data = webp;
      }
      const prev = store[id];
      store[id] = data;
      if (!persist()) { if (prev) store[id] = prev; else delete store[id]; return reject(new Error('Not enough space on this device to keep that logo.')); }
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image.")); };
    img.src = url;
  });
}
