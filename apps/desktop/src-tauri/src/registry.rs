use crate::error::{AppError, Result};

const REGISTRY_BASE: &str = "https://skills.sh/api";

/// Thin passthrough to the skills.sh public API. The frontend asks for a
/// path like "skills?q=react"; we return raw JSON. Kept deliberately dumb so
/// upstream API changes degrade gracefully instead of breaking the app.
pub async fn registry_get(path: &str) -> Result<serde_json::Value> {
    if path.contains("..") || path.starts_with('/') || path.contains("://") {
        return Err(AppError::Invalid("bad registry path".into()));
    }
    let url = format!("{REGISTRY_BASE}/{path}");
    let client = reqwest::Client::builder()
        .user_agent(format!("loadout/{}", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Network(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("registry returned {}", resp.status())));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| AppError::Network(e.to_string()))
}
