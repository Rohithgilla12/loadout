mod commands;
mod tray;

// the engine lives in loadout-core; re-export so `crate::apply` etc. resolve
pub use loadout_core::{
    agents, apply, error, gitops, model, overlap, registry, rules, state, store, usage,
};

/// Internal APIs re-exported for integration tests only.
pub mod test_support {
    pub use crate::gitops::{discover_skills, shallow_fetch};
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // crash recovery before the UI asks for anything
    let _ = state::ensure_dirs();
    let _ = apply::recover_if_needed();
    // auto-activation: fill in profiles for opted-in projects, then materialize
    if let Ok(assigned) = rules::auto_assign_unassigned() {
        if !assigned.is_empty() {
            let _ = apply::reapply_all();
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            use tauri::tray::TrayIconBuilder;
            let mut builder = TrayIconBuilder::with_id(tray::TRAY_ID)
                .tooltip("Loadout — switch your kit")
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| tray::handle_menu_event(app, event.id().as_ref()));
            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone());
            }
            builder.build(app)?;
            tray::rebuild(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            // ambient mode: closing the window hides it; the tray keeps living.
            // Quit from the tray menu (or Cmd+Q).
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_library,
            commands::get_skill_detail,
            commands::remove_skill,
            commands::list_profiles_cmd,
            commands::save_profile_cmd,
            commands::create_profile,
            commands::rename_profile,
            commands::duplicate_profile,
            commands::delete_profile_cmd,
            commands::set_base_profile,
            commands::list_projects,
            commands::register_project,
            commands::unregister_project,
            commands::assign_profile,
            commands::set_project_auto,
            commands::apply_project,
            commands::profile_share,
            commands::share_shorten,
            commands::check_slug,
            commands::read_loadout_file,
            commands::export_loadout_file,
            commands::apply_loadout_file,
            commands::resolve_source,
            commands::install_skills,
            commands::check_updates,
            commands::update_skill,
            commands::rollback_skill,
            commands::diff_skill,
            commands::set_track,
            commands::create_local_skill_cmd,
            commands::save_skill_file,
            commands::read_skill_file,
            commands::fork_skill,
            commands::doctor,
            commands::adopt_skill,
            commands::migrate_all,
            commands::reapply_all_cmd,
            commands::get_overview,
            commands::save_settings_cmd,
            commands::refresh_tray,
            commands::scan_usage,
            commands::registry_leaderboard,
            commands::registry_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
