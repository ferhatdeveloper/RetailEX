//! PostgreSQL migrasyon dosyalarini ifade ifade calistirmak icin basit ayristirici.
//! Noktali virgul: tek tirnak, cift tirnak, --, /* */, $$ ve $etiket$ dolar bloklari icinde sayilmaz.

#[derive(Debug, Clone, PartialEq, Eq)]
enum ParseState {
    Normal,
    LineComment,
    BlockComment { depth: u32 },
    SingleQuote,
    DoubleQuote,
    Dollar { tag: String, close_idx: usize },
}

/// UTF-8 BOM kaldirmak icin (varsa).
pub fn strip_utf8_bom(s: &str) -> &str {
    s.strip_prefix('\u{feff}').unwrap_or(s)
}

pub fn split_postgres_statements(input: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut buf = String::new();
    let mut chars = input.chars().peekable();
    let mut state = ParseState::Normal;

    while let Some(c) = chars.next() {
        match &mut state {
            ParseState::Normal => match c {
                '-' if chars.peek() == Some(&'-') => {
                    chars.next();
                    state = ParseState::LineComment;
                }
                '/' if chars.peek() == Some(&'*') => {
                    chars.next();
                    state = ParseState::BlockComment { depth: 1 };
                }
                '\'' => {
                    buf.push('\'');
                    state = ParseState::SingleQuote;
                }
                '"' => {
                    buf.push('"');
                    state = ParseState::DoubleQuote;
                }
                '$' => {
                    let tag = parse_dollar_tag(&mut chars);
                    buf.push('$');
                    buf.push_str(&tag);
                    buf.push('$');
                    state = ParseState::Dollar {
                        tag: tag.clone(),
                        close_idx: 0,
                    };
                }
                ';' => {
                    let t = buf.trim();
                    if !t.is_empty() {
                        out.push(t.to_string());
                    }
                    buf.clear();
                }
                _ => buf.push(c),
            },
            ParseState::LineComment => {
                if c == '\n' {
                    buf.push('\n');
                    state = ParseState::Normal;
                }
            }
            ParseState::BlockComment { depth } => {
                if c == '/' && chars.peek() == Some(&'*') {
                    chars.next();
                    *depth += 1;
                } else if c == '*' && chars.peek() == Some(&'/') {
                    chars.next();
                    *depth = depth.saturating_sub(1);
                    if *depth == 0 {
                        state = ParseState::Normal;
                    }
                }
            }
            ParseState::SingleQuote => {
                buf.push(c);
                if c == '\'' {
                    if chars.peek() == Some(&'\'') {
                        buf.push(chars.next().unwrap());
                    } else {
                        state = ParseState::Normal;
                    }
                }
            }
            ParseState::DoubleQuote => {
                buf.push(c);
                if c == '"' {
                    if chars.peek() == Some(&'"') {
                        buf.push(chars.next().unwrap());
                    } else {
                        state = ParseState::Normal;
                    }
                }
            }
            ParseState::Dollar { tag, close_idx } => {
                buf.push(c);
                let closing: Vec<char> = std::iter::once('$')
                    .chain(tag.chars())
                    .chain(std::iter::once('$'))
                    .collect();
                if closing.is_empty() {
                    state = ParseState::Normal;
                    continue;
                }
                if c == closing[*close_idx] {
                    *close_idx += 1;
                    if *close_idx == closing.len() {
                        state = ParseState::Normal;
                    }
                } else {
                    *close_idx = if c == closing[0] { 1 } else { 0 };
                }
            }
        }
    }

    let tail = buf.trim();
    if !tail.is_empty() {
        out.push(tail.to_string());
    }
    out
}

/// Ilk `$` haric — cagirandan once `$` tuketilmis; `tag` ve kapanan `$` okunur.
fn parse_dollar_tag(chars: &mut std::iter::Peekable<std::str::Chars>) -> String {
    if chars.peek() == Some(&'$') {
        chars.next();
        return String::new();
    }
    let mut tag = String::new();
    while let Some(&ch) = chars.peek() {
        if ch == '$' {
            chars.next();
            break;
        }
        if ch.is_ascii_alphanumeric() || ch == '_' {
            tag.push(chars.next().unwrap());
        } else {
            break;
        }
    }
    tag
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semicolon_in_single_quotes() {
        let s = "SELECT 'a;b'; SELECT 2;";
        let v = split_postgres_statements(s);
        assert_eq!(v.len(), 2);
        assert!(v[0].contains("'a;b'"));
    }

    #[test]
    fn dollar_quote() {
        let s = "SELECT $$x;y$$; SELECT 1;";
        let v = split_postgres_statements(s);
        assert_eq!(v.len(), 2);
    }

    #[test]
    fn line_comment_no_split() {
        let s = "SELECT 1; -- hi;\nSELECT 2;";
        let v = split_postgres_statements(s);
        assert_eq!(v.len(), 2);
    }
}
