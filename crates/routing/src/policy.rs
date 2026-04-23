//! Configurable routing policy controls
//!
//! Provides `RoutingPolicy` for controlling route discovery behaviour:
//! - **max_hops**: caps the depth of multi-hop paths (default: 4).
//! - **venue_allowlist**: when non-empty, only venues whose `venue_type` appears
//!   in this list are considered.
//! - **venue_denylist**: venues whose `venue_type` appears in this list are
//!   excluded (evaluated after the allowlist).
//!
//! Policies can be loaded from environment variables or constructed in code.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Configurable routing policy for controlling route discovery
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RoutingPolicy {
    /// Maximum number of hops allowed in a route (default: 4)
    pub max_hops: usize,
    /// When non-empty, only venues whose `venue_type` is listed here are considered.
    /// An empty list means "allow all venue types".
    pub venue_allowlist: Vec<String>,
    /// Venues whose `venue_type` appears here are always excluded.
    /// Evaluated *after* the allowlist.
    pub venue_denylist: Vec<String>,
}

impl Default for RoutingPolicy {
    fn default() -> Self {
        Self {
            max_hops: 4,
            venue_allowlist: Vec::new(),
            venue_denylist: Vec::new(),
        }
    }
}

impl RoutingPolicy {
    /// Create a new routing policy with the given max hops and empty allow/deny lists.
    pub fn new(max_hops: usize) -> Self {
        Self {
            max_hops,
            ..Default::default()
        }
    }

    /// Builder: set max hops
    pub fn with_max_hops(mut self, max_hops: usize) -> Self {
        self.max_hops = max_hops;
        self
    }

    /// Builder: set venue allowlist
    pub fn with_venue_allowlist(mut self, allowlist: Vec<String>) -> Self {
        self.venue_allowlist = allowlist;
        self
    }

    /// Builder: set venue denylist
    pub fn with_venue_denylist(mut self, denylist: Vec<String>) -> Self {
        self.venue_denylist = denylist;
        self
    }

    /// Check whether a venue type is permitted by this policy.
    ///
    /// Returns `true` when the venue should be included:
    /// 1. If an allowlist is configured, the venue must be in it.
    /// 2. The venue must **not** be in the denylist.
    pub fn is_venue_allowed(&self, venue_type: &str) -> bool {
        // Allowlist check: if non-empty, venue must be in it
        if !self.venue_allowlist.is_empty() && !self.venue_allowlist.iter().any(|v| v == venue_type)
        {
            return false;
        }
        // Denylist check: venue must not be denied
        !self.venue_denylist.iter().any(|v| v == venue_type)
    }

    /// Load a routing policy from environment variables with sane defaults.
    ///
    /// | Variable | Description | Default |
    /// |---|---|---|
    /// | `ROUTING_MAX_HOPS` | Maximum hop depth | `4` |
    /// | `ROUTING_VENUE_ALLOWLIST` | Comma-separated venue types to allow | *(empty – allow all)* |
    /// | `ROUTING_VENUE_DENYLIST` | Comma-separated venue types to deny | *(empty – deny none)* |
    pub fn from_env() -> Self {
        let max_hops: usize = std::env::var("ROUTING_MAX_HOPS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(4);

        let venue_allowlist =
            parse_comma_list(&std::env::var("ROUTING_VENUE_ALLOWLIST").unwrap_or_default());

        let venue_denylist =
            parse_comma_list(&std::env::var("ROUTING_VENUE_DENYLIST").unwrap_or_default());

        Self {
            max_hops,
            venue_allowlist,
            venue_denylist,
        }
    }

    /// Validate the policy for logical consistency.
    ///
    /// Returns `Ok(())` when:
    /// - `max_hops` is at least 1.
    /// - No venue type appears in both the allowlist and denylist.
    pub fn validate(&self) -> std::result::Result<(), String> {
        if self.max_hops == 0 {
            return Err("max_hops must be at least 1".to_string());
        }

        if !self.venue_allowlist.is_empty() && !self.venue_denylist.is_empty() {
            let allow_set: HashSet<&str> =
                self.venue_allowlist.iter().map(|s| s.as_str()).collect();
            let deny_set: HashSet<&str> = self.venue_denylist.iter().map(|s| s.as_str()).collect();
            let overlap: Vec<&&str> = allow_set.intersection(&deny_set).collect();
            if !overlap.is_empty() {
                return Err(format!(
                    "venue types appear in both allowlist and denylist: {:?}",
                    overlap
                ));
            }
        }

        Ok(())
    }
}

/// Parse a comma-separated string into a `Vec<String>`, trimming whitespace
/// and dropping empty entries.
fn parse_comma_list(input: &str) -> Vec<String> {
    input
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_policy_allows_everything() {
        let policy = RoutingPolicy::default();
        assert_eq!(policy.max_hops, 4);
        assert!(policy.is_venue_allowed("amm"));
        assert!(policy.is_venue_allowed("sdex"));
        assert!(policy.is_venue_allowed("orderbook"));
    }

    #[test]
    fn allowlist_restricts_to_listed_types() {
        let policy = RoutingPolicy::default().with_venue_allowlist(vec!["amm".to_string()]);
        assert!(policy.is_venue_allowed("amm"));
        assert!(!policy.is_venue_allowed("sdex"));
        assert!(!policy.is_venue_allowed("orderbook"));
    }

    #[test]
    fn denylist_excludes_listed_types() {
        let policy = RoutingPolicy::default().with_venue_denylist(vec!["orderbook".to_string()]);
        assert!(policy.is_venue_allowed("amm"));
        assert!(policy.is_venue_allowed("sdex"));
        assert!(!policy.is_venue_allowed("orderbook"));
    }

    #[test]
    fn both_lists_interact_correctly() {
        let policy = RoutingPolicy::default()
            .with_venue_allowlist(vec!["amm".to_string(), "sdex".to_string()])
            .with_venue_denylist(vec!["sdex".to_string()]);
        assert!(policy.is_venue_allowed("amm"));
        assert!(!policy.is_venue_allowed("sdex")); // denied
        assert!(!policy.is_venue_allowed("orderbook")); // not in allowlist
    }

    #[test]
    fn validate_catches_zero_max_hops() {
        let policy = RoutingPolicy::new(0);
        assert!(policy.validate().is_err());
    }

    #[test]
    fn validate_catches_overlapping_lists() {
        let policy = RoutingPolicy::default()
            .with_venue_allowlist(vec!["amm".to_string(), "sdex".to_string()])
            .with_venue_denylist(vec!["amm".to_string()]);
        assert!(policy.validate().is_err());
    }

    #[test]
    fn validate_passes_for_defaults() {
        assert!(RoutingPolicy::default().validate().is_ok());
    }

    #[test]
    fn builder_methods_chain() {
        let policy = RoutingPolicy::default()
            .with_max_hops(3)
            .with_venue_allowlist(vec!["amm".to_string()])
            .with_venue_denylist(vec!["orderbook".to_string()]);
        assert_eq!(policy.max_hops, 3);
        assert_eq!(policy.venue_allowlist, vec!["amm"]);
        assert_eq!(policy.venue_denylist, vec!["orderbook"]);
    }

    #[test]
    fn parse_comma_list_basic() {
        assert_eq!(
            parse_comma_list("amm, sdex, orderbook"),
            vec!["amm", "sdex", "orderbook"]
        );
    }

    #[test]
    fn parse_comma_list_empty() {
        assert!(parse_comma_list("").is_empty());
        assert!(parse_comma_list("  ").is_empty());
    }

    #[test]
    fn from_env_uses_defaults_when_unset() {
        // Clear potential vars
        std::env::remove_var("ROUTING_MAX_HOPS");
        std::env::remove_var("ROUTING_VENUE_ALLOWLIST");
        std::env::remove_var("ROUTING_VENUE_DENYLIST");

        let policy = RoutingPolicy::from_env();
        assert_eq!(policy.max_hops, 4);
        assert!(policy.venue_allowlist.is_empty());
        assert!(policy.venue_denylist.is_empty());
    }
}
