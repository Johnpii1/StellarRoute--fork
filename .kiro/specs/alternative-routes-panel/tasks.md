# Implementation Plan: Alternative Routes Panel

## Overview

Implement the Alternative Routes Panel by layering types → utilities → components → integration. Each step builds on the previous, ending with `SwapCard` wired to the new panel and `RouteDisplay` retired.

## Tasks

- [ ] 1. Add new types to `frontend/types/route.ts` and `frontend/types/index.ts`
  - Add `SortCriterion` type (`'best_output' | 'lowest_impact' | 'fewest_hops'`) to `route.ts`
  - Add `AlternativeRoute` interface to `route.ts` (fields: `id`, `assetPath`, `hopSources`, `hopCount`, `metrics`)
  - Add `MultiRouteQuote` interface to `index.ts` (fields: `base_asset`, `quote_asset`, `amount`, `quote_type`, `routes`, `timestamp`)
  - Add `RouteCandidate` interface to `index.ts` (fields: `id`, `path`, `total`, `price`, `metrics`)
  - _Requirements: 1.1, 5.1, 5.2, 5.3_

- [ ] 2. Implement `frontend/lib/routeUtils.ts`
  - [ ] 2.1 Implement `routeId(steps: PathStep[]): string`
    - Derive a stable string id by joining asset codes and pool labels from the path steps
    - _Requirements: 3.4, 3.5_

  - [ ] 2.2 Implement `quoteToRoutes(quote: PriceQuote): AlternativeRoute[]`
    - Map a single `PriceQuote` to a one-element `AlternativeRoute[]`
    - Derive `assetPath`, `hopSources`, `hopCount`, and `metrics` from the quote fields
    - _Requirements: 1.1, 5.1, 5.2, 5.3_

  - [ ] 2.3 Implement `multiQuoteToRoutes(quote: MultiRouteQuote): AlternativeRoute[]`
    - Map each `RouteCandidate` in the quote to an `AlternativeRoute`
    - _Requirements: 1.1, 5.1_

  - [ ] 2.4 Implement `sortRoutes(routes: AlternativeRoute[], criterion: SortCriterion): AlternativeRoute[]`
    - `best_output`: descending `parseFloat(metrics.netOutput)`
    - `lowest_impact`: ascending `parseFloat(metrics.totalPriceImpact)`
    - `fewest_hops`: ascending `hopCount`, tie-break by descending `netOutput`
    - Must return a new array (pure function, no mutation)
    - _Requirements: 2.3, 2.4, 2.5_

  - [ ]* 2.5 Write property tests for `sortRoutes` (Properties 4, 5, 6)
    - **Property 4: Sort by Best Output produces descending netOutput order**
    - **Validates: Requirements 2.3**
    - **Property 5: Sort by Lowest Impact produces ascending totalPriceImpact order**
    - **Validates: Requirements 2.4**
    - **Property 6: Sort by Fewest Hops produces ascending hop count order**
    - **Validates: Requirements 2.5**

  - [ ] 2.6 Implement `resolveSelectedRoute(routes: AlternativeRoute[], previousId: string | null): string | null`
    - Return `previousId` if a route with that id exists in the new list
    - Otherwise return the id of the route with the highest `netOutput`
    - Return `null` if the list is empty
    - _Requirements: 3.4, 3.5_

  - [ ]* 2.7 Write property tests for `resolveSelectedRoute` (Properties 10, 11)
    - **Property 10: Selection preserved when route still present in new quote**
    - **Validates: Requirements 3.4**
    - **Property 11: Selection falls back to best route when prior selection absent**
    - **Validates: Requirements 3.5**

  - [ ]* 2.8 Write property test for `quoteToRoutes` metrics accuracy (Property 13)
    - **Property 13: Metrics accuracy — displayed values match API fields**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [ ] 3. Checkpoint — Ensure all utility tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement `frontend/components/swap/SortControls.tsx`
  - Render three `<button>` elements for `best_output`, `lowest_impact`, `fewest_hops`
  - Set `aria-pressed="true"` on the active criterion button, `"false"` on the others
  - Include `aria-label` on each button describing the criterion and its active state
  - Call `onChange` with the selected criterion on click
  - _Requirements: 2.1, 2.6, 6.1, 6.3_

  - [ ]* 4.1 Write property tests for `SortControls` (Properties 7, 17)
    - **Property 7: Active sort criterion is visually indicated via aria-pressed**
    - **Validates: Requirements 2.6**
    - **Property 17: Sort control ARIA labels describe criterion and active state**
    - **Validates: Requirements 6.3**

- [ ] 5. Implement `frontend/components/swap/RouteRow.tsx`
  - Display asset hop path (`assetPath` joined with arrows), hop count, output amount, fees, price impact
  - Apply `isBest` badge when the route has the highest `netOutput`
  - Apply warning colour class when `totalPriceImpact > 1%`
  - Apply danger colour class and "High Impact" label when `totalPriceImpact > 5%`
  - Apply selected visual state when `isSelected === true`
  - Include `aria-label` containing route path, output amount, fees, and price impact
  - Make the row keyboard-activatable (Enter/Space triggers `onClick`)
  - _Requirements: 1.1, 1.3, 1.4, 3.1, 3.3, 5.4, 5.5, 6.1, 6.2_

  - [ ]* 5.1 Write property tests for `RouteRow` (Properties 2, 3, 8, 14, 16)
    - **Property 2: Best route badge on highest-netOutput route**
    - **Validates: Requirements 1.3**
    - **Property 3: Hop count accuracy**
    - **Validates: Requirements 1.4**
    - **Property 8: Clicking a route selects it**
    - **Validates: Requirements 3.1**
    - **Property 14: Price impact colour coding at thresholds**
    - **Validates: Requirements 5.4, 5.5**
    - **Property 16: Route row ARIA labels contain required fields**
    - **Validates: Requirements 6.2**

- [ ] 6. Implement `frontend/components/swap/AlternativeRoutesPanel.tsx`
  - Render `SortControls` with `sortCriterion` and `onSortChange` props
  - Render one `RouteRow` per route in the sorted list; pass `isSelected` and `isBest` flags
  - Render `LoadingSkeleton` (3 placeholder rows) when `loading === true`
  - Render empty-state message when `routes.length === 0` and not loading and no error
  - Render error message with Retry button when `error !== null`; preserve prior route list display
  - Render idle prompt when routes are empty and no quote has been requested
  - _Requirements: 1.1, 1.2, 1.5, 2.1, 2.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 6.1 Write property test for row count (Property 1)
    - **Property 1: Route row count matches input**
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 6.2 Write property test for error state preserving prior routes (Property 12)
    - **Property 12: Error state preserves prior route list**
    - **Validates: Requirements 4.5**

  - [ ]* 6.3 Write unit tests for `AlternativeRoutesPanel` states
    - Test loading skeleton renders 3 placeholder rows
    - Test empty state renders the no-routes message
    - Test error state renders error message and Retry button
    - Test single-route renders without comparison list
    - _Requirements: 1.2, 1.5, 4.1, 4.2, 4.3_

- [ ] 7. Checkpoint — Ensure all component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Update `frontend/components/swap/SwapCard.tsx`
  - Add `selectedRouteId: string | null` state (default `null`)
  - Add `sortCriterion: SortCriterion` state (default `'best_output'`)
  - Derive `routes: AlternativeRoute[]` from the current quote via `quoteToRoutes()`
  - Derive `sortedRoutes` via `useMemo(() => sortRoutes(routes, sortCriterion), [routes, sortCriterion])`
  - Add effect: when quote refreshes, call `resolveSelectedRoute(newRoutes, selectedRouteId)` and update `selectedRouteId`
  - Replace `<RouteDisplay />` import and usage with `<AlternativeRoutesPanel />`, passing all required props
  - Derive selected route metrics from `sortedRoutes.find(r => r.id === selectedRouteId)` (fallback to first route) and pass to `QuoteSummary`
  - _Requirements: 2.2, 2.7, 3.1, 3.2, 3.4, 3.5_

  - [ ]* 8.1 Write property test for selected route driving swap preview (Property 9)
    - **Property 9: Selected route drives swap preview metrics**
    - **Validates: Requirements 3.2**

- [ ] 9. Retire `frontend/components/swap/RouteDisplay.tsx`
  - Verify no remaining imports of `RouteDisplay` exist in the codebase
  - Delete `frontend/components/swap/RouteDisplay.tsx`
  - _Requirements: 1.1_

- [ ] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use fast-check with a minimum of 100 iterations each
- Each property test references its property number from the design document for traceability
- `RouteDisplay.tsx` must not be deleted until `SwapCard` has been fully migrated (task 8 before task 9)
