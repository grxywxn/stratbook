//! Stratbook's native side. It only does file storage; everything else lives
//! in the web frontend. Data sits in the app data folder:
//!   stratbook.json        the whole book (strats, guides, maps, boards)
//!   stratbook.json.bak    the previous save
//!   blobs/<key>.txt       imported images (blueprints, custom operator icons)

use std::{
    fs,
    io::{ErrorKind, Read},
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{AppHandle, Manager};

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("blobs")).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn blob_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    let ok = !key.is_empty()
        && key.len() <= 120
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !ok {
        return Err("invalid key".into());
    }
    Ok(data_dir(app)?.join("blobs").join(format!("{key}.txt")))
}

fn read_optional(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Write through a temp file and rename, so a crash never leaves half a file.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_data(app: AppHandle) -> Result<Option<String>, String> {
    read_optional(&data_dir(&app)?.join("stratbook.json"))
}

#[tauri::command]
fn save_data(app: AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?;
    let path = data_dir(&app)?.join("stratbook.json");
    if path.exists() {
        let _ = fs::copy(&path, path.with_extension("json.bak"));
    }
    write_atomic(&path, json.as_bytes())
}

#[tauri::command]
fn save_blob(app: AppHandle, key: String, data: String) -> Result<(), String> {
    write_atomic(&blob_path(&app, &key)?, data.as_bytes())
}

#[tauri::command]
fn load_blob(app: AppHandle, key: String) -> Result<Option<String>, String> {
    read_optional(&blob_path(&app, &key)?)
}

#[tauri::command]
fn delete_blob(app: AppHandle, key: String) -> Result<(), String> {
    match fs::remove_file(blob_path(&app, &key)?) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
fn data_path(app: AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.display().to_string())
}

/// Pick a free file name in the Downloads folder.
fn export_target(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|e| e.to_string())?;
    let clean: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || "-_. ".contains(c) { c } else { '-' })
        .collect();
    let clean = if clean.trim().is_empty() { "stratbook-export".to_string() } else { clean };
    let first = dir.join(&clean);
    if !first.exists() {
        return Ok(first);
    }
    let (stem, ext) = match clean.rsplit_once('.') {
        Some((s, e)) => (s.to_string(), format!(".{e}")),
        None => (clean.clone(), String::new()),
    };
    for n in 2..1000 {
        let p = dir.join(format!("{stem} ({n}){ext}"));
        if !p.exists() {
            return Ok(p);
        }
    }
    Err("could not find a free file name".into())
}

#[tauri::command]
fn export_text(app: AppHandle, name: String, contents: String) -> Result<String, String> {
    let path = export_target(&app, &name)?;
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn export_data_url(app: AppHandle, name: String, data_url: String) -> Result<String, String> {
    let b64 = data_url.split_once(',').map(|(_, b)| b).unwrap_or(&data_url);
    let bytes = decode_base64(b64)?;
    let path = export_target(&app, &name)?;
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// Open (or reuse) a second window that browses the web, so pictures can be
/// found and dragged or copied into Stratbook. That window gets no access to
/// Stratbook's commands; it is just a browser.
#[tauri::command]
async fn open_web(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("only web addresses can be opened".into());
    }
    if let Some(win) = app.get_webview_window("web") {
        win.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    let mut builder = tauri::WebviewWindowBuilder::new(&app, "web", tauri::WebviewUrl::External(parsed.clone()))
        // Must match the main window's browser arguments exactly: WebView2
        // refuses a second webview on the same data folder with different ones.
        .additional_browser_args(BROWSER_ARGS)
        .title("Stratbook web search: drag a picture into Stratbook, or right-click and Copy image")
        .inner_size(820.0, 880.0)
        .min_inner_size(420.0, 400.0)
        .theme(Some(tauri::Theme::Dark));
    // Open beside the main window when there is room.
    if let Some(main) = app.get_webview_window("main") {
        if let (Ok(pos), Ok(size), Ok(Some(mon))) = (main.outer_position(), main.outer_size(), main.current_monitor()) {
            let scale = mon.scale_factor();
            let right = (pos.x as f64 + size.width as f64) / scale;
            let screen_w = (mon.position().x as f64 + mon.size().width as f64) / scale;
            let x = if right + 420.0 <= screen_w { right - 10.0 } else { (screen_w - 830.0).max(0.0) };
            builder = builder.position(x, pos.y as f64 / scale);
        }
    }
    if builder.build().is_err() {
        // Fall back to the default browser; dragging from it works too.
        open_in_default_browser(parsed.as_str())?;
    }
    Ok(())
}

const BROWSER_ARGS: &str = "--disable-features=msWebOoUI,msPdfOOUI,msSmartScreenProtection";

fn open_in_default_browser(url: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Err("no browser available".into())
    }
}

/// Download an image from a web address (used when a link, not a file, is
/// dragged onto the app). Returns it as a data URL.
#[tauri::command]
async fn fetch_image(url: String) -> Result<String, String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("not a web address".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let resp = ureq::get(&url)
            .timeout(Duration::from_secs(20))
            .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Stratbook/1.2")
            .set("Accept", "image/*")
            .call()
            .map_err(|e| e.to_string())?;
        let ctype = resp
            .header("Content-Type")
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
        if !ctype.starts_with("image/") {
            return Err(format!("that link is not an image ({ctype})"));
        }
        let mut bytes = Vec::new();
        resp.into_reader()
            .take(15_000_000)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        Ok(format!("data:{ctype};base64,{}", encode_base64(&bytes)))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn encode_base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16
            | (*chunk.get(1).unwrap_or(&0) as u32) << 8
            | *chunk.get(2).unwrap_or(&0) as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

fn decode_base64(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut buf, mut bits) = (0u32, 0u32);
    for c in s.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' | b'\n' | b'\r' | b' ' => continue,
            _ => return Err("invalid image data".into()),
        } as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            save_blob,
            load_blob,
            delete_blob,
            data_path,
            export_text,
            export_data_url,
            fetch_image,
            open_web
        ])
        .run(tauri::generate_context!())
        .expect("error while running Stratbook");
}

#[cfg(test)]
mod tests {
    #[test]
    fn base64_round_trip() {
        assert_eq!(super::decode_base64("aGVsbG8gd29ybGQ=").unwrap(), b"hello world");
        assert_eq!(super::decode_base64("YQ==").unwrap(), b"a");
        for s in [&b""[..], b"a", b"ab", b"abc", b"hello world"] {
            assert_eq!(super::decode_base64(&super::encode_base64(s)).unwrap(), s);
        }
    }
}
