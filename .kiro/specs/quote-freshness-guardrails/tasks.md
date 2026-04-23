# Implementation Plan: Quote Freshness Guardrails

## Overview

Implement server-side freshness guardrails in the quote generation path. The work spans four areas:
(1) a `FreshnessGuard` module in the `routing` crate, (2) per-venue-type threshold config in
`HealthScoringConfig`, (3) freshness-aware filtering and error handling in the quote route, and
(4) new staleness metrics counters exposed at `/metrics/cache`.

## Tasks

- [x] 1. Extend `HealthScoringConfig` with per-venue-type freshness thresholds
  - Add a `FreshnessThresholds` struct with `sdex: u64` and `amm: u64` fields and serde defaults
    (30 s for SDEX, 60 s for AMM) to `crates/routing/src/health/scorer.rs`
  - Add a `freshness_threshold_secs: FreshnessThresholds` field to `HealthScoringConfig` with
    `#[serde(default)]`
  - Add validation that rejects zero or negative values with a descriptive error
  - Update `HealthScoringConfig::default()` to populate the new field
  - _Requirements: 5.1, 5.2, 5.5_

  - [x]* 1.1 Write unit tests for `FreshnessThresholds` deserialization and validation
    - Test default values when field is absent from config
    - Test that zero/negative values produce a config error
    - _Requirements: 5.2, 5.5_

- [x] 2. Implement `FreshnessGuard` in the `routing` crate
  - Create `crates/routing/src/health/freshness.rs`
  - Define `FreshnessResult { is_fresh: bool, staleness_secs: u64 }` and
    `FreshnessOutcome { fresh: Vec<usize>, stale: Vec<usize>, max_staleness_secs: u64 }`
  - Implement `FreshnessGuard::evaluate(inputs: &[VenueScorerInput], thresholds: &FreshnessThresholds, now: DateTime<Utc>) -> FreshnessOutcome`
    - Classify each input by comparing `(now - last_updated_at).num_seconds()` against the
      per-venue-type threshold from `FreshnessThresholds`
    - Treat a missing timestamp (use `Option<DateTime<Utc>>` on `VenueScorerInput`) as stale
  - Export `freshness` module from `crates/routing/src/health/mod.rs`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.5_

  - [ ]* 2.1 Write property test for freshness classification monotonicity
    - **Property 1: Monotonicity — if staleness_secs ≤ threshold the input is fresh; if
      staleness_secs > threshold it is stale**
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 2.2 Write unit tests for `FreshnessGuard::evaluate`
    - Test all-fresh, all-stale, and mixed inputs
    - Test absent timestamp treated as stale (Req 2.5)
    - Test SDEX and AMM thresholds applied independently
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.5_

- [x] 3. Add `StaleData` exclusion reason and update `ExclusionDiagnostics`
  - Add `StaleData` variant to `stellarroute_routing::health::policy::ExclusionReason`
  - Add corresponding `StaleData` variant to `crates/api/src/models/ExclusionReason`
  - _Requirements: 6.2_

- [x] 4. Integrate `FreshnessGuard` into the quote route
  - In `crates/api/src/routes/quote.rs`, call `FreshnessGuard::evaluate` on `scorer_inputs`
    before health scoring, using `state.health_config.freshness_threshold_secs`
  - Partition candidates into fresh and stale sets using the returned indices
  - Append stale candidates to `api_diagnostics.excluded_venues` with reason `StaleData`
  - Pass only fresh candidates to `HealthScorer::score_venues` and
    `evaluate_single_hop_direct_venues`
  - _Requirements: 2.2, 6.1, 6.2, 6.4_

- [x] 5. Return `StaleQuoteError` (HTTP 422) when all inputs are stale
  - Add `ApiError::StaleMarketData { stale_count: usize, fresh_count: usize, threshold_secs_sdex: u64, threshold_secs_amm: u64 }` to `crates/api/src/error.rs`
  - Map it to HTTP 422 with `error: "stale_market_data"` and a `details` object containing
    `stale_count`, `fresh_count`, and `threshold_secs` (use the minimum of sdex/amm or expose
    both — match Req 2.4 exactly)
  - In `find_best_price`, return `ApiError::StaleMarketData` when the fresh candidate list is
    empty after freshness filtering
  - _Requirements: 2.1, 2.3, 2.4_

  - [x]* 5.1 Write unit tests for `StaleMarketData` error serialization
    - Verify HTTP 422 status code
    - Verify `error` field equals `"stale_market_data"`
    - Verify `details` contains `stale_count`, `fresh_count`, `threshold_secs`
    - _Requirements: 2.3, 2.4_

- [x] 6. Populate `source_timestamp` and add `DataFreshness` to `QuoteResponse`
  - Add `DataFreshness { fresh_count: usize, stale_count: usize, max_staleness_secs: u64 }` struct
    to `crates/api/src/models/response.rs` with `#[serde(rename_all = "snake_case")]`
  - Add `data_freshness: Option<DataFreshness>` field to `QuoteResponse` with
    `#[serde(skip_serializing_if = "Option::is_none")]`
  - In `get_quote`, set `source_timestamp` to the oldest `last_updated_at` among fresh candidates
    (as Unix ms), and populate `data_freshness` from `FreshnessOutcome`
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x]* 6.1 Write property test for `QuoteResponse` freshness round-trip
    - **Property 2: Round-trip — serialize then deserialize any `QuoteResponse` with a
      `data_freshness` field produces a value equal to the original**
    - **Validates: Requirements 7.2**

  - [x]* 6.2 Write unit tests for `DataFreshness` serialization edge cases
    - Test unknown fields inside `data_freshness` are ignored on deserialization (Req 7.3)
    - Test missing `data_freshness` field deserializes to `None` without error (Req 7.4)
    - Test `stale_count` is zero when all candidates are fresh (Req 3.3)
    - _Requirements: 3.3, 7.3, 7.4_

- [x] 7. Add staleness metrics counters to `CacheMetrics`
  - Add `stale_quote_rejections: AtomicU64` and `stale_inputs_excluded: AtomicU64` to
    `CacheMetrics` in `crates/api/src/state.rs`; initialize both to zero in `Default`
  - Add `inc_stale_rejection()` and `add_stale_inputs_excluded(n: u64)` methods
  - Add `stale_quote_rejections` and `stale_inputs_excluded` fields to `CacheMetricsResponse` in
    `crates/api/src/models/response.rs`
  - Update `cache_metrics` handler in `crates/api/src/routes/metrics.rs` to include the new
    counters in the response
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 8. Increment metrics counters in the quote route
  - Call `state.cache_metrics.inc_stale_rejection()` when returning `StaleMarketData`
  - Call `state.cache_metrics.add_stale_inputs_excluded(n)` with the stale count on each
    successful quote that excluded at least one stale input
  - _Requirements: 4.1, 4.2_

  - [x]* 8.1 Write unit tests for counter increments
    - Test `stale_quote_rejections` increments on all-stale input
    - Test `stale_inputs_excluded` increments by the correct count on partial-stale input
    - _Requirements: 4.1, 4.2_

- [-] 9. Handle mixed-freshness: `NoRouteFound` when fresh candidates lack liquidity
  - After freshness filtering, if fresh candidates are non-empty but
    `evaluate_single_hop_direct_venues` returns `NoRouteFound`, propagate `NoRouteFound` (not
    `StaleMarketData`)
  - _Requirements: 6.3_

  - [-]* 9.1 Write unit test for mixed-freshness insufficient-liquidity path
    - Construct a scenario with one fresh low-liquidity candidate and one stale candidate
    - Assert the result is `ApiError::NoRouteFound`
    - _Requirements: 6.3_

- [~] 10. Checkpoint — ensure all tests pass
  - Run `cargo test -p stellarroute-routing -p stellarroute-api` and confirm zero failures.
    Ask the user if any questions arise.

- [~] 11. Wire runtime config reload for freshness thresholds
  - Verify that `AppState::health_config` is updated on config reload (or document the existing
    reload path) so that `freshness_threshold_secs` changes take effect without restart
  - _Requirements: 5.4_

- [~] 12. Final checkpoint — ensure all tests pass
  - Run `cargo test --workspace` and confirm zero failures. Ask the user if any questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Freshness evaluation (task 2/4) must run before health scoring (existing `HealthScorer`) per Req 6.4
- `last_updated_at` on `VenueScorerInput` may need to become `Option<DateTime<Utc>>` to satisfy Req 2.5 — check all construction sites in `quote.rs` when making that change
- Property tests should use the `proptest` crate already present in the workspace (or add it if absent)
