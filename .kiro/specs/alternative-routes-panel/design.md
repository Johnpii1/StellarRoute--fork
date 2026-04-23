# Design Document: Alternative Routes Panel

## Overview

The Alternative Routes Panel replaces the hardcoded single-alternative display in `RouteDisplay.tsx` with a fully interactive, sortable list of candidate swap routes. Users can compare output amount, fees, and price impact across routes and select the one they want before confirming a swap.

The current API returns a single `PriceQuote` with one `path: PathStep[]`. Because the backend does not yet expose multiple alternative routes in a single response, the frontend will introduce an `AlternativeRoute` abstraction that can be populated from either a real multi-route API extension or from mock/derived data during development. The design is forward-compatible: when the API is extended, only the data-mapping layer changes.

---

## Architecture

```mermaid
graph TD
    A[SwapCard] -->|routes, selectedId, onSelect, sortCriterion, onSort| B[AlternativeRoutesPanel]
    A -->|selectedRoute metrics| C[QuoteSummary]
    A -->|useQuoteRefresh| D[useRoutes hook]
    D -->|PriceQuote or MultiRouteQuote| E[StellarRouteClient]
    D -->|derives AlternativeRoute[]| F[routeUtils]
    F -->|sortRoutes| B
    B --> G[RouteRow × N]
    B --> H[SortControls]
    B --> I[EmptyState / ErrorState / LoadingSkeleton]
```

Key design decisions:

1. **`AlternativeRoute` as the canonical frontend type** — decouples the panel from the exact API shape. Mapping from `PriceQuote` (or future `MultiRouteQuote`) happens once in `routeUtils.ts`.
2. **Sort is pure client-side** — no new API call on sort change; `sortRoutes()` is a pure function over `AlternativeRoute[]`.
3. **Selection state lives in `SwapCard`** — keeps `QuoteSummary` and `AlternativeRoutesPanel` in sync through props, avoiding prop-drilling through multiple layers.
4. **`RouteDisplay.tsx` is replaced** — the new `AlternativeRoutesPanel` supersedes it entirely. `SwapCard` imports `AlternativeRoutesPanel` instead.

---

## Components and Interfaces

### New: `AlternativeRoutesPanel`

**Path:** `frontend/components/swap/AlternativeRoutesPanel.tsx`

```typescript
interface AlternativeRoutesPanelProps {
  routes: AlternativeRoute[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  sortCriterion: SortCriterion;
  onSortChange: (criterion: SortCriterion) => void;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}
```

Renders:
- `SortControls` — three toggle buttons (Best Output / Lowest Impact / Fewest Hops)
- `RouteRow × N` — one per sorted route
- `LoadingSkeleton` — when `loading === true`
- `EmptyState` — when `routes.length === 0` and not loading
- `ErrorState` — when `error !== null`

### New: `RouteRow`

**Path:** `frontend/components/swap/RouteRow.tsx`

```typescript
interface RouteRowProps {
  route: AlternativeRoute;
  isSelected: boolean;
  isBest: boolean;
  onClick: () => void;
}
```

Displays: route path (asset hops + pool labels), hop count, output amount, fees, price impact badge. Applies warning/danger colour to price impact based on thresholds.

### New: `SortControls`

**Path:** `frontend/components/swap/SortControls.tsx`

```typescript
interface SortControlsProps {
  active: SortCriterion;
  onChange: (criterion: SortCriterion) => void;
}
```

Three `<button>` elements with `aria-pressed` reflecting the active criterion.

### Updated: `SwapCard`

Adds state:
```typescript
const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
const [sortCriterion, setSortCriterion] = useState<SortCriterion>('best_output');
```

Derives `routes: AlternativeRoute[]` from the quote via `quoteToRoutes()`. Passes sorted routes and selection state down to `AlternativeRoutesPanel` and the selected route's metrics to `QuoteSummary`.

### Updated: `QuoteSummary`

No structural change needed — it already accepts `rate`, `fee`, `priceImpact` as strings. `SwapCard` will derive these from the `selectedRoute`.

---

## Data Models

### `AlternativeRoute`

**Path:** `frontend/types/route.ts` (extend existing file)

```typescript
export type SortCriterion = 'best_output' | 'lowest_impact' | 'fewest_hops';

export interface AlternativeRoute {
  /** Stable identifier — derived from path hash or API-provided id */
  id: string;
  /** Ordered list of asset codes representing the swap path, e.g. ["XLM", "AQUA", "USDC"] */
  assetPath: string[];
  /** Pool/source label per hop, e.g. ["AQUA Pool", "SDEX"] */
  hopSources: string[];
  /** Number of exchange steps */
  hopCount: number;
  metrics: RouteMetrics;
}
```

`RouteMetrics` already exists in `route.ts` and provides `totalFees`, `totalPriceImpact`, `netOutput`, `averageRate`.

### Extended API type (forward-compatible)

**Path:** `frontend/types/index.ts`

```typescript
/** Future multi-route API response. Currently unused by the real API. */
export interface MultiRouteQuote {
  base_asset: Asset;
  quote_asset: Asset;
  amount: string;
  quote_type: QuoteType;
  routes: RouteCandidate[];
  timestamp: number;
}

export interface RouteCandidate {
  id: string;
  path: PathStep[];
  total: string;
  price: string;
  metrics: RouteMetrics;
}
```

### Mapping utility

**Path:** `frontend/lib/routeUtils.ts`

```typescript
/** Derive a stable id from a route's path steps */
export function routeId(steps: PathStep[]): string

/** Convert a single PriceQuote into a one-element AlternativeRoute array */
export function quoteToRoutes(quote: PriceQuote): AlternativeRoute[]

/** Convert a MultiRouteQuote into an AlternativeRoute array */
export function multiQuoteToRoutes(quote: MultiRouteQuote): AlternativeRoute[]

/** Sort routes by the given criterion (pure, returns new array) */
export function sortRoutes(
  routes: AlternativeRoute[],
  criterion: SortCriterion,
): AlternativeRoute[]

/** Resolve selected route after a quote refresh */
export function resolveSelectedRoute(
  routes: AlternativeRoute[],
  previousId: string | null,
): string | null
```

---

## Sorting Logic

`sortRoutes` is a pure function — it never mutates the input array.

| Criterion | Comparator |
|---|---|
| `best_output` | Descending `parseFloat(metrics.netOutput)` |
| `lowest_impact` | Ascending `parseFloat(metrics.totalPriceImpact)` |
| `fewest_hops` | Ascending `hopCount`, tie-break by descending `netOutput` |

The Best Route badge is always applied to the route with the highest `netOutput` regardless of the active sort criterion.

---

## State Management

All state lives in `SwapCard` (React local state + existing Context). No new context or global store is introduced.

```
SwapCard state:
  sortCriterion: SortCriterion          — active sort, default 'best_output'
  selectedRouteId: string | null        — id of selected route

Derived (useMemo):
  sortedRoutes = sortRoutes(routes, sortCriterion)

Effect:
  When quote refreshes → resolveSelectedRoute(newRoutes, selectedRouteId)
  → update selectedRouteId if needed
```

`QuoteSummary` receives the metrics of `sortedRoutes.find(r => r.id === selectedRouteId)` (or the first route as fallback).

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Route row count matches input

*For any* list of `AlternativeRoute` objects passed to `AlternativeRoutesPanel`, the number of rendered `RouteRow` elements should equal the length of the input list.

**Validates: Requirements 1.1, 1.2**

---

### Property 2: Best route badge on highest-netOutput route

*For any* non-empty list of routes, the route with the highest `netOutput` should be the one rendered with the "Best" badge, regardless of the active sort criterion.

**Validates: Requirements 1.3**

---

### Property 3: Hop count accuracy

*For any* `AlternativeRoute`, the hop count displayed in its `RouteRow` should equal `route.hopCount`, which in turn equals `route.assetPath.length - 1`.

**Validates: Requirements 1.4**

---

### Property 4: Sort by Best Output produces descending netOutput order

*For any* list of routes sorted by `best_output`, each route's `parseFloat(metrics.netOutput)` should be greater than or equal to the next route's value.

**Validates: Requirements 2.3**

---

### Property 5: Sort by Lowest Impact produces ascending totalPriceImpact order

*For any* list of routes sorted by `lowest_impact`, each route's `parseFloat(metrics.totalPriceImpact)` should be less than or equal to the next route's value.

**Validates: Requirements 2.4**

---

### Property 6: Sort by Fewest Hops produces ascending hop count order

*For any* list of routes sorted by `fewest_hops`, each route's `hopCount` should be less than or equal to the next route's `hopCount`.

**Validates: Requirements 2.5**

---

### Property 7: Active sort criterion is visually indicated

*For any* `SortCriterion` value passed as `active` to `SortControls`, the corresponding button should have `aria-pressed="true"` and the other two buttons should have `aria-pressed="false"`.

**Validates: Requirements 2.6**

---

### Property 8: Clicking a route selects it

*For any* route in the rendered list, simulating a click on its `RouteRow` should result in `onSelectRoute` being called with that route's `id`.

**Validates: Requirements 3.1**

---

### Property 9: Selected route drives swap preview metrics

*For any* selected route, the `rate`, `fee`, and `priceImpact` values passed to `QuoteSummary` should be derived from that route's `metrics` fields (`averageRate`, `totalFees`, `totalPriceImpact`).

**Validates: Requirements 3.2**

---

### Property 10: Selection preserved when route still present in new quote

*For any* new route list that contains a route with the same `id` as the previously selected route, `resolveSelectedRoute` should return that same `id`.

**Validates: Requirements 3.4**

---

### Property 11: Selection falls back to best route when prior selection absent

*For any* new route list that does NOT contain a route with the previously selected `id`, `resolveSelectedRoute` should return the `id` of the route with the highest `netOutput`.

**Validates: Requirements 3.5**

---

### Property 12: Error state preserves prior route list

*For any* prior non-empty route list, when a subsequent API error occurs, the routes displayed should remain unchanged until the user retries or changes inputs.

**Validates: Requirements 4.5**

---

### Property 13: Metrics accuracy — displayed values match API fields

*For any* `AlternativeRoute` derived from a `PriceQuote` or `RouteCandidate`, the displayed output amount, fees, and price impact should equal `metrics.netOutput`, `metrics.totalFees`, and `metrics.totalPriceImpact` respectively, with no client-side arithmetic modification.

**Validates: Requirements 5.1, 5.2, 5.3**

---

### Property 14: Price impact colour coding at thresholds

*For any* route where `parseFloat(metrics.totalPriceImpact) > 5`, the price impact element should carry the danger CSS class and a high-impact warning label. *For any* route where `parseFloat(metrics.totalPriceImpact) > 1` and `<= 5`, the element should carry the warning CSS class. *For any* route where `parseFloat(metrics.totalPriceImpact) <= 1`, neither warning nor danger class should be applied.

**Validates: Requirements 5.4, 5.5**

---

### Property 15: Route output consistency

*For any* `AlternativeRoute` whose `hopSources` map to individual hop output amounts, the sum of per-hop output amounts should equal `parseFloat(metrics.netOutput)` within floating-point tolerance.

**Validates: Requirements 5.6**

---

### Property 16: Route row ARIA labels contain required fields

*For any* `AlternativeRoute`, the `aria-label` on its `RouteRow` should contain the route path (asset codes joined), the output amount, the fees, and the price impact.

**Validates: Requirements 6.2**

---

### Property 17: Sort control ARIA labels describe criterion and active state

*For any* `SortCriterion`, the corresponding sort button's `aria-label` should include a human-readable description of the criterion and reflect whether it is currently active via `aria-pressed`.

**Validates: Requirements 6.3**

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| API returns 0 routes | Render `EmptyState` with "No routes available for this pair and amount." |
| API request fails (network / 4xx / 5xx) | Render `ErrorState` with error message + Retry button; preserve last known routes |
| `loading === true` | Render `LoadingSkeleton` (3 placeholder rows) |
| Amount input empty / invalid | Render idle prompt: "Enter an amount to see available routes." |
| `totalPriceImpact > 1%` | Warning colour on price impact value |
| `totalPriceImpact > 5%` | Danger colour + "High Impact" badge |
| Selected route disappears on refresh | Auto-fall back to best route via `resolveSelectedRoute` |

All error boundaries are handled at the `SwapCard` level — `AlternativeRoutesPanel` receives `error` as a prop and renders the appropriate state without throwing.

---

## Testing Strategy

### Unit Tests

Focus on specific examples, edge cases, and integration points:

- `routeUtils.ts`: `quoteToRoutes` with a real `PriceQuote` fixture, `sortRoutes` with a known list, `resolveSelectedRoute` for both the "present" and "absent" cases.
- `AlternativeRoutesPanel`: loading skeleton renders, empty state renders, error state renders with retry button, single-route renders without comparison list.
- `RouteRow`: price impact colour classes at 0.5%, 1.5%, and 6% values.
- `SortControls`: all three buttons present, correct `aria-pressed` state.

### Property-Based Tests

Use **fast-check** (already compatible with the Jest/Vitest setup common in Next.js projects). Each property test runs a minimum of **100 iterations**.

Tag format: `// Feature: alternative-routes-panel, Property {N}: {property_text}`

| Property | Test description |
|---|---|
| P1 | Generate random `AlternativeRoute[]`, render panel, assert row count equals array length |
| P2 | Generate random routes, assert badge is on `max(netOutput)` route |
| P3 | Generate random routes, assert displayed hop count equals `assetPath.length - 1` |
| P4 | Generate random routes, sort by `best_output`, assert descending `netOutput` |
| P5 | Generate random routes, sort by `lowest_impact`, assert ascending `totalPriceImpact` |
| P6 | Generate random routes, sort by `fewest_hops`, assert ascending `hopCount` |
| P7 | For each of 3 criteria, render `SortControls`, assert `aria-pressed` state |
| P8 | Generate random route list, click random row, assert `onSelectRoute` called with correct id |
| P9 | Generate random selected route, assert `QuoteSummary` props match route metrics |
| P10 | Generate routes + prior id present in new list, assert `resolveSelectedRoute` returns same id |
| P11 | Generate routes + prior id absent from new list, assert `resolveSelectedRoute` returns best id |
| P12 | Generate prior routes + error state, assert displayed routes unchanged |
| P13 | Generate `PriceQuote`, call `quoteToRoutes`, assert displayed fields equal source fields |
| P14 | Generate routes with random `totalPriceImpact`, assert correct CSS class applied |
| P15 | Generate routes with per-hop amounts, assert sum equals `netOutput` within tolerance |
| P16 | Generate random routes, render rows, assert `aria-label` contains path, output, fees, impact |
| P17 | For each criterion, render `SortControls`, assert `aria-label` contains criterion name and active state |

Each property-based test is the single implementation for its corresponding design property. Unit tests complement by covering concrete edge cases (empty list, single route, exact threshold values).
