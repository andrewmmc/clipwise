use crate::commands::apple_cmd::AppleModelAvailability;
use crate::config::{save_config, ConfigState};
use crate::models::{Provider, ProviderHeaders, ProviderType, APPLE_PROVIDER_ID};
use tauri::{AppHandle, Manager, Runtime};
use tracing::{debug, error, info, warn};

pub(crate) async fn attach_apple_provider_async<R: Runtime>(
    app: AppHandle<R>,
) -> AppleModelAvailability {
    let already_has_apple = {
        let config_state = app.state::<ConfigState>();
        config_state
            .lock()
            .map(|c| {
                c.providers
                    .iter()
                    .any(|p| p.provider_type == ProviderType::Apple)
            })
            .unwrap_or(true)
    };

    if already_has_apple {
        return AppleModelAvailability {
            available: true,
            reason: None,
        };
    }

    let (available, reason) = match crate::providers::apple::check_availability().await {
        Ok(result) => result,
        Err(err) => {
            debug!(error = %err, "Apple Intelligence availability check failed");
            return AppleModelAvailability {
                available: false,
                reason: Some("unknown".to_string()),
            };
        }
    };
    let availability = AppleModelAvailability {
        available,
        reason: reason.clone(),
    };

    if !available {
        debug!(
            reason = reason.as_deref().unwrap_or("unknown"),
            "Apple Intelligence not available; skipping auto-attach"
        );
        return availability;
    }

    info!("Auto-attaching Apple Intelligence provider");

    let config_state = app.state::<ConfigState>();
    let refresh_needed = {
        let mut config = match config_state.lock() {
            Ok(c) => c,
            Err(e) => {
                error!(error = %e, "Failed to lock config for Apple provider attach");
                return availability;
            }
        };

        if config
            .providers
            .iter()
            .any(|p| p.provider_type == ProviderType::Apple)
        {
            return availability;
        }

        let previous = config.clone();
        config.providers.insert(
            0,
            Provider {
                id: APPLE_PROVIDER_ID.to_string(),
                name: "Apple Intelligence".to_string(),
                provider_type: ProviderType::Apple,
                endpoint: None,
                api_key: None,
                headers: ProviderHeaders::new(),
                default_model: None,
                command: None,
                args: vec![],
            },
        );

        if let Err(err) = save_config(&config) {
            *config = previous;
            warn!(error = %err, "Failed to persist auto-attached Apple Intelligence provider");
            false
        } else {
            true
        }
    };

    if refresh_needed {
        if let Ok(config) = config_state.lock() {
            if let Err(err) = crate::tray::refresh_tray_menu(&app, &config) {
                warn!(error = %err, "Failed to refresh tray menu after Apple provider attach");
            }
        }
    }

    availability
}
