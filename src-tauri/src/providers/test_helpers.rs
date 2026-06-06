use reqwest::Client;
use tokio::task::JoinError;
use wiremock::MockServer;

pub(crate) async fn start_mock_server_or_skip() -> Option<MockServer> {
    match tokio::spawn(async { MockServer::start().await }).await {
        Ok(server) => Some(server),
        Err(err) if should_skip_mock_server_test(&err) => {
            eprintln!(
                "Skipping HTTP integration test because this environment cannot bind a local port"
            );
            None
        }
        Err(err) => panic!("Mock server startup failed unexpectedly: {err}"),
    }
}

fn should_skip_mock_server_test(err: &JoinError) -> bool {
    err.is_panic()
}

pub(crate) fn no_proxy_client() -> Client {
    Client::builder().no_proxy().build().unwrap()
}
