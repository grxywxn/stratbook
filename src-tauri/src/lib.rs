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
async fn open_web(app: AppHandle, url: String) -> Result<String, String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("only web addresses can be opened".into());
    }
    if let Some(win) = app.get_webview_window("web") {
        win.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        return Ok("window".into());
    }
    let mut builder = tauri::WebviewWindowBuilder::new(&app, "web", tauri::WebviewUrl::External(parsed.clone()))
        // Its own browser profile folder, so WebView2 never has to share (and
        // clash over) the main window's environment.
        .data_directory(web_profile_dir(&app)?)
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
    match builder.build() {
        Ok(_) => Ok("window".into()),
        Err(e) => {
            // Fall back to the default browser; dragging from it works too.
            open_in_default_browser(parsed.as_str()).map_err(|e2| format!("{e}; and the default browser failed too: {e2}"))?;
            Ok(format!("browser:{e}"))
        }
    }
}

fn web_profile_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("web-search-profile");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

const BROWSER_ARGS: &str = "--disable-features=msWebOoUI,msPdfOOUI,msSmartScreenProtection";

fn open_in_default_browser(url: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // rundll32 hands the address to the default browser without a console window.
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .creation_flags(0x0800_0000)
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

/* ---------------- Ubisoft account (unofficial stats service) ----------------
 * Signs in to Ubisoft the same way Ubisoft's own stats website does. The
 * password is sent only to Ubisoft and never stored; only the session and
 * Ubisoft's remember-me ticket are kept in ubisoft.json in the data folder.
 */

const UBI_SESSIONS: &str = "https://public-ubiservices.ubi.com/v3/profiles/sessions";
const UBI_FULL_PROFILES: &str = "https://public-ubiservices.ubi.com/v2/spaces/0d2ae42d-4c27-4cb7-af6c-2099062302bb/title/r6s/skill/full_profiles";
const UBI_APP_IDS: [&str; 2] = ["3587dcbb-7f81-457c-9781-0e3f29f6f56a", "39baebad-39e5-4552-8c25-2c9b919064e2"];
const UBI_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

fn ubi_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("ubisoft.json"))
}

fn ubi_read(app: &AppHandle) -> Option<serde_json::Value> {
    fs::read_to_string(ubi_file(app).ok()?).ok().and_then(|s| serde_json::from_str(&s).ok())
}

fn ubi_write(app: &AppHandle, v: &serde_json::Value) -> Result<(), String> {
    write_atomic(&ubi_file(app)?, v.to_string().as_bytes())
}

fn ubi_error(code: u16, body: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(body).unwrap_or(serde_json::Value::Null);
    let msg = v.get("message").and_then(|m| m.as_str()).unwrap_or("").to_string();
    let err = v.get("errorCode").and_then(|m| m.as_i64()).unwrap_or(0);
    match (code, err) {
        (401, _) | (_, 1) | (_, 3) | (_, 1003) => format!("Ubisoft rejected the sign-in: wrong email, password or code. ({code} {err} {msg})"),
        (429, _) | (_, 1100) => "Ubisoft says there were too many attempts. Wait a few minutes and try again.".into(),
        _ => format!("Ubisoft returned an error ({code}{}): {}", if err != 0 { format!(", code {err}") } else { String::new() }, if msg.is_empty() { body.chars().take(200).collect() } else { msg }),
    }
}

/// POST to the sessions endpoint with the given Authorization header.
fn ubi_session_call(auth: &str, app_id: &str, two_fa_code: Option<&str>) -> Result<serde_json::Value, String> {
    let mut req = ureq::post(UBI_SESSIONS)
        .timeout(Duration::from_secs(20))
        .set("Authorization", auth)
        .set("Ubi-AppId", app_id)
        .set("Content-Type", "application/json; charset=UTF-8")
        .set("User-Agent", UBI_UA);
    if let Some(code) = two_fa_code {
        req = req.set("Ubi-2faCode", code);
    }
    match req.send_string(r#"{"rememberMe":true}"#) {
        Ok(r) => {
            let body = r.into_string().map_err(|e| e.to_string())?;
            serde_json::from_str(&body).map_err(|e| format!("unexpected reply from Ubisoft: {e}"))
        }
        Err(ureq::Error::Status(code, r)) => Err(ubi_error(code, &r.into_string().unwrap_or_default())),
        Err(e) => Err(format!("could not reach Ubisoft: {e}")),
    }
}

/// Keep what we need from a sessions reply. Returns ("ok"|"2fa", value for JS).
fn ubi_accept(app: &AppHandle, reply: serde_json::Value, app_id: &str) -> Result<serde_json::Value, String> {
    if let Some(t) = reply.get("twoFactorAuthenticationTicket").and_then(|t| t.as_str()) {
        if reply.get("ticket").map(|v| v.is_null()).unwrap_or(true) {
            return Ok(serde_json::json!({ "status": "2fa", "twoFactorTicket": t, "appId": app_id }));
        }
    }
    let ticket = reply.get("ticket").and_then(|t| t.as_str()).ok_or("Ubisoft did not return a session")?;
    let prev = ubi_read(app).unwrap_or(serde_json::json!({}));
    let remember = reply.get("rememberMeTicket").and_then(|t| t.as_str())
        .or_else(|| prev.get("rememberMeTicket").and_then(|t| t.as_str()))
        .unwrap_or("");
    let session = serde_json::json!({
        "ticket": ticket,
        "sessionId": reply.get("sessionId").and_then(|t| t.as_str()).unwrap_or(""),
        "profileId": reply.get("profileId").and_then(|t| t.as_str()).unwrap_or(""),
        "userId": reply.get("userId").and_then(|t| t.as_str()).unwrap_or(""),
        "nameOnPlatform": reply.get("nameOnPlatform").and_then(|t| t.as_str()).unwrap_or(""),
        "expiration": reply.get("expiration").and_then(|t| t.as_str()).unwrap_or(""),
        "rememberMeTicket": remember,
        "appId": app_id
    });
    ubi_write(app, &session)?;
    Ok(serde_json::json!({ "status": "ok", "name": session["nameOnPlatform"], "profileId": session["profileId"] }))
}

#[tauri::command]
async fn ubi_login(app: AppHandle, email: String, password: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let basic = format!("Basic {}", encode_base64(format!("{email}:{password}").as_bytes()));
        let mut last = String::new();
        for id in UBI_APP_IDS {
            match ubi_session_call(&basic, id, None) {
                Ok(reply) => return ubi_accept(&app, reply, id),
                Err(e) => {
                    // Wrong credentials won't get better with another app id.
                    if e.contains("wrong email") || e.contains("too many") { return Err(e); }
                    last = e;
                }
            }
        }
        Err(last)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ubi_login_2fa(app: AppHandle, ticket: String, code: String, app_id: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let reply = ubi_session_call(&format!("ubi_2fa_v1 t={ticket}"), &app_id, Some(code.trim()))?;
        ubi_accept(&app, reply, &app_id)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn ubi_status(app: AppHandle) -> serde_json::Value {
    match ubi_read(&app) {
        Some(s) if s.get("ticket").and_then(|t| t.as_str()).map(|t| !t.is_empty()).unwrap_or(false) =>
            serde_json::json!({ "connected": true, "name": s["nameOnPlatform"], "profileId": s["profileId"] }),
        _ => serde_json::json!({ "connected": false }),
    }
}

#[tauri::command]
fn ubi_logout(app: AppHandle) -> Result<(), String> {
    match fs::remove_file(ubi_file(&app)?) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

fn ubi_get_profiles(s: &serde_json::Value) -> Result<String, (u16, String)> {
    let pid = s["profileId"].as_str().unwrap_or("");
    let url = format!("{UBI_FULL_PROFILES}?profile_ids={pid}&platform_families=pc");
    let req = ureq::get(&url)
        .timeout(Duration::from_secs(20))
        .set("Authorization", &format!("Ubi_v1 t={}", s["ticket"].as_str().unwrap_or("")))
        .set("Ubi-AppId", s["appId"].as_str().unwrap_or(UBI_APP_IDS[0]))
        .set("Ubi-SessionId", s["sessionId"].as_str().unwrap_or(""))
        .set("expiration", s["expiration"].as_str().unwrap_or(""))
        .set("Ubi-LocaleCode", "en-US")
        .set("User-Agent", UBI_UA);
    match req.call() {
        Ok(r) => r.into_string().map_err(|e| (0, e.to_string())),
        Err(ureq::Error::Status(code, r)) => Err((code, r.into_string().unwrap_or_default())),
        Err(e) => Err((0, format!("could not reach Ubisoft: {e}"))),
    }
}

/// Current-season stats for every playlist, as Ubisoft returns them.
#[tauri::command]
async fn ubi_fetch_stats(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = ubi_read(&app).ok_or("Not connected to Ubisoft")?;
        match ubi_get_profiles(&s) {
            Ok(body) => Ok(body),
            Err((401, _)) | Err((403, _)) => {
                // Session expired: renew it with the remember-me ticket, then retry once.
                let remember = s["rememberMeTicket"].as_str().unwrap_or("");
                if remember.is_empty() {
                    return Err("Your Ubisoft session expired. Connect again.".into());
                }
                let app_id = s["appId"].as_str().unwrap_or(UBI_APP_IDS[0]).to_string();
                let reply = ubi_session_call(&format!("rm_v1 t={remember}"), &app_id, None)
                    .map_err(|e| format!("Your Ubisoft session expired and could not be renewed. Connect again. ({e})"))?;
                ubi_accept(&app, reply, &app_id)?;
                let s2 = ubi_read(&app).ok_or("Not connected to Ubisoft")?;
                ubi_get_profiles(&s2).map_err(|(c, b)| ubi_error(c, &b))
            }
            Err((code, body)) => Err(ubi_error(code, &body)),
        }
    })
    .await
    .map_err(|e| e.to_string())?
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
            open_web,
            ubi_login,
            ubi_login_2fa,
            ubi_status,
            ubi_logout,
            ubi_fetch_stats
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
