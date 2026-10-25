//! The small public facade used by the desktop's Tauri commands and by the UniFFI bindings.
//! Wires `app`, `sync`, `tracking` and `adapters` together and takes and returns plain data only.

/// The core's version (`major.minor.patch`), taken from its Cargo manifest at build time.
#[must_use]
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::version;

    #[test]
    fn version_is_a_major_minor_patch_triple() {
        let version = version();
        let is_number = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit());

        let parts: Vec<&str> = version.split('.').collect();

        assert!(
            parts.len() == 3 && parts.into_iter().all(is_number),
            "{version:?} is not major.minor.patch"
        );
    }
}
