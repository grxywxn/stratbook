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

  return { native, load, save, putBlob, getBlob, cachedBlob, delBlob, exportText, exportImage, dataPath, onClose };
})();

// Shrink an image file to a compact WebP data URL (keeps storage small).
window.shrinkImage = async function (file, maxSide, quality) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close && bmp.close();
  let url = c.toDataURL('image/webp', quality);
  if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', quality);
  return { url, w, h };
};
