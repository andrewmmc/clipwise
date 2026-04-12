use std::process::Command;

#[cfg(target_os = "macos")]
fn compile_swift_helper() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let swift_src = std::path::Path::new(&manifest_dir).join("swift/apple-model-runner.swift");
    let swift_bin = std::path::Path::new(&manifest_dir).join("swift/apple-model-runner");

    println!("cargo:rerun-if-changed=swift/apple-model-runner.swift");

    let result = Command::new("xcrun")
        .args([
            "swiftc",
            "-O",
            "-target",
            "arm64-apple-macos26.0",
            "-o",
        ])
        .arg(&swift_bin)
        .arg(&swift_src)
        .status();

    match result {
        Ok(status) if status.success() => {
            println!(
                "cargo:rustc-env=APPLE_MODEL_RUNNER_PATH={}",
                swift_bin.display()
            );
        }
        Ok(status) => {
            println!(
                "cargo:warning=Swift helper compilation failed with status: {status}"
            );
        }
        Err(e) => {
            println!("cargo:warning=Failed to run xcrun swiftc: {e}");
        }
    }
}

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

    #[cfg(target_os = "macos")]
    compile_swift_helper();

    tauri_build::build()
}
