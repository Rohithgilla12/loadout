//! End-to-end smoke test against a sandboxed LOADOUT_HOME. Only project-scoped
//! applies run here, so the host's real agent dirs are never written.

use std::fs;
use std::path::Path;
use std::process::Command;

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_loadout")
}

fn run(home: &Path, args: &[&str]) -> (String, i32) {
    let out = Command::new(bin())
        .args(args)
        .env("LOADOUT_HOME", home)
        .output()
        .expect("binary runs");
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    (text, out.status.code().unwrap_or(-1))
}

#[test]
fn switch_check_doctor_roundtrip() {
    let tmp = tempfile::tempdir().unwrap();
    let home = tmp.path().join(".loadout");
    let proj = tmp.path().join("proj");

    // seed: one local skill in the store + lock, one profile, one project
    fs::create_dir_all(home.join("store/local/alpha")).unwrap();
    fs::create_dir_all(home.join("profiles")).unwrap();
    fs::create_dir_all(proj.join(".loadout/skills/alpha")).unwrap();
    let skill_md = "---\nname: alpha\ndescription: test skill\n---\nbody";
    fs::write(home.join("store/local/alpha/SKILL.md"), skill_md).unwrap();
    fs::write(proj.join(".loadout/skills/alpha/SKILL.md"), skill_md).unwrap();
    fs::write(
        home.join("profiles/web.json"),
        r#"{"name":"web","skills":["alpha"]}"#,
    )
    .unwrap();
    fs::write(
        home.join("lock.json"),
        r#"{"skills":{"alpha":{"name":"alpha","source":"local","track":"pinned","description":"test skill","installed_at":"2026-06-10T00:00:00Z"}}}"#,
    )
    .unwrap();
    let canon = fs::canonicalize(&proj).unwrap();
    fs::write(
        home.join("projects.json"),
        format!(
            r#"{{"projects":[{{"path":"{}","name":"proj","profile":null,"registered_at":"2026-06-10T00:00:00Z"}}]}}"#,
            canon.display()
        ),
    )
    .unwrap();
    fs::write(
        proj.join("loadout.json"),
        r#"{"profile":"web","skills":[{"source":"local","skill":"alpha","vendored":".loadout/skills/alpha"}]}"#,
    )
    .unwrap();

    let (out, code) = run(&home, &["list"]);
    assert_eq!(code, 0, "{out}");
    assert!(out.contains("web"), "{out}");

    // before assignment: declared profile not assigned → drift
    let proj_str = proj.to_str().unwrap();
    let (out, code) = run(&home, &["check", proj_str]);
    assert_eq!(code, 1, "{out}");
    assert!(out.contains("DRIFT"), "{out}");

    // project-scoped switch materializes symlinks inside the temp project only
    let (out, code) = run(&home, &["switch", "web", "--project", proj_str]);
    assert_eq!(code, 0, "{out}");
    let link = proj.join(".claude/skills/alpha");
    assert!(link.symlink_metadata().unwrap().file_type().is_symlink());

    // now in sync
    let (out, code) = run(&home, &["check", proj_str]);
    assert_eq!(code, 0, "{out}");
    assert!(out.contains("in sync"), "{out}");

    // unknown profile errors with exit 2
    let (out, code) = run(&home, &["switch", "nope", "--project", proj_str]);
    assert_eq!(code, 2, "{out}");
    assert!(out.contains("not found"), "{out}");

    // doctor: healthy (json shape sanity too)
    let (out, code) = run(&home, &["doctor", "--json"]);
    assert_eq!(code, 0, "{out}");
    assert!(out.contains("\"broken_store\": []"), "{out}");
}
