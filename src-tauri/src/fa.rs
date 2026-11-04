//! Persian number formatting for text stored on invoices.

const DIGITS: [char; 10] = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/// `12` → `"۱۲"`
pub fn digits(value: i64) -> String {
    value.to_string().chars().map(|c| c.to_digit(10).map_or(c, |d| DIGITS[d as usize])).collect()
}

/// `1250000` → `"۱٬۲۵۰٬۰۰۰"` (Arabic thousands separator, as `Intl` fa-IR).
pub fn grouped(value: i64) -> String {
    let negative = value < 0;
    let raw = value.unsigned_abs().to_string();
    let mut out = String::new();
    for (i, c) in raw.chars().enumerate() {
        if i > 0 && (raw.len() - i).is_multiple_of(3) {
            out.push('٬');
        }
        out.push(DIGITS[c.to_digit(10).unwrap_or(0) as usize]);
    }
    if negative { format!("−{out}") } else { out }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_like_intl_fa_ir() {
        assert_eq!(digits(105), "۱۰۵");
        assert_eq!(grouped(1_250_000), "۱٬۲۵۰٬۰۰۰");
        assert_eq!(grouped(999), "۹۹۹");
        assert_eq!(grouped(0), "۰");
    }
}
