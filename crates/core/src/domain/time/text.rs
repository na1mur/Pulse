//! Strict ASCII parsing shared by day keys and instants: fixed-width digit fields and the
//! `YYYY-MM-DD` calendar date, with nothing looser (no signs, spaces or non-ASCII digits).

use jiff::civil::Date;

/// A run of 1-4 ASCII digits as a number; anything else is `None`.
pub(super) fn ascii_number(bytes: &[u8]) -> Option<i16> {
    if bytes.is_empty() || bytes.len() > 4 || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    Some(
        bytes
            .iter()
            .fold(0, |number, digit| number * 10 + i16::from(digit - b'0')),
    )
}

/// Exactly `YYYY-MM-DD` naming a date that exists (so `2026-02-30` is `None`).
pub(super) fn calendar_date(bytes: &[u8]) -> Option<Date> {
    let [y1, y2, y3, y4, b'-', m1, m2, b'-', d1, d2] = *bytes else {
        return None;
    };
    let year = ascii_number(&[y1, y2, y3, y4])?;
    let month = i8::try_from(ascii_number(&[m1, m2])?).ok()?;
    let day = i8::try_from(ascii_number(&[d1, d2])?).ok()?;
    Date::new(year, month, day).ok()
}
