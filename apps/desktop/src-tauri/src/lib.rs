mod agents;
mod apply;
mod commands;
mod error;
mod gitops;
mod model;
mod registry;
mod state;
mod store;

/// Internal APIs re-exported for integration tests only.
pub mod test_support {
    pub use crate::gitops::{discover_skills, shallow_fetch};
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // crash recovery before the UI asks for anything
    let _ = state::ensure_dirs();
    let _ = apply::recover_if_needed();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            commands::registry_leaderboard,
            commands::registry_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
