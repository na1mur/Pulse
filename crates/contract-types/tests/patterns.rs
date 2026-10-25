//! The generated types check the contract's `pattern`s with `regress`, compiling each one lazily
//! and unwrapping the result (`src/lib.rs` allows that lint for the generated module). This test
//! compiles every pattern in the generated source, so a pattern regress rejects fails here and
//! never at run time in the apps.
#![cfg(test)]

use std::path::Path;

/// The string literals passed to `::regress::Regex::new(` in the generated source, unescaped.
fn generated_patterns() -> Vec<String> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/generated/types.rs");
    let source = std::fs::read_to_string(path).unwrap();
    source
        .split("::regress::Regex::new(")
        .skip(1)
        .map(|rest| {
            let literal = rest
                .trim_start()
                .strip_prefix('"')
                .expect("a string literal");
            let mut pattern = String::new();
            let mut chars = literal.chars();
            while let Some(char) = chars.next() {
                match char {
                    '"' => break,
                    '\\' => pattern.push(chars.next().expect("an escaped character")),
                    other => pattern.push(other),
                }
            }
            pattern
        })
        .collect()
}

#[test]
fn every_generated_pattern_compiles() {
    let patterns = generated_patterns();

    assert!(
        !patterns.is_empty(),
        "no patterns found: did the generated code change shape?"
    );
    for pattern in patterns {
        assert!(
            regress::Regex::new(&pattern).is_ok(),
            "regress rejects {pattern:?}"
        );
    }
}
