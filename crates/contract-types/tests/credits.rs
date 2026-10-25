//! Credit amounts on the wire (ADR-0003): decimal strings with exactly 2 places. Rates are
//! non-negative credits per hour, whether earned or spent (R-42, R-43); the balance may be
//! negative (R-45). The rates come from the `credits.changed` example.
#![cfg(test)]

mod support;

use pulse_contract_types::types::{CreditBalanceSnapshot, CreditRates, CreditRatesEarn};
use serde_json::Value;

const RATE_FIELDS: [&str; 4] = ["earn", "gaming", "social", "otherLeisure"];

fn example_credits() -> Value {
    support::examples()["events"]["credits.changed"]["data"]["credits"].clone()
}

#[test]
fn the_example_rates_decode() {
    let rates = example_credits()["rates"].clone();

    assert!(serde_json::from_value::<CreditRates>(rates).is_ok());
}

#[test]
fn a_negative_rate_is_rejected_for_every_rate() {
    for field in RATE_FIELDS {
        let mut rates = example_credits()["rates"].clone();
        rates[field] = Value::from("-1.00");

        let decoded = serde_json::from_value::<CreditRates>(rates);

        assert!(decoded.is_err(), "a negative {field} rate was accepted");
    }
}

#[test]
fn a_rate_takes_exactly_two_decimals_and_no_sign() {
    assert!(CreditRatesEarn::try_from("0.00").is_ok());
    assert!(CreditRatesEarn::try_from("12.50").is_ok());
    assert!(CreditRatesEarn::try_from("-1.00").is_err());
    assert!(CreditRatesEarn::try_from("-0.00").is_err());
    assert!(CreditRatesEarn::try_from("+1.00").is_err());
    assert!(CreditRatesEarn::try_from("1.5").is_err());
}

#[test]
fn the_balance_may_be_negative() {
    let credits = example_credits();
    assert_eq!(credits["balance"], "-3.25");

    assert!(serde_json::from_value::<CreditBalanceSnapshot>(credits).is_ok());
}
