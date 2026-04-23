use std::process::Command;

#[cfg(target_os = "macos")]
fn compile_swift_helper() -> Result<(), String> {
    use std::fs;
    use std::path::{Path, PathBuf};

    fn run_command(command: &mut Command, description: &str) -> Result<(), String> {
        let output = command
            .output()
            .map_err(|err| format!("Failed to run {description}: {err}"))?;

        if output.status.success() {
            return Ok(());
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "{description} failed with status {}: {}",
            output.status,
            stderr.trim()
        ))
    }

    fn compile_arch(
        swift_src: &Path,
        module_cache_dir: &Path,
        output_path: &Path,
        target: &str,
    ) -> Result<(), String> {
        let mut command = Command::new("xcrun");
        command
            .args([
                "swiftc",
                "-O",
                "-target",
                target,
                "-module-cache-path",
                module_cache_dir.to_str().unwrap(),
                "-o",
            ])
            .arg(output_path)
            .arg(swift_src);

        run_command(&mut command, &format!("swift helper compile for {target}"))
    }

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let out_dir = std::env::var("OUT_DIR").unwrap();
    let swift_src = Path::new(&manifest_dir).join("swift/apple-model-runner.swift");
    let swift_bin = Path::new(&out_dir).join("apple-model-runner");
    let arm64_bin = Path::new(&out_dir).join("apple-model-runner-arm64");
    let x64_bin = Path::new(&out_dir).join("apple-model-runner-x86_64");
    let module_cache_dir = Path::new(&out_dir).join("swift-module-cache");

    println!("cargo:rerun-if-changed=swift/apple-model-runner.swift");
    println!("cargo:rerun-if-env-changed=CLIPWISE_REQUIRE_APPLE_MODEL_RUNNER");
    let _ = fs::create_dir_all(&module_cache_dir);

    compile_arch(
        &swift_src,
        &module_cache_dir,
        &arm64_bin,
        "arm64-apple-macos26.0",
    )?;
    compile_arch(
        &swift_src,
        &module_cache_dir,
        &x64_bin,
        "x86_64-apple-macos26.0",
    )?;

    let mut lipo = Command::new("xcrun");
    lipo.args(["lipo", "-create", "-output"])
        .arg(&swift_bin)
        .arg(&arm64_bin)
        .arg(&x64_bin);
    run_command(&mut lipo, "swift helper lipo")?;

    let binaries_dir = PathBuf::from(&manifest_dir).join("binaries");
    fs::create_dir_all(&binaries_dir).map_err(|err| {
        format!(
            "Failed to create Tauri binaries directory '{}': {err}",
            binaries_dir.display()
        )
    })?;
    for (source, name) in [
        (&arm64_bin, "apple-model-runner-aarch64-apple-darwin"),
        (&x64_bin, "apple-model-runner-x86_64-apple-darwin"),
        (&swift_bin, "apple-model-runner-universal-apple-darwin"),
    ] {
        let bundled_bin = binaries_dir.join(name);
        fs::copy(source, &bundled_bin).map_err(|err| {
            format!(
                "Failed to copy Apple helper into Tauri sidecar binaries '{}': {err}",
                bundled_bin.display()
            )
        })?;
    }

    println!(
        "cargo:rustc-env=APPLE_MODEL_RUNNER_PATH={}",
        swift_bin.display()
    );

    Ok(())
}

fn read_package_json_version() -> Option<String> {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").ok()?;
    let pkg_path = std::path::Path::new(&manifest_dir).join("../package.json");
    let content = std::fs::read_to_string(&pkg_path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    json["version"].as_str().map(|s| s.to_string())
}

fn main() {
    // Get version: env var > git tag > package.json > Cargo.toml (CARGO_PKG_VERSION at compile time)
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
    }).or_else(read_package_json_version);

    if let Some(v) = version {
        println!("cargo:rustc-env=LLM_ACTIONS_VERSION={v}");
    }

    println!("cargo:rerun-if-changed=../package.json");

    // Get commit hash (9 chars)
    let commit_hash = Command::new("git")
        .args(["rev-parse", "--short=9", "HEAD"])
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                String::from_utf8(output.stdout)
                    .ok()
                    .map(|s| s.trim().to_string())
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
    if let Err(err) = compile_swift_helper() {
        let message = format!(
            "Apple model runner build failed. This usually means the selected Xcode/macOS SDK does not include FoundationModels or cannot build macOS 26 binaries. Original error: {err}"
        );
        if std::env::var_os("CLIPWISE_REQUIRE_APPLE_MODEL_RUNNER").is_some() {
            panic!("{message}");
        } else {
            println!("cargo:warning={message}");
        }
    }

    tauri_build::build()
}
