//! The binding generator, run by Gradle (`generateCoreBindings`): `uniffi-bindgen generate
//! --library <built cdylib> --language kotlin --out-dir <dir>`. Built only with `--features
//! bindgen`, so it never ships.

fn main() {
    uniffi::uniffi_bindgen_main();
}
