// Storage. Inside the app this talks to the Rust side; opened in a plain
// browser (for development) it falls back to localStorage.
window.Store = (() => {
  const T = window.__TAURI__;
  const invoke = T && T.core && T.core.invoke;
  const native = !!invoke;
  const blobCache = new Map();

  async function load() {
    if (native) {
      const s = await invoke('load_data');
      return s ? JSON.parse(s) : null;
    }
    return JSON.parse(localStorage.getItem('stratbook') || 'null');
  }

  async function save(json) {
    if (native) return invoke('save_data', { json });
    localStorage.setItem('stratbook', json);
  }

  async function putBlob(key, data) {
    blobCache.set(key, data);
    if (native) return invoke('save_blob', { key, data });
    localStorage.setItem('blob:' + key, data);
  }

  async function getBlob(key) {
    if (!key) return null;
    if (blobCache.has(key)) return blobCache.get(key);
    const data = native ? await invoke('load_blob', { key }) : localStorage.getItem('blob:' + key);
    if (data) blobCache.set(key, data);
    return data || null;
  }

  function cachedBlob(key) { return blobCache.get(key) || null; }

  async function delBlob(key) {
    blobCache.delete(key);
    if (native) return invoke('delete_blob', { key });
    localStorage.removeItem('blob:' + key);
  }

  // Returns where the file went (a path in the app, or null in a browser).
  async function exportText(name, contents) {
    if (native) return invoke('export_text', { name, contents });
    download(name, URL.createObjectURL(new Blob([contents], { type: 'application/json' })));
    return null;
  }

  async function exportImage(name, dataUrl) {
    if (native) return invoke('export_data_url', { name, dataUrl });
    download(name, dataUrl);
    return null;
  }

  function download(name, href) {
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.append(a); a.click(); a.remove();
  }

  async function dataPath() {
    return native ? invoke('data_path') : 'browser storage';
  }

  // Run fn before the window closes so the last edit is never lost.
  function onClose(fn) {
    if (native && T.window && T.window.getCurrentWindow) {
      T.window.getCurrentWindow().onCloseRequested(async () => { await fn(); });
    }
  }

  // Download an image from a web link. In the app the Rust side does it
  // (no browser CORS limits); in a plain browser we try fetch().
  async function fetchImage(url) {
    if (native) return invoke('fetch_image', { url });
    const r = await fetch(url);
    if (!r.ok) throw new Error('download failed (' + r.status + ')');
    const b = await r.blob();
    return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  }

  async function openWeb(url) {
    if (native) return invoke('open_web', { url });
    window.open(url, 'stratbook-web', 'width=820,height=880');
  }

  return { native, fetchImage, openWeb, load, save, putBlob, getBlob, cachedBlob, delBlob, exportText, exportImage, dataPath, onClose };
})();

// Shrink an image (a File/Blob or a data URL) to a compact WebP data URL.
// Keeps transparency, so icons with clear backgrounds stay clear.
window.dataUrlToBlob = function (url) {
  const [head, b64] = url.split(',');
  const type = (/data:([^;,]+)/.exec(head) || [])[1] || 'image/png';
  const bin = head.includes(';base64') ? atob(b64) : decodeURIComponent(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};

window.shrinkImage = async function (src, maxSide, quality) {
  const blob = typeof src === 'string' ? dataUrlToBlob(src) : src;
  const objUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('that file is not an image this app can read')); img.src = objUrl; });
    const iw = img.naturalWidth || 256, ih = img.naturalHeight || 256;
    const scale = Math.min(1, maxSide / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale)), h = Math.max(1, Math.round(ih * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    let url = c.toDataURL('image/webp', quality);
    if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
    return { url, w, h };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
};
