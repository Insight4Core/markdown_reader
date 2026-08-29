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

fn best_snippet(content: &str, matched_terms: &[String]) -> String {
    let mut best = (0usize, String::new());
    for line in content.lines() {
        let cleaned = line
            .trim()
            .trim_start_matches(|character: char| {
                matches!(character, '#' | '>' | '-' | '*' | '+' | '`')
            })
            .trim();
        if cleaned.chars().count() < 12 || cleaned.starts_with("![") {
            continue;
        }
        let lowered = cleaned.to_lowercase();
        let hits = matched_terms
            .iter()
            .filter(|term| lowered.contains(term.as_str()))
            .count();
        if hits > best.0 {
            best = (hits, cleaned.to_string());
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
    let mut snippet: String = source.chars().take(180).collect();
    if source.chars().count() > 180 {
        snippet.push('…');
    }
    snippet
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
    root_path: String,
    current_file: String,
    limit: usize,
) -> Result<Vec<KnowledgeEcho>, String> {
    let root = PathBuf::from(&root_path);
    let current = PathBuf::from(&current_file);
    if !root.is_dir() || !current.is_file() {
        return Ok(Vec::new());
    }

    let files = markdown_files(&root);
    if files.len() < 2 {
        return Ok(Vec::new());
    }

    let documents: Vec<AnalysedDocument> = files
        .par_iter()
        .filter_map(|path| analyse_markdown_file(path))
        .collect();

    Ok(rank_knowledge_echoes(&documents, &current, limit))
}

#[tauri::command]
async fn search_content(path: String, query: String) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let query_lower = query.to_lowercase();

    // 1. Collect all Markdown files quickly using `ignore`
    let walker = WalkBuilder::new(path).hidden(true).git_ignore(true).build();

    let mut md_files = Vec::new();
    for entry in walker.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "md" || ext == "markdown" || ext == "mdx" {
                    md_files.push(path.to_path_buf());
                }
            }
        }
    }

    // 2. Process files in parallel with rayon
    let mut results: Vec<SearchResult> = md_files
        .par_iter()
        .filter_map(|file_path| {
            let content = fs::read_to_string(file_path).ok()?;
            let mut file_results = Vec::new();

            for (i, line) in content.lines().enumerate() {
                if line.to_lowercase().contains(&query_lower) {
                    let file_name = file_path.file_name()?.to_string_lossy().to_string();

                    // Simple snippet extraction
                    let trimmed = line.trim();
                    let snippet = if trimmed.chars().count() > 80 {
                        let mut s = trimmed.chars().take(80).collect::<String>();
                        s.push_str("...");
                        s
                    } else {
                        trimmed.to_string()
                    };

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
            Some(file_results)
        })
        .flatten()
        .collect();

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
            find_knowledge_echoes
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
