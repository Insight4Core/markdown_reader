use serde::Serialize;
use ignore::WalkBuilder;
use rayon::prelude::*;
use std::fs;

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

#[tauri::command]
async fn search_content(path: String, query: String) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let query_lower = query.to_lowercase();
    
    // 1. Collect all Markdown files quickly using `ignore`
    let walker = WalkBuilder::new(path)
        .hidden(true)
        .git_ignore(true)
        .build();

    let mut md_files = Vec::new();
    for result in walker {
        if let Ok(entry) = result {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "md" || ext == "markdown" || ext == "mdx" {
                        md_files.push(path.to_path_buf());
                    }
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, search_content])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
