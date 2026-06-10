//! Menu-bar quick-switcher: switch the base profile or any project's kit
//! without opening the window. The whole point is that switching should cost
//! two clicks from anywhere — switches/week is the metric.

use crate::error::Result;
use crate::{apply, state};
use std::path::PathBuf;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};

pub const TRAY_ID: &str = "main";

/// Rebuild the tray menu from current state. Called at startup and after
/// every mutation that changes profiles/projects/base.
pub fn rebuild(app: &AppHandle) {
    if let Err(e) = rebuild_inner(app) {
        eprintln!("tray rebuild failed: {e}");
    }
}

// mixes engine errors (AppError) and tauri menu errors, so Box<dyn Error>
fn rebuild_inner(app: &AppHandle) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let settings = state::load_settings()?;
    let profiles = state::list_profiles()?;
    let projects = state::load_projects()?;

    let mut menu = MenuBuilder::new(app);

    // base profile section
    let base_label = format!(
        "Base profile — {}",
        settings.base_profile.as_deref().unwrap_or("none")
    );
    let mut base = SubmenuBuilder::new(app, base_label);
    for p in &profiles {
        let item = CheckMenuItemBuilder::with_id(format!("base::{}", p.name), &p.name)
            .checked(settings.base_profile.as_deref() == Some(p.name.as_str()))
            .build(app)?;
        base = base.item(&item);
    }
    let none = CheckMenuItemBuilder::with_id("base::__none__", "(none)")
        .checked(settings.base_profile.is_none())
        .build(app)?;
    base = base.separator().item(&none);
    let base = base.build()?;
    menu = menu.item(&base).separator();

    // one submenu per project
    for proj in &projects.projects {
        let label = format!(
            "{} — {}",
            proj.name,
            proj.profile.as_deref().unwrap_or("no profile")
        );
        let mut sm = SubmenuBuilder::new(app, label);
        for p in &profiles {
            let item = CheckMenuItemBuilder::with_id(
                format!("proj::{}::{}", proj.path, p.name),
                &p.name,
            )
            .checked(proj.profile.as_deref() == Some(p.name.as_str()))
            .build(app)?;
            sm = sm.item(&item);
        }
        let none = CheckMenuItemBuilder::with_id(format!("proj::{}::__none__", proj.path), "(none)")
            .checked(proj.profile.is_none())
            .build(app)?;
        sm = sm.separator().item(&none);
        let sm = sm.build()?;
        menu = menu.item(&sm);
    }
    if !projects.projects.is_empty() {
        menu = menu.separator();
    }

    menu = menu
        .item(&MenuItemBuilder::with_id("open", "Open Loadout").build(app)?)
        .item(&MenuItemBuilder::with_id("quit", "Quit Loadout").build(app)?);
    let menu = menu.build()?;

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

/// Tell the webview to refetch everything after a tray-driven change.
fn notify(app: &AppHandle) {
    let _ = app.emit("loadout-state-changed", ());
}

pub fn handle_menu_event(app: &AppHandle, id: &str) {
    let result = (|| -> Result<()> {
        match id {
            "open" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.unminimize();
                    let _ = win.set_focus();
                }
                Ok(())
            }
            "quit" => {
                app.exit(0);
                Ok(())
            }
            _ if id.starts_with("base::") => {
                let name = id.trim_start_matches("base::");
                let mut settings = state::load_settings()?;
                settings.base_profile = if name == "__none__" {
                    None
                } else {
                    Some(name.to_string())
                };
                state::save_settings(&settings)?;
                apply::reapply_all()?;
                rebuild(app);
                notify(app);
                Ok(())
            }
            _ if id.starts_with("proj::") => {
                let rest = id.trim_start_matches("proj::");
                let Some((path, profile)) = rest.rsplit_once("::") else {
                    return Ok(());
                };
                let mut projects = state::load_projects()?;
                if let Some(p) = projects.projects.iter_mut().find(|p| p.path == path) {
                    p.profile = if profile == "__none__" {
                        None
                    } else {
                        Some(profile.to_string())
                    };
                }
                state::save_projects(&projects)?;
                let projects = state::load_projects()?;
                if let Some(p) = projects.projects.iter().find(|p| p.path == path) {
                    let names = apply::project_scope_skills(p.profile.as_deref())?;
                    apply::apply_scope(&names, Some(&PathBuf::from(path)))?;
                }
                rebuild(app);
                notify(app);
                Ok(())
            }
            _ => Ok(()),
        }
    })();
    if let Err(e) = result {
        eprintln!("tray action '{id}' failed: {e}");
    }
}
