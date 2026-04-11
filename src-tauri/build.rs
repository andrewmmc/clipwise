use std::process::Command;

fn main() {
    // Get version from env var or git tag, fallback to Cargo.toml version
    let version = std::env::var("LLM_ACTIONS_VERSION").ok().or_else(|| {
        Command::new("git")
            .args(["describe", "--tags", "--abbrev=0"])
            .output()
            .ok()
            .and_then(|output| {
                if output.status.success() {
                    String::from_utf8(output.stdout)
                        .ok()
                        .map(|s| s.trim().trim_start_matches('v').to_string())
                } else {
                    None
                }
            })
    });

    if let Some(v) = version {
        println!("cargo:rustc-env=LLM_ACTIONS_VERSION={v}");
    }

    // Get commit hash (9 chars)
    let commit_hash = Command::new("git")
        .args(["rev-parse", "--short=9", "HEAD"])
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                String::from_utf8(output.stdout).ok().map(|s| s.trim().to_string())
            } else {
                None
            }
        });

    if let Some(hash) = commit_hash {
        println!("cargo:rustc-env=LLM_ACTIONS_COMMIT_HASH={hash}");
    }

    // Rerun if git HEAD changes
    println!("cargo:rerun-if-changed=.git/HEAD");
    println!("cargo:rerun-if-env-changed=LLM_ACTIONS_VERSION");

    tauri_build::build()
}
