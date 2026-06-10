use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistrySkill {
    pub source: String,
    #[serde(rename = "skillId", default)]
    pub skill_id: String,
    pub name: String,
    #[serde(default)]
    pub installs: u64,
    #[serde(rename = "isOfficial", default)]
    pub is_official: bool,
}

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(format!("loadout/{}", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| AppError::Network(e.to_string()))
}

/// skills.sh search — the one documented-ish JSON endpoint.
pub async fn search(q: &str) -> Result<Vec<RegistrySkill>> {
    #[derive(Deserialize)]
    struct SearchResponse {
        #[serde(default)]
        skills: Vec<RegistrySkill>,
    }
    let url = reqwest::Url::parse_with_params("https://www.skills.sh/api/search", [("q", q)])
        .map_err(|e| AppError::Network(e.to_string()))?;
    let resp = client()?.get(url).send().await.map_err(|e| AppError::Network(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AppError::Network(format!("registry returned {}", resp.status())));
    }
    Ok(resp
        .json::<SearchResponse>()
        .await
        .map_err(|e| AppError::Network(e.to_string()))?
        .skills)
}

/// Leaderboards have no public API; the site embeds them in each page's RSC
/// payload as `"initialSkills":[...]`. Extract and parse defensively — if the
/// site layout changes this degrades to an error the UI handles gracefully.
pub async fn leaderboard(view: &str) -> Result<Vec<RegistrySkill>> {
    let path = match view {
        "trending" => "/trending",
        "hot" => "/hot",
        _ => "/",
    };
    let html = client()?
        .get(format!("https://www.skills.sh{path}"))
        .send()
        .await
        .map_err(|e| AppError::Network(e.to_string()))?
        .text()
        .await
        .map_err(|e| AppError::Network(e.to_string()))?;
    parse_embedded_skills(&html).ok_or_else(|| {
        AppError::Network("couldn't read the leaderboard — skills.sh may have changed".into())
    })
}

fn parse_embedded_skills(html: &str) -> Option<Vec<RegistrySkill>> {
    let start = html.find(r#"initialSkills\":"#)?;
    let region = &html[start..];
    // the JSON lives escaped inside a JS string literal: \" → "
    let unescaped = region.replace("\\\"", "\"").replace("\\\\", "\\");
    let array_start = unescaped.find('[')?;
    let json = extract_balanced_array(&unescaped[array_start..])?;
    serde_json::from_str::<Vec<RegistrySkill>>(json).ok()
}

/// Slice out one balanced JSON array, respecting strings and escapes.
fn extract_balanced_array(s: &str) -> Option<&str> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (i, c) in s.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        match c {
            '\\' if in_string => escaped = true,
            '"' => in_string = !in_string,
            '[' if !in_string => depth += 1,
            ']' if !in_string => {
                depth -= 1;
                if depth == 0 {
                    return Some(&s[..=i]);
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_embedded_leaderboard() {
        let html = r#"<script>self.__next_f.push([1,"45:[\"$\",\"$L4d\",null,{\"initialSkills\":[{\"source\":\"qu-skills/skills\",\"skillId\":\"remotion-render\",\"name\":\"remotion-render\",\"installs\":21885},{\"source\":\"vercel-labs/skills\",\"skillId\":\"find-skills\",\"name\":\"find-skills\",\"installs\":19433,\"isOfficial\":true}],\"totalSkills\":9603,\"view\":\"trending\"}]\n"])</script>"#;
        let skills = parse_embedded_skills(html).unwrap();
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "remotion-render");
        assert_eq!(skills[0].installs, 21885);
        assert!(skills[1].is_official);
    }
}
