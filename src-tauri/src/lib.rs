//! Stratbook's native side. It only does file storage; everything else lives
//! in the web frontend. Data sits in the app data folder:
//!   stratbook.json        the whole book (strats, guides, maps, boards)
//!   stratbook.json.bak    the previous save
//!   blobs/<key>.txt       imported images (blueprints, custom operator icons)

use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
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
            export_data_url
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
    }
}
