//! Trading pairs endpoint

use axum::{extract::{Query, State}, Json};
use serde::Deserialize;
use sqlx::Row;
use std::{sync::{Arc, OnceLock}, time::{Duration, Instant}};
use tracing::{debug, warn};

use crate::{
    cache,
    error::{ApiError, Result},
    middleware::RequestId,
    models::{AssetInfo, PairsResponse, TradingPair},
    state::AppState,
};

const DEFAULT_PAGE_SIZE: usize = 25;
const MAX_PAGE_SIZE: usize = 100;

#[derive(Debug, Deserialize, Default)]
pub struct PairsQuery {
    pub limit: Option<usize>,
    pub cursor: Option<String>,
    pub offset: Option<usize>,
}

#[derive(Debug)]
struct Page {
    limit: usize,
    offset: usize,
}

fn parse_cursor(cursor: &str) -> Result<usize> {
    cursor
        .parse::<usize>()
        .map_err(|_| ApiError::Validation("Invalid cursor; expected a numeric offset".to_string()))
}

fn parse_page(query: &PairsQuery) -> Result<Page> {
    let limit = query
        .limit
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(1, MAX_PAGE_SIZE);

    let offset = match (&query.cursor, query.offset) {
        (Some(cursor), _) => parse_cursor(cursor)?,
        (None, Some(offset)) => offset,
        (None, None) => 0,
    };

    Ok(Page { limit, offset })
}

fn slow_query_threshold_ms() -> u64 {
    static SLOW_QUERY_THRESHOLD_MS: OnceLock<u64> = OnceLock::new();
    *SLOW_QUERY_THRESHOLD_MS.get_or_init(|| {
        std::env::var("DB_SLOW_QUERY_MS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(500)
    })
}

fn compute_cursors(
    offset: usize,
    limit: usize,
    page_size: usize,
    total: usize,
) -> (Option<String>, Option<String>) {
    let next_offset = offset + page_size;
    let next_cursor = if next_offset < total {
        Some(next_offset.to_string())
    } else {
        None
    };
    let prev_cursor = if offset > 0 {
        Some(offset.saturating_sub(limit).to_string())
    } else {
        None
    };

    (next_cursor, prev_cursor)
}

/// List all available trading pairs
///
/// Returns a list of trading pairs with active offers in the orderbook.
/// Each pair exposes human-readable `base`/`counter` codes alongside
/// canonical Stellar asset identifiers (`base_asset`/`counter_asset`).
#[utoipa::path(
    get,
    path = "/api/v1/pairs",
    tag = "trading",
    params(
        ("limit" = Option<usize>, Query, description = "Page size. Default 25, max 100."),
        ("cursor" = Option<String>, Query, description = "Opaque cursor for the next page."),
        ("offset" = Option<usize>, Query, description = "Offset-based pagination alternative to cursor.")
    ),
    responses(
        (status = 200, description = "List of trading pairs", body = PairsResponse),
        (status = 400, description = "Invalid pagination parameters", body = ErrorResponse),
        (status = 500, description = "Internal server error", body = ErrorResponse),
    )
)]
pub async fn list_pairs(
    State(state): State<Arc<AppState>>,
    request_id: RequestId,
    Query(query): Query<PairsQuery>,
) -> Result<Json<PairsResponse>> {
    debug!("Fetching trading pairs");

    let page = parse_page(&query)?;
    let cache_key = cache::keys::pairs_list_page(page.limit, page.offset);

    // Try to get from cache first
    if let Some(cache) = &state.cache {
        if let Ok(mut cache) = cache.try_lock() {
            if let Some(cached) = cache.get::<PairsResponse>(&cache_key).await {
                debug!("Returning cached pairs");
                return Ok(Json(cached));
            }
        }
    }

    // Query distinct trading pairs that have active offers in the orderbook.
    // Results are ranked by offer depth so the most liquid pairs appear first.
    let query_started = Instant::now();
    let rows = sqlx::query(
        r#"
        with ranked_pairs as (
            select
                sa.asset_type as selling_type,
                sa.asset_code as selling_code,
                sa.asset_issuer as selling_issuer,
                ba.asset_type as buying_type,
                ba.asset_code as buying_code,
                ba.asset_issuer as buying_issuer,
                count(*) as offer_count,
                max(o.updated_at) as last_updated
            from sdex_offers o
            join assets sa on o.selling_asset_id = sa.id
            join assets ba on o.buying_asset_id = ba.id
            group by
                sa.asset_type, sa.asset_code, sa.asset_issuer,
                ba.asset_type, ba.asset_code, ba.asset_issuer
        )
        select
            selling_type,
            selling_code,
            selling_issuer,
            buying_type,
            buying_code,
            buying_issuer,
            offer_count,
            last_updated,
            count(*) over() as total_count
        from ranked_pairs
        order by
            offer_count desc,
            last_updated desc nulls last,
            selling_type asc,
            selling_code asc nulls first,
            selling_issuer asc nulls first,
            buying_type asc,
            buying_code asc nulls first,
            buying_issuer asc nulls first
        limit $1 offset $2
        "#,
    )
    .bind(page.limit as i64)
    .bind(page.offset as i64)
    .fetch_all(&state.db)
    .await
    .map_err(|e| ApiError::Database(Arc::new(e)))?;

    let query_elapsed_ms = query_started.elapsed().as_millis() as u64;
    if query_elapsed_ms >= slow_query_threshold_ms() {
        warn!(
            request_id = %request_id,
            endpoint = "/api/v1/pairs",
            elapsed_ms = query_elapsed_ms,
            "Slow query detected"
        );
    }

    let mut pairs = Vec::new();
    let total = rows
        .first()
        .map(|row| row.get::<i64, _>("total_count") as usize)
        .unwrap_or(0);

    for row in rows {
        let selling_type: String = row.get("selling_type");
        let buying_type: String = row.get("buying_type");

        // Build AssetInfo helpers so we can derive both display names and
        // canonical identifiers from a single source of truth.
        let base_info = if selling_type == "native" {
            AssetInfo::native()
        } else {
            AssetInfo::credit(
                row.get::<Option<String>, _>("selling_code")
                    .unwrap_or_default(),
                row.get("selling_issuer"),
            )
        };

        let counter_info = if buying_type == "native" {
            AssetInfo::native()
        } else {
            AssetInfo::credit(
                row.get::<Option<String>, _>("buying_code")
                    .unwrap_or_default(),
                row.get("buying_issuer"),
            )
        };

        let offer_count: i64 = row.get("offer_count");
        let last_updated: Option<chrono::DateTime<chrono::Utc>> = row.get("last_updated");

        pairs.push(TradingPair {
            base: base_info.display_name(),
            counter: counter_info.display_name(),
            base_asset: base_info.to_canonical(),
            counter_asset: counter_info.to_canonical(),
            offer_count,
            last_updated: last_updated.map(|dt| dt.to_rfc3339()),
        });
    }

    debug!("Found {} trading pairs", pairs.len());

    let (next_cursor, prev_cursor) = compute_cursors(page.offset, page.limit, pairs.len(), total);

    let response = PairsResponse {
        total,
        pairs,
        limit: Some(page.limit),
        next_cursor,
        prev_cursor,
    };

    // Cache the response for 10 s to keep latency well under the 100 ms SLA.
    if let Some(cache) = &state.cache {
        if let Ok(mut cache) = cache.try_lock() {
            let _ = cache
                .set(
                    &cache_key,
                    &response,
                    Duration::from_secs(10),
                )
                .await;
        }
    }

    Ok(Json(response))
}

/// Alias endpoint for clients using a market-list naming convention.
#[utoipa::path(
    get,
    path = "/api/v1/markets",
    tag = "trading",
    params(
        ("limit" = Option<usize>, Query, description = "Page size. Default 25, max 100."),
        ("cursor" = Option<String>, Query, description = "Opaque cursor for the next page."),
        ("offset" = Option<usize>, Query, description = "Offset-based pagination alternative to cursor.")
    ),
    responses(
        (status = 200, description = "List of active markets", body = PairsResponse),
        (status = 400, description = "Invalid pagination parameters", body = ErrorResponse),
        (status = 500, description = "Internal server error", body = ErrorResponse),
    )
)]
pub async fn list_markets(
    State(state): State<Arc<AppState>>,
    request_id: RequestId,
    query: Query<PairsQuery>,
) -> Result<Json<PairsResponse>> {
    list_pairs(State(state), request_id, query).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_page_defaults() {
        let page = parse_page(&PairsQuery::default()).unwrap();
        assert_eq!(page.limit, 25);
        assert_eq!(page.offset, 0);
    }

    #[test]
    fn parse_page_respects_max_cap() {
        let page = parse_page(&PairsQuery {
            limit: Some(500),
            cursor: None,
            offset: None,
        })
        .unwrap();
        assert_eq!(page.limit, 100);
    }

    #[test]
    fn parse_page_rejects_invalid_cursor() {
        let err = parse_page(&PairsQuery {
            limit: Some(10),
            cursor: Some("bad-cursor".to_string()),
            offset: None,
        })
        .unwrap_err();
        assert!(matches!(err, ApiError::Validation(_)));
    }

    #[test]
    fn parse_page_uses_cursor_precedence() {
        let page = parse_page(&PairsQuery {
            limit: Some(10),
            cursor: Some("30".to_string()),
            offset: Some(5),
        })
        .unwrap();
        assert_eq!(page.offset, 30);
    }

    #[test]
    fn compute_cursors_first_page_has_next_only() {
        let (next_cursor, prev_cursor) = compute_cursors(0, 25, 25, 100);
        assert_eq!(next_cursor.as_deref(), Some("25"));
        assert!(prev_cursor.is_none());
    }

    #[test]
    fn compute_cursors_last_page_has_prev_only() {
        let (next_cursor, prev_cursor) = compute_cursors(75, 25, 25, 100);
        assert!(next_cursor.is_none());
        assert_eq!(prev_cursor.as_deref(), Some("50"));
    }
}
