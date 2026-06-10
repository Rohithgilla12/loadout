//! End-to-end: create a real git repo with skills, fetch it the way installs
//! do, discover skills, copy into the store. Uses only local git — no network.

use std::fs;
use std::process::Command;

fn git(args: &[&str], cwd: &std::path::Path) {
    let out = Command::new("git").args(args).current_dir(cwd).output().unwrap();
    assert!(out.status.success(), "git {:?} failed: {}", args, String::from_utf8_lossy(&out.stderr));
}

#[test]
fn fetch_discover_roundtrip() {
    // build a source repo with two skills in the CLI's standard layout
    let repo = tempfile::tempdir().unwrap();
    for name in ["alpha-skill", "beta-skill"] {
        let dir = repo.path().join("skills").join(name);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: Use when testing {name}\n---\n\n# {name}\n"),
        )
        .unwrap();
    }
    fs::write(repo.path().join("skills/alpha-skill/helper.sh"), "#!/bin/sh\necho hi\n").unwrap();
    git(&["init", "-q", "-b", "main"], repo.path());
    git(&["-c", "user.email=t@t", "-c", "user.name=t", "add", "."], repo.path());
    git(
        &["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "skills"],
        repo.path(),
    );

    // shallow fetch by HEAD, then by explicit sha — the two install paths
    let url = repo.path().to_string_lossy().to_string();
    let (checkout, sha) = loadout_lib::test_support::shallow_fetch(&url, None).unwrap();
    assert_eq!(sha.len(), 40);

    let skills = loadout_lib::test_support::discover_skills(checkout.path()).unwrap();
    let names: Vec<&str> = skills.iter().map(|s| s.name.as_str()).collect();
    assert_eq!(names, vec!["alpha-skill", "beta-skill"]);
    assert!(skills[0].files.iter().any(|f| f.path == "helper.sh" && f.executable));
    assert!(skills[0].skill_md.contains("Use when testing alpha-skill"));

    let (_checkout2, sha2) = loadout_lib::test_support::shallow_fetch(&url, Some(&sha)).unwrap();
    assert_eq!(sha, sha2);
}
