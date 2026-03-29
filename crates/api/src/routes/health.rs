//! Health check endpoint

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use std::{collections::HashMap, sync::Arc};
use tokio::time::{timeout, Duration};
use tracing::warn;

use crate::{models::{DependenciesHealthResponse, HealthResponse}, state::AppState};

fn dependency_timeout() -> Duration {
    Duration::from_millis(
        std::env::var("DEPENDENCY_HEALTH_TIMEOUT_MS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(1500),
    )
}

async fn probe_http_dependency(url: String, timeout_duration: Duration) -> String {
    let client = reqwest::Client::new();
    let future = client.get(url).send();
    match timeout(timeout_duration, future).await {
        Ok(Ok(response)) if response.status().is_success() => "healthy".to_string(),
        Ok(Ok(_)) => "degraded".to_string(),
        Ok(Err(_)) | Err(_) => "degraded".to_string(),
    }
}

async fn check_dependency_components(
    state: &AppState,
) -> (HashMap<String, String>, bool) {
    let mut components = HashMap::new();
    let mut all_healthy = true;

    // --- PostgreSQL ---
    let db_status = match sqlx::query("SELECT 1").execute(&state.db).await {
        Ok(_) => "healthy".to_string(),
        Err(e) => {
            warn!("Database health check failed: {}", e);
            all_healthy = false;
            "degraded".to_string()
        }
    };
    components.insert("database".to_string(), db_status);

    // --- Redis (optional) ---
    let redis_status = if let Some(cache) = &state.cache {
        match cache.try_lock() {
            Ok(mut guard) => {
                if guard.is_healthy().await {
                    "healthy".to_string()
                } else {
                    warn!("Redis health check failed");
                    all_healthy = false;
                    "degraded".to_string()
                }
            }
            Err(_) => "healthy".to_string(),
        }
    } else {
        "not_configured".to_string()
    };
    components.insert("redis".to_string(), redis_status);

    let timeout_duration = dependency_timeout();

    // --- Horizon (optional) ---
    if let Ok(horizon_url) = std::env::var("STELLAR_HORIZON_URL") {
        let status = probe_http_dependency(horizon_url, timeout_duration).await;
        if status != "healthy" {
            all_healthy = false;
        }
        components.insert("horizon".to_string(), status);
    } else {
        components.insert("horizon".to_string(), "not_configured".to_string());
    }

    // --- Soroban RPC (optional) ---
    if let Ok(soroban_rpc_url) = std::env::var("SOROBAN_RPC_URL") {
        let status = probe_http_dependency(soroban_rpc_url, timeout_duration).await;
        if status != "healthy" {
            all_healthy = false;
        }
        components.insert("soroban_rpc".to_string(), status);
    } else {
        components.insert("soroban_rpc".to_string(), "not_configured".to_string());
    }

    (components, all_healthy)
}

/// Health check endpoint
///
/// Probes PostgreSQL and Redis (if configured) and returns per-component
/// statuses.  Returns **200 OK** when everything is healthy, **503
/// Service Unavailable** when any required dependency is down.
#[utoipa::path(
    get,
    path = "/health",
    tag = "health",
    responses(
        (status = 200, description = "All dependencies healthy", body = HealthResponse),
        (status = 503, description = "One or more dependencies unhealthy", body = HealthResponse),
    )
)]
pub async fn health_check(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let timestamp = chrono::Utc::now().to_rfc3339();
    let (components, all_healthy) = check_dependency_components(&state).await;

    let status = if all_healthy {
        "healthy".to_string()
    } else {
        "unhealthy".to_string()
    };

    let body = HealthResponse {
        status,
        timestamp,
        version: state.version.clone(),
        components,
    };

    let http_status = if all_healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (http_status, Json(body)).into_response()
}

/// Dependency-focused health endpoint for readiness probes.
#[utoipa::path(
    get,
    path = "/health/deps",
    tag = "health",
    responses(
        (status = 200, description = "Dependencies healthy", body = DependenciesHealthResponse),
        (status = 503, description = "One or more dependencies degraded", body = DependenciesHealthResponse),
    )
)]
pub async fn dependency_health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let timestamp = chrono::Utc::now().to_rfc3339();
    let (components, all_healthy) = check_dependency_components(&state).await;

    let status = if all_healthy {
        "ok".to_string()
    } else {
        "degraded".to_string()
    };

    let body = DependenciesHealthResponse {
        status,
        timestamp,
        components,
    };

    let http_status = if all_healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (http_status, Json(body)).into_response()
}
