//! Store logo: validated by path, served to the UI as a `data:` URL (the
//! production CSP already allows `img-src data:`, so no asset protocol scope
//! has to be opened up for arbitrary paths).

use std::path::Path;

use base64::Engine;

use crate::error::{AppResult, validation};

pub const MAX_LOGO_BYTES: u64 = 2 * 1024 * 1024;
pub const LOGO_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

fn mime(extension: &str) -> &'static str {
    match extension {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/svg+xml",
    }
}

fn extension(path: &Path) -> Option<String> {
    path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase())
}

/// `""` stays `""` (no logo). Otherwise: an absolute path to an existing image
/// file (png / jpg / webp / gif / svg) of at most 2 MB.
pub fn validate_logo_path(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return Err(validation("مسیر لوگو باید کامل (مطلق) باشد."));
    }
    match extension(path) {
        Some(ext) if LOGO_EXTENSIONS.contains(&ext.as_str()) => {}
        _ => return Err(validation("لوگو باید تصویر PNG، JPG، WebP، GIF یا SVG باشد.")),
    }
    let meta = std::fs::metadata(path).map_err(|_| validation("فایل لوگو پیدا نشد."))?;
    if !meta.is_file() {
        return Err(validation("فایل لوگو پیدا نشد."));
    }
    if meta.len() > MAX_LOGO_BYTES {
        return Err(validation("حجم لوگو حداکثر ۲ مگابایت است."));
    }
    Ok(trimmed.to_owned())
}

/// The logo as `data:<mime>;base64,…`.
pub fn read_logo_data_url(raw: &str) -> AppResult<String> {
    let path = validate_logo_path(raw)?;
    if path.is_empty() {
        return Err(validation("لوگویی تنظیم نشده است."));
    }
    let bytes = std::fs::read(&path)?;
    let ext = extension(Path::new(&path)).unwrap_or_default();
    Ok(format!("data:{};base64,{}", mime(&ext), base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_and_encodes() {
        let dir = std::env::temp_dir().join(format!("gameon-logo-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let png = dir.join("logo.PNG");
        std::fs::write(&png, [0x89, b'P', b'N', b'G']).unwrap();
        let path = png.to_string_lossy().into_owned();

        assert_eq!(validate_logo_path("  ").unwrap(), "");
        assert_eq!(validate_logo_path(&path).unwrap(), path);
        assert_eq!(read_logo_data_url(&path).unwrap(), "data:image/png;base64,iVBORw==");
        assert!(validate_logo_path("logo.png").is_err(), "relative");
        assert!(validate_logo_path(&dir.join("missing.png").to_string_lossy()).is_err());
        let txt = dir.join("notes.txt");
        std::fs::write(&txt, "x").unwrap();
        assert!(validate_logo_path(&txt.to_string_lossy()).is_err(), "not an image type");
        let big = dir.join("big.jpg");
        std::fs::write(&big, vec![0u8; (MAX_LOGO_BYTES + 1) as usize]).unwrap();
        assert!(validate_logo_path(&big.to_string_lossy()).is_err(), "too large");
        std::fs::remove_dir_all(dir).ok();
    }
}
