//! Loadout engine: profiles, the content-addressed skill store, and symlink
//! reconciliation into agent directories. UI-free — consumed by the desktop
//! app (Tauri) and the `loadout` CLI.

pub mod agents;
pub mod apply;
pub mod error;
pub mod gitops;
pub mod model;
pub mod overlap;
pub mod registry;
pub mod rules;
pub mod state;
pub mod store;
pub mod usage;
