use crate::error::AppError;

const APPROVAL_REQUIRED: &str =
    "Start at login requires approval in System Settings > General > Login Items.";
const SERVICE_NOT_FOUND: &str =
    "Start at login is unavailable because macOS could not find the signed Clipwise app bundle.";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ServiceStatus {
    NotRegistered,
    Enabled,
    RequiresApproval,
    NotFound,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ServiceAction {
    None,
    Register,
    Unregister,
}

fn desired_action(status: ServiceStatus, should_enable: bool) -> Result<ServiceAction, AppError> {
    match (status, should_enable) {
        (ServiceStatus::Enabled, true)
        | (ServiceStatus::NotRegistered, false)
        | (ServiceStatus::NotFound, false) => Ok(ServiceAction::None),
        (ServiceStatus::NotRegistered, true) => Ok(ServiceAction::Register),
        (ServiceStatus::Enabled, false) | (ServiceStatus::RequiresApproval, false) => {
            Ok(ServiceAction::Unregister)
        }
        (ServiceStatus::RequiresApproval, true) => Err(AppError::Service(APPROVAL_REQUIRED.into())),
        (ServiceStatus::NotFound, true) => Err(AppError::Service(SERVICE_NOT_FOUND.into())),
        (ServiceStatus::Unknown, _) => Err(AppError::Service(
            "Start at login returned an unknown macOS service status.".into(),
        )),
    }
}

#[cfg(all(target_os = "macos", not(test)))]
fn service_status(service: &objc2_service_management::SMAppService) -> ServiceStatus {
    use objc2_service_management::SMAppServiceStatus;

    // SAFETY: Clipwise requires macOS 26, while SMAppService.status is
    // available from macOS 13. The method has no additional preconditions.
    match unsafe { service.status() } {
        SMAppServiceStatus::NotRegistered => ServiceStatus::NotRegistered,
        SMAppServiceStatus::Enabled => ServiceStatus::Enabled,
        SMAppServiceStatus::RequiresApproval => ServiceStatus::RequiresApproval,
        SMAppServiceStatus::NotFound => ServiceStatus::NotFound,
        _ => ServiceStatus::Unknown,
    }
}

#[cfg(all(target_os = "macos", not(test)))]
fn main_app_service() -> objc2::rc::Retained<objc2_service_management::SMAppService> {
    // SAFETY: Clipwise requires macOS 26, while SMAppService.mainAppService is
    // available from macOS 13. The method has no additional preconditions.
    unsafe { objc2_service_management::SMAppService::mainAppService() }
}

#[cfg(all(target_os = "macos", not(test)))]
pub(crate) fn is_enabled() -> Result<bool, AppError> {
    Ok(service_status(&main_app_service()) == ServiceStatus::Enabled)
}

#[cfg(all(not(target_os = "macos"), not(test)))]
pub(crate) fn is_enabled() -> Result<bool, AppError> {
    Ok(false)
}

/// Registers the main Clipwise app with Service Management. Unlike a legacy
/// LaunchAgent plist, SMAppService works inside the Mac App Store sandbox and
/// makes the login item visible to the user in System Settings.
#[cfg(all(target_os = "macos", not(test)))]
pub(crate) fn set_enabled(should_enable: bool) -> Result<(), AppError> {
    let service = main_app_service();
    let action = desired_action(service_status(&service), should_enable)?;

    let result = match action {
        ServiceAction::None => return Ok(()),
        // SAFETY: Availability is guaranteed by Clipwise's macOS 26 minimum,
        // and SMAppService owns the NSError returned by these methods.
        ServiceAction::Register => unsafe { service.registerAndReturnError() },
        // SAFETY: Same availability and ownership guarantees as registration.
        ServiceAction::Unregister => unsafe { service.unregisterAndReturnError() },
    };

    if let Err(error) = result {
        let status = service_status(&service);
        if status == ServiceStatus::RequiresApproval && should_enable {
            return Err(AppError::Service(APPROVAL_REQUIRED.into()));
        }
        // A concurrent System Settings change may make the requested state
        // true even though the API call itself reported a stale-state error.
        if (should_enable && status == ServiceStatus::Enabled)
            || (!should_enable
                && matches!(
                    status,
                    ServiceStatus::NotRegistered | ServiceStatus::NotFound
                ))
        {
            return Ok(());
        }
        let action = if should_enable { "enable" } else { "disable" };
        return Err(AppError::Service(format!(
            "Failed to {action} start at login: {error}"
        )));
    }

    match desired_action(service_status(&service), should_enable) {
        Ok(ServiceAction::None) => Ok(()),
        Err(error) => Err(error),
        Ok(_) => Err(AppError::Service(
            "macOS did not apply the requested start-at-login change.".into(),
        )),
    }
}

#[cfg(all(not(target_os = "macos"), not(test)))]
pub(crate) fn set_enabled(should_enable: bool) -> Result<(), AppError> {
    if should_enable {
        Err(AppError::Service(
            "Start at login is only available on macOS.".into(),
        ))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enabling_registers_an_unregistered_service() {
        assert_eq!(
            desired_action(ServiceStatus::NotRegistered, true).unwrap(),
            ServiceAction::Register
        );
    }

    #[test]
    fn disabling_unregisters_enabled_or_blocked_services() {
        assert_eq!(
            desired_action(ServiceStatus::Enabled, false).unwrap(),
            ServiceAction::Unregister
        );
        assert_eq!(
            desired_action(ServiceStatus::RequiresApproval, false).unwrap(),
            ServiceAction::Unregister
        );
    }

    #[test]
    fn matching_states_are_idempotent() {
        assert_eq!(
            desired_action(ServiceStatus::Enabled, true).unwrap(),
            ServiceAction::None
        );
        assert_eq!(
            desired_action(ServiceStatus::NotRegistered, false).unwrap(),
            ServiceAction::None
        );
    }

    #[test]
    fn enabling_reports_when_user_approval_is_required() {
        let error = desired_action(ServiceStatus::RequiresApproval, true).unwrap_err();
        assert!(error.to_string().contains("System Settings"));
    }

    #[test]
    fn enabling_reports_when_the_signed_bundle_is_unavailable() {
        let error = desired_action(ServiceStatus::NotFound, true).unwrap_err();
        assert!(error.to_string().contains("signed Clipwise app bundle"));
    }

    #[test]
    fn unknown_service_status_is_rejected() {
        let error = desired_action(ServiceStatus::Unknown, false).unwrap_err();
        assert!(error.to_string().contains("unknown macOS service status"));
    }
}
