#![cfg_attr(test, allow(dead_code))]

use crate::error::AppError;
use crate::models::{AppConfig, Provider, ProviderType};

#[cfg(target_os = "macos")]
const KEYCHAIN_SERVICE: &str = "com.andrewmmc.clipwise.provider-api-key";
const KEYCHAIN_REFERENCE_PREFIX: &str = "keychain:";

trait SecretBackend {
    fn set(&self, reference: &str, secret: &str) -> Result<(), AppError>;
    fn get(&self, reference: &str) -> Result<String, AppError>;
    fn delete(&self, reference: &str) -> Result<(), AppError>;
}

struct PlatformSecretBackend;

#[cfg(target_os = "macos")]
impl SecretBackend for PlatformSecretBackend {
    fn set(&self, reference: &str, secret: &str) -> Result<(), AppError> {
        security_framework::passwords::set_generic_password(
            KEYCHAIN_SERVICE,
            reference,
            secret.as_bytes(),
        )
        .map_err(|err| AppError::Service(format!("Failed to store API key in Keychain: {err}")))
    }

    fn get(&self, reference: &str) -> Result<String, AppError> {
        let bytes =
            security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE, reference)
                .map_err(|err| {
                    AppError::Service(format!("Failed to read API key from Keychain: {err}"))
                })?;
        String::from_utf8(bytes)
            .map_err(|_| AppError::Service("Keychain API key is not valid UTF-8".into()))
    }

    fn delete(&self, reference: &str) -> Result<(), AppError> {
        match security_framework::passwords::delete_generic_password(KEYCHAIN_SERVICE, reference) {
            Ok(()) => Ok(()),
            Err(err) if err.code() == -25_300 => Ok(()), // errSecItemNotFound
            Err(err) => Err(AppError::Service(format!(
                "Failed to delete API key from Keychain: {err}"
            ))),
        }
    }
}

#[cfg(not(target_os = "macos"))]
impl SecretBackend for PlatformSecretBackend {
    fn set(&self, _reference: &str, _secret: &str) -> Result<(), AppError> {
        Err(AppError::Config(
            "Secure API key storage requires macOS Keychain".into(),
        ))
    }

    fn get(&self, _reference: &str) -> Result<String, AppError> {
        Err(AppError::Config(
            "Secure API key storage requires macOS Keychain".into(),
        ))
    }

    fn delete(&self, _reference: &str) -> Result<(), AppError> {
        Ok(())
    }
}

fn is_api_provider(provider: &Provider) -> bool {
    matches!(
        provider.provider_type,
        ProviderType::OpenAI | ProviderType::Anthropic
    )
}

pub(crate) fn keychain_reference(provider_id: &str) -> String {
    format!("{KEYCHAIN_REFERENCE_PREFIX}{provider_id}")
}

fn is_keychain_reference(value: &str) -> bool {
    value.starts_with(KEYCHAIN_REFERENCE_PREFIX)
}

pub(crate) fn store_provider_secret(provider: &Provider) -> Result<(), AppError> {
    if !is_api_provider(provider) {
        return Ok(());
    }
    let secret = provider
        .api_key
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Config("API providers require an API key".into()))?;
    PlatformSecretBackend.set(&keychain_reference(&provider.id), secret)
}

pub(crate) fn delete_provider_secret(provider_id: &str) -> Result<(), AppError> {
    PlatformSecretBackend.delete(&keychain_reference(provider_id))
}

pub(crate) fn restore_provider_secret(provider: &Provider) -> Result<(), AppError> {
    if is_api_provider(provider) {
        store_provider_secret(provider)
    } else {
        delete_provider_secret(&provider.id)
    }
}

pub(crate) fn config_for_persistence(config: &AppConfig) -> AppConfig {
    let mut persisted = config.clone();
    for provider in &mut persisted.providers {
        if is_api_provider(provider) && provider.api_key.is_some() {
            provider.api_key = Some(keychain_reference(&provider.id));
        }
    }
    persisted
}

fn hydrate_and_migrate_with(
    config: &mut AppConfig,
    backend: &impl SecretBackend,
) -> Result<bool, AppError> {
    let mut migrated = false;
    for provider in &mut config.providers {
        if !is_api_provider(provider) {
            continue;
        }
        let stored_value = provider
            .api_key
            .as_deref()
            .ok_or_else(|| AppError::Config("API providers require an API key".into()))?;
        let reference = keychain_reference(&provider.id);
        if is_keychain_reference(stored_value) {
            provider.api_key = Some(backend.get(stored_value)?);
        } else {
            backend.set(&reference, stored_value)?;
            migrated = true;
        }
    }
    Ok(migrated)
}

pub(crate) fn hydrate_and_migrate_config(config: &mut AppConfig) -> Result<bool, AppError> {
    hydrate_and_migrate_with(config, &PlatformSecretBackend)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AppSettings, ProviderHeaders};
    use std::cell::RefCell;
    use std::collections::HashMap;

    #[derive(Default)]
    struct FakeBackend(RefCell<HashMap<String, String>>);

    impl SecretBackend for FakeBackend {
        fn set(&self, reference: &str, secret: &str) -> Result<(), AppError> {
            self.0
                .borrow_mut()
                .insert(reference.to_string(), secret.to_string());
            Ok(())
        }

        fn get(&self, reference: &str) -> Result<String, AppError> {
            self.0
                .borrow()
                .get(reference)
                .cloned()
                .ok_or_else(|| AppError::Service("missing fake secret".into()))
        }

        fn delete(&self, reference: &str) -> Result<(), AppError> {
            self.0.borrow_mut().remove(reference);
            Ok(())
        }
    }

    fn config_with_key(api_key: &str) -> AppConfig {
        AppConfig {
            providers: vec![Provider {
                id: "provider-1".into(),
                name: "OpenAI".into(),
                provider_type: ProviderType::OpenAI,
                endpoint: None,
                api_key: Some(api_key.into()),
                headers: ProviderHeaders::new(),
                default_model: None,
                command: None,
                args: vec![],
            }],
            actions: vec![],
            settings: AppSettings::default(),
        }
    }

    #[test]
    fn persistence_replaces_plaintext_with_reference() {
        let persisted = config_for_persistence(&config_with_key("sk-secret"));
        assert_eq!(
            persisted.providers[0].api_key.as_deref(),
            Some("keychain:provider-1")
        );
        assert!(!serde_json::to_string(&persisted)
            .unwrap()
            .contains("sk-secret"));
    }

    #[test]
    fn legacy_plaintext_is_migrated_and_kept_hydrated_in_memory() {
        let backend = FakeBackend::default();
        let mut config = config_with_key("sk-legacy");

        assert!(hydrate_and_migrate_with(&mut config, &backend).unwrap());
        assert_eq!(config.providers[0].api_key.as_deref(), Some("sk-legacy"));
        assert_eq!(
            backend
                .0
                .borrow()
                .get("keychain:provider-1")
                .map(String::as_str),
            Some("sk-legacy")
        );
    }

    #[test]
    fn keychain_reference_is_hydrated_without_migration() {
        let backend = FakeBackend::default();
        backend
            .0
            .borrow_mut()
            .insert("keychain:provider-1".into(), "sk-keychain".into());
        let mut config = config_with_key("keychain:provider-1");

        assert!(!hydrate_and_migrate_with(&mut config, &backend).unwrap());
        assert_eq!(config.providers[0].api_key.as_deref(), Some("sk-keychain"));
    }
}
