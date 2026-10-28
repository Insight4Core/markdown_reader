use ignore::WalkBuilder;
use rayon::prelude::*;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize)]
pub struct SearchResult {
    file_path: String,
    file_name: String,
    line_number: usize,
    snippet: String,
}

#[derive(Serialize)]
pub struct KnowledgeEcho {
    file_path: String,
    file_name: String,
    snippet: String,
    matched_terms: Vec<String>,
    score: f64,
}

#[derive(Serialize)]
pub struct RecentChange {
    file_path: String,
    file_name: String,
    /// Last modification time in milliseconds since the Unix epoch.
    modified_at: u64,
}

#[derive(Clone)]
struct AnalysedDocument {
    path: PathBuf,
    name: String,
    content: String,
    terms: HashMap<String, f64>,
}

#[derive(Clone)]
struct CachedDocument {
    modified: Option<SystemTime>,
    size: u64,
    document: AnalysedDocument,
}

static KNOWLEDGE_CACHE: OnceLock<Mutex<HashMap<PathBuf, CachedDocument>>> = OnceLock::new();

fn is_cjk(character: char) -> bool {
    matches!(character,
        '\u{3400}'..='\u{4dbf}' |
        '\u{4e00}'..='\u{9fff}' |
        '\u{f900}'..='\u{faff}'
    )
}

fn is_stop_word(word: &str) -> bool {
    matches!(
        word,
        "the"
            | "and"
            | "for"
            | "that"
            | "with"
            | "this"
            | "from"
            | "are"
            | "was"
            | "were"
            | "have"
            | "has"
            | "had"
            | "not"
            | "but"
            | "you"
            | "your"
            | "into"
            | "about"
            | "can"
            | "will"
            | "would"
            | "when"
            | "what"
            | "how"
            | "why"
            | "where"
            | "which"
            | "their"
            | "there"
            | "then"
            | "than"
            | "also"
            | "just"
            | "more"
            | "some"
            | "use"
            | "using"
            | "used"
            | "our"
            | "out"
            | "all"
            | "any"
            | "its"
            | "they"
            | "them"
            | "一个"
            | "我们"
            | "你们"
            | "他们"
            | "可以"
            | "这个"
            | "那个"
            | "什么"
            | "如何"
            | "因为"
            | "所以"
            | "但是"
            | "如果"
            | "以及"
            | "或者"
            | "已经"
            | "没有"
            | "不是"
    )
}

fn tokenize(text: &str) -> Vec<String> {
    let mut terms = Vec::new();
    let mut word = String::new();
    let mut cjk_run = Vec::new();

    let flush_word = |word: &mut String, terms: &mut Vec<String>| {
        if word.chars().count() >= 3 {
            let normalized = word.to_lowercase();
            if !is_stop_word(&normalized) {
                terms.push(normalized);
            }
        }
        word.clear();
    };
    let flush_cjk = |run: &mut Vec<char>, terms: &mut Vec<String>| {
        for pair in run.windows(2) {
            let term: String = pair.iter().collect();
            if !is_stop_word(&term) {
                terms.push(term);
            }
        }
        run.clear();
    };

    for character in text.chars().take(80_000) {
        if is_cjk(character) {
            flush_word(&mut word, &mut terms);
            cjk_run.push(character);
        } else if character.is_alphanumeric() {
            flush_cjk(&mut cjk_run, &mut terms);
            word.push(character);
        } else {
            flush_word(&mut word, &mut terms);
            flush_cjk(&mut cjk_run, &mut terms);
        }
    }
    flush_word(&mut word, &mut terms);
    flush_cjk(&mut cjk_run, &mut terms);
    terms
}

fn document_terms(content: &str, file_name: &str) -> HashMap<String, f64> {
    let mut terms = HashMap::new();
    for term in tokenize(content) {
        *terms.entry(term).or_insert(0.0) += 1.0;
    }
    for term in tokenize(
        file_name
            .trim_end_matches(".markdown")
            .trim_end_matches(".mdx")
            .trim_end_matches(".md"),
    ) {
        *terms.entry(term).or_insert(0.0) += 6.0;
    }
    for heading in content
        .lines()
        .filter(|line| line.trim_start().starts_with('#'))
        .take(30)
    {
        for term in tokenize(heading.trim_start_matches('#')) {
            *terms.entry(term).or_insert(0.0) += 2.5;
        }
    }
    terms
}

fn markdown_files(root: &Path) -> Vec<PathBuf> {
    WalkBuilder::new(root)
        .hidden(true)
        .git_ignore(true)
        .build()
        .filter_map(Result::ok)
        .map(|entry| entry.into_path())
        .filter(|path| {
            path.is_file()
                && matches!(
                    path.extension().and_then(|ext| ext.to_str()),
                    Some("md" | "markdown" | "mdx")
                )
        })
        .collect()
}

fn markdown_files_for_roots(roots: &[String]) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    roots
        .iter()
        .map(PathBuf::from)
        .flat_map(|root| {
            if root.is_dir() {
                markdown_files(&root)
            } else if root.is_file()
                && matches!(
                    root.extension().and_then(|ext| ext.to_str()),
                    Some("md" | "markdown" | "mdx")
                )
            {
                vec![root]
            } else {
                Vec::new()
            }
        })
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

fn analyse_markdown_file(path: &Path) -> Option<AnalysedDocument> {
    let metadata = fs::metadata(path).ok()?;
    let modified = metadata.modified().ok();
    let size = metadata.len();
    let cache = KNOWLEDGE_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(cache) = cache.lock() {
        if let Some(cached) = cache.get(path) {
            if cached.modified == modified && cached.size == size {
                return Some(cached.document.clone());
            }
        }
    }

    let mut content = fs::read_to_string(path).ok()?;
    if let Some((byte_index, _)) = content.char_indices().nth(100_000) {
        content.truncate(byte_index);
    }
    let name = path.file_name()?.to_string_lossy().to_string();
    let document = AnalysedDocument {
        path: path.to_path_buf(),
        terms: document_terms(&content, &name),
        name,
        content,
    };
    if let Ok(mut cache) = cache.lock() {
        cache.insert(
            path.to_path_buf(),
            CachedDocument {
                modified,
                size,
                document: document.clone(),
            },
        );
    }
    Some(document)
}

fn plain_text_line(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut text = String::new();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] == '<'
            && chars
                .get(index + 1)
                .is_some_and(|c| c.is_ascii_alphabetic() || matches!(c, '/' | '!'))
        {
            if let Some(end) = chars[index..].iter().position(|c| *c == '>') {
                index += end + 1;
                continue;
            }
        }
        if chars[index] == '[' {
            if let Some(label_end) = chars[index + 1..].iter().position(|c| *c == ']') {
                let close = index + 1 + label_end;
                if chars.get(close + 1) == Some(&'(') {
                    let mut depth = 1;
                    let mut end = close + 2;
                    while end < chars.len() && depth > 0 {
                        if chars[end] == '(' {
                            depth += 1;
                        }
                        if chars[end] == ')' {
                            depth -= 1;
                        }
                        end += 1;
                    }
                    if depth == 0 {
                        text.extend(&chars[index + 1..close]);
                        index = end;
                        continue;
                    }
                }
            }
        }
        if chars[index] != '`' {
            text.push(chars[index]);
        }
        index += 1;
    }
    text.replace("**", "")
        .replace("__", "")
        .replace("~~", "")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .trim()
        .trim_start_matches(|c: char| matches!(c, '#' | '>' | '*' | '+'))
        .trim()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn contextual_excerpt(text: &str, query: &str, limit: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= limit {
        return text.to_string();
    }
    let lowered = text.to_lowercase();
    let offset = lowered
        .find(&query.to_lowercase())
        .map(|byte| {
            let lowered_index = lowered[..byte].chars().count();
            chars
                .iter()
                .enumerate()
                .flat_map(|(index, c)| c.to_lowercase().map(move |_| index))
                .nth(lowered_index)
                .unwrap_or(0)
        })
        .unwrap_or(0);
    let start = offset
        .saturating_sub(limit / 3)
        .min(chars.len().saturating_sub(limit));
    let end = (start + limit).min(chars.len());
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        chars[start..end].iter().collect::<String>(),
        if end < chars.len() { "…" } else { "" }
    )
}

fn best_snippet(content: &str, matched_terms: &[String]) -> String {
    let mut best = (0usize, String::new());
    let mut fenced = false;
    for line in content.lines() {
        let raw = line.trim();
        if raw.starts_with("```") || raw.starts_with("~~~") {
            fenced = !fenced;
            continue;
        }
        if fenced
            || raw.starts_with('#')
            || raw.starts_with("![")
            || raw.starts_with('|')
            || raw.contains(['│', '├', '└', '─'])
        {
            continue;
        }
        let cleaned = plain_text_line(raw);
        if cleaned.chars().count() < 24 {
            continue;
        }
        let lowered = cleaned.to_lowercase();
        let hits = matched_terms
            .iter()
            .filter(|term| lowered.contains(term.as_str()))
            .count();
        let score = hits * 4 + 1;
        if score > best.0 {
            best = (score, cleaned);
        }
    }
    let source = if best.1.is_empty() {
        content
            .lines()
            .find(|line| line.trim().chars().count() >= 12)
            .unwrap_or("")
            .trim()
            .to_string()
    } else {
        best.1
    };
    let plain = plain_text_line(&source);
    let term = matched_terms
        .iter()
        .find(|term| plain.to_lowercase().contains(term.as_str()))
        .map(String::as_str)
        .unwrap_or("");
    contextual_excerpt(&plain, term, 180)
}

fn rank_knowledge_echoes(
    documents: &[AnalysedDocument],
    current: &Path,
    limit: usize,
) -> Vec<KnowledgeEcho> {
    let current_document = match documents.iter().find(|document| document.path == current) {
        Some(document) => document,
        None => return Vec::new(),
    };

    let mut document_frequency: HashMap<&str, usize> = HashMap::new();
    for document in documents {
        let unique: HashSet<&str> = document.terms.keys().map(String::as_str).collect();
        for term in unique {
            *document_frequency.entry(term).or_insert(0) += 1;
        }
    }
    let document_count = documents.len() as f64;
    let idf = |term: &str| {
        ((document_count + 1.0) / (*document_frequency.get(term).unwrap_or(&0) as f64 + 1.0)).ln()
            + 1.0
    };
    let weighted = |frequency: f64, term: &str| (1.0 + frequency.ln()) * idf(term);
    let current_norm = current_document
        .terms
        .iter()
        .map(|(term, frequency)| weighted(*frequency, term).powi(2))
        .sum::<f64>()
        .sqrt();

    let mut echoes: Vec<KnowledgeEcho> = documents
        .iter()
        .filter(|document| document.path != current)
        .filter_map(|document| {
            let candidate_norm = document
                .terms
                .iter()
                .map(|(term, frequency)| weighted(*frequency, term).powi(2))
                .sum::<f64>()
                .sqrt();
            if current_norm == 0.0 || candidate_norm == 0.0 {
                return None;
            }

            let mut contributions: Vec<(&String, f64)> = current_document
                .terms
                .iter()
                .filter_map(|(term, current_frequency)| {
                    let candidate_frequency = document.terms.get(term)?;
                    Some((
                        term,
                        weighted(*current_frequency, term) * weighted(*candidate_frequency, term),
                    ))
                })
                .collect();
            contributions.sort_by(|a, b| b.1.total_cmp(&a.1));
            let score = contributions
                .iter()
                .map(|(_, contribution)| contribution)
                .sum::<f64>()
                / (current_norm * candidate_norm);
            if score < 0.025 || contributions.is_empty() {
                return None;
            }
            let matched_terms: Vec<String> = contributions
                .into_iter()
                .take(4)
                .map(|(term, _)| term.clone())
                .collect();
            Some(KnowledgeEcho {
                file_path: document.path.to_string_lossy().to_string(),
                file_name: document.name.clone(),
                snippet: best_snippet(&document.content, &matched_terms),
                matched_terms,
                score,
            })
        })
        .collect();

    echoes.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.file_name.cmp(&b.file_name))
    });
    echoes.truncate(limit.clamp(1, 8));
    echoes
}

#[tauri::command]
async fn find_knowledge_echoes(
    root_paths: Vec<String>,
    current_file: String,
    limit: usize,
) -> Result<Vec<KnowledgeEcho>, String> {
    let current = PathBuf::from(&current_file);
    if root_paths.is_empty() || !current.is_file() {
        return Ok(Vec::new());
    }

    let files = markdown_files_for_roots(&root_paths);
    if files.len() < 2 {
        return Ok(Vec::new());
    }

    let documents: Vec<AnalysedDocument> = files
        .par_iter()
        .filter_map(|path| analyse_markdown_file(path))
        .collect();

    Ok(rank_knowledge_echoes(&documents, &current, limit))
}

fn unix_millis(time: SystemTime) -> Option<u64> {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

/// Newest first; files changed before `since_ms` are left out.
fn recent_changes_for_files(files: &[PathBuf], since_ms: u64, limit: usize) -> Vec<RecentChange> {
    let mut changes: Vec<RecentChange> = files
        .par_iter()
        .filter_map(|path| {
            let modified_at = unix_millis(fs::metadata(path).ok()?.modified().ok()?)?;
            if modified_at < since_ms {
                return None;
            }
            Some(RecentChange {
                file_path: path.to_string_lossy().to_string(),
                file_name: path.file_name()?.to_string_lossy().to_string(),
                modified_at,
            })
        })
        .collect();
    changes.sort_by(|a, b| {
        b.modified_at
            .cmp(&a.modified_at)
            .then_with(|| a.file_path.cmp(&b.file_path))
    });
    changes.truncate(limit.clamp(1, 50));
    changes
}

#[tauri::command]
async fn recent_markdown_changes(
    root_paths: Vec<String>,
    since_ms: u64,
    limit: usize,
) -> Result<Vec<RecentChange>, String> {
    // Walking the folders is blocking I/O; keep it off the async runtime.
    tauri::async_runtime::spawn_blocking(move || {
        let files = markdown_files_for_roots(&root_paths);
        recent_changes_for_files(&files, since_ms, limit)
    })
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
async fn search_content(
    root_paths: Vec<String>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let query_lower = query.to_lowercase();

    // 1. Collect files from every linked knowledge source, without copying them.
    let md_files = markdown_files_for_roots(&root_paths);

    // 2. Process files in parallel with rayon
    let mut results: Vec<SearchResult> = md_files
        .par_iter()
        .filter_map(|file_path| {
            let content = fs::read_to_string(file_path).ok()?;
            let mut file_results = Vec::new();

            for (i, line) in content.lines().enumerate() {
                let plain = plain_text_line(line);
                // The group already names the document; prefer its actual content over a duplicate H1.
                if i == 0
                    && line.trim_start().starts_with("# ")
                    && file_path.file_stem()?.to_string_lossy().to_lowercase()
                        == plain.to_lowercase()
                {
                    continue;
                }
                if plain.to_lowercase().contains(&query_lower) {
                    let file_name = file_path.file_name()?.to_string_lossy().to_string();

                    let snippet = contextual_excerpt(&plain, &query, 160);

                    file_results.push(SearchResult {
                        file_path: file_path.to_string_lossy().to_string(),
                        file_name,
                        line_number: i + 1,
                        snippet,
                    });

                    // Max 3 hits per file to avoid noise
                    if file_results.len() >= 3 {
                        break;
                    }
                }
            }
            if file_results.is_empty()
                && file_path
                    .file_name()?
                    .to_string_lossy()
                    .to_lowercase()
                    .contains(&query_lower)
            {
                file_results.push(SearchResult {
                    file_path: file_path.to_string_lossy().to_string(),
                    file_name: file_path.file_name()?.to_string_lossy().to_string(),
                    line_number: 1,
                    snippet: best_snippet(&content, std::slice::from_ref(&query_lower)),
                });
            }
            Some(file_results)
        })
        .flatten()
        .collect();

    // Stable order keeps grouped results and keyboard selection predictable.
    results.sort_by(|a, b| {
        b.file_name
            .to_lowercase()
            .contains(&query_lower)
            .cmp(&a.file_name.to_lowercase().contains(&query_lower))
            .then_with(|| a.file_path.cmp(&b.file_path))
            .then_with(|| a.line_number.cmp(&b.line_number))
    });
    // Limit total results
    results.truncate(100);

    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let possible_path = &args[1];
                if !possible_path.starts_with("--") {
                    use tauri::Emitter;
                    let path_clone = possible_path.clone();
                    let app_handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                        let _ = app_handle.emit("sys-open-file", path_clone);
                    });
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            search_content,
            find_knowledge_echoes,
            recent_markdown_changes
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // `RunEvent::Opened` is only exposed by Tauri on macOS. Other
            // desktop platforms receive file paths through launch arguments,
            // which are handled in `setup` above.
            #[cfg(target_os = "macos")]
            {
                use tauri::Emitter;

                if let tauri::RunEvent::Opened { urls } = event {
                    if let Some(url) = urls.first() {
                        let path = url.path().to_string();
                        let app_h = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
                            let _ = app_h.emit("sys-open-file", path);
                        });
                    }
                }
            }

            #[cfg(not(target_os = "macos"))]
            let _ = (app_handle, event);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excerpts_remove_markup_without_rendering_html() {
        assert_eq!(plain_text_line("# <strong>Memory</strong> and [knowledge](https://example.com/a(b)) **return** with `context`"), "Memory and knowledge return with context");
        assert_eq!(
            plain_text_line("中文 <em>知识</em> &amp; memory_value"),
            "中文 知识 & memory_value"
        );
    }

    #[test]
    fn excerpts_keep_late_unicode_matches_in_view() {
        let line = format!(
            "{}知识回响{}",
            "很长的前言".repeat(50),
            "后面的解释".repeat(50)
        );
        let excerpt = contextual_excerpt(&line, "知识回响", 160);
        assert!(excerpt.contains("知识回响"));
        assert!(excerpt.starts_with('…'));
        assert!(excerpt.ends_with('…'));
        assert!(excerpt.chars().count() <= 162);
        assert!(
            contextual_excerpt(&format!("{}İDEA context", "前言".repeat(80)), "İDEA", 80)
                .contains("İDEA")
        );
    }

    #[test]
    fn echoes_prefer_readable_prose_over_code_and_directory_trees() {
        let content = "# Memory\n```python\nmemory = memory_store(memory)\n```\n│ ├── memory.py memory memory\nA saved memory becomes useful when it returns alongside a related question.";
        let excerpt = best_snippet(content, &["memory".to_string()]);
        assert!(excerpt.starts_with("A saved memory"));
        assert!(!excerpt.contains("memory.py"));
    }

    #[test]
    fn recent_changes_are_newest_first_and_skip_old_files() {
        let root = std::env::temp_dir().join(format!(
            "pyrus-recent-changes-{}-{}",
            std::process::id(),
            unix_millis(SystemTime::now()).unwrap()
        ));
        fs::create_dir_all(root.join("nested")).unwrap();
        let base = SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_800_000_000);
        let write = |name: &str, seconds: u64| {
            let path = root.join(name);
            fs::write(&path, "# note").unwrap();
            fs::File::options()
                .write(true)
                .open(&path)
                .unwrap()
                .set_modified(base + std::time::Duration::from_secs(seconds))
                .unwrap();
        };
        write("old.md", 0);
        write("middle.md", 100);
        write("nested/newest.md", 200);
        write("ignored.txt", 300);

        let since = unix_millis(base + std::time::Duration::from_secs(50)).unwrap();
        let files = markdown_files_for_roots(&[root.to_string_lossy().to_string()]);
        let changes = recent_changes_for_files(&files, since, 8);
        let names: Vec<&str> = changes.iter().map(|change| change.file_name.as_str()).collect();
        assert_eq!(names, vec!["newest.md", "middle.md"]);
        assert_eq!(recent_changes_for_files(&files, since, 1).len(), 1);

        fs::remove_dir_all(root).unwrap();
    }

    fn analysed(path: &str, content: &str) -> AnalysedDocument {
        let path = PathBuf::from(path);
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        AnalysedDocument {
            terms: document_terms(content, &name),
            content: content.to_string(),
            path,
            name,
        }
    }

    #[test]
    fn tokenizes_english_and_chinese_ideas() {
        let terms = tokenize("A forgotten article returns. 被遗忘的知识重新出现。");
        assert!(terms.contains(&"forgotten".to_string()));
        assert!(terms.contains(&"article".to_string()));
        assert!(terms.contains(&"遗忘".to_string()));
        assert!(terms.contains(&"知识".to_string()));
    }

    #[test]
    fn ranks_related_note_before_unrelated_note() {
        let current = analysed(
            "/demo/current.md",
            "# Forgotten knowledge\nSaving an article is a promise to a future self. The product should return a saved idea when it becomes useful."
        );
        let related = analysed(
            "/demo/related.md",
            "# Why saved articles disappear\nA forgotten saved article becomes useful when it returns beside a related question for your future self."
        );
        let unrelated = analysed(
            "/demo/unrelated.md",
            "# Hiking checklist\nBring water, a rain jacket, trail snacks, a compass, and an offline map for the mountain."
        );
        let documents = vec![current, unrelated, related];

        let echoes = rank_knowledge_echoes(&documents, Path::new("/demo/current.md"), 5);

        assert_eq!(echoes.len(), 1);
        assert_eq!(echoes[0].file_name, "related.md");
        assert!(echoes[0].snippet.contains("forgotten saved article"));
        assert!(echoes[0]
            .matched_terms
            .iter()
            .any(|term| term == "saved" || term == "article"));
    }

    #[test]
    fn limits_echoes_and_excludes_current_document() {
        let documents = vec![
            analysed(
                "/demo/current.md",
                "# Product idea\nA saved product idea can return at the useful moment.",
            ),
            analysed(
                "/demo/one.md",
                "# Saved idea\nA useful product idea returns at the right moment.",
            ),
            analysed(
                "/demo/two.md",
                "# Product moment\nReturn a saved product idea when it is useful.",
            ),
        ];

        let echoes = rank_knowledge_echoes(&documents, Path::new("/demo/current.md"), 1);

        assert_eq!(echoes.len(), 1);
        assert_ne!(echoes[0].file_name, "current.md");
    }
}
