# Design Document: Mobile Swap Experience

## Overview

This feature makes the full token swap flow — pair selection, amount input, quote display, route visualization, slippage settings, and transaction confirmation — fully usable on screens as narrow as 320px. The work is purely front-end: CSS/Tailwind layout adjustments, DOM attribute additions, touch-target sizing, and visual regression test coverage. No API changes, no new data models, and no new routes are required.

The existing component tree is already well-structured. The changes are surgical: each component receives targeted Tailwind class additions and attribute props to satisfy the requirements. A new visual regression test suite is added alongside the existing Vitest unit tests.

---

## Architecture

The feature touches the following layers:

```
frontend/
  components/
    layout/
      app-shell.tsx        ← padding fix at xs
      header.tsx           ← hamburger touch target
    swap/
      PairSelector.tsx     ← vertical stack < 360px, input attributes
      QuoteSummary.tsx     ← justify-between, ellipsis, no-clip
      RouteDisplay.tsx     ← vertical route path < sm, touch target on toggle
      SlippageControl.tsx  ← dropdown positioning, preset touch targets
      SwapCTA.tsx          ← min-height 48px
    shared/
      TransactionConfirmationModal.tsx  ← mobile width, scroll, button sizing
  __tests__/
    mobile/                ← new visual regression tests (Playwright or vitest-browser)
```

No new components are introduced. No routing changes. No backend changes.

### Responsive Strategy

The project uses Tailwind CSS v4. The relevant breakpoints are:

| Name | Width | Tailwind prefix |
|------|-------|-----------------|
| xs (custom) | 320px | none (base styles) |
| sm | 640px | `sm:` |
| md | 768px | `md:` |

Base (unprefixed) styles apply at all widths including 320px. `sm:` overrides apply at ≥ 640px. For the 320–359px vertical-stack requirement, a custom `max-w-[359px]` container query or a `max-[359px]:` variant is used.

---

## Components and Interfaces

### AppShell

Current: `px-4` (16px) at all widths.  
Change: Add `px-3` (12px) as the base, keeping `sm:px-6 lg:px-8` for larger screens. This ensures the 12px minimum at 320px.

```tsx
// before
"container mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
// after
"container mx-auto w-full max-w-7xl px-3 py-8 sm:px-6 lg:px-8"
```

### Header (hamburger button)

Current: `h-8 w-8` (32px) — below the 44px minimum.  
Change: `h-11 w-11` (44px) with `flex items-center justify-center` to keep the icon centered.

### PairSelector

Two changes:

1. **Vertical stack below 360px**: The inner `flex items-center justify-between gap-4` row becomes `flex flex-col gap-2 max-[359px]:flex-col sm:flex-row` — but since the default is already a row, we use `max-[359px]:flex-col` to override only at the narrowest widths.

2. **Amount_Input attributes**: Add `inputMode="decimal"`, `autoComplete="off"`, `autoCorrect="off"` to the pay input. Add `aria-readonly="true"` to the receive input (which is already `readOnly`).

3. **Overflow guard**: The outer container gets `overflow-x-hidden` to prevent any child from causing horizontal scroll.

### QuoteSummary

Current rows already use `flex justify-between` — this is correct. The value `<span>` needs `truncate` and `max-w-[60%]` to prevent wrapping or overflow at 320px. The price impact span specifically needs `min-w-0 truncate` to avoid clipping.

### RouteDisplay

Three changes:

1. **Vertical route path below sm**: The `flex items-center justify-between` route row becomes a vertical flex column at narrow widths using `flex-col sm:flex-row`. Each token/pool node becomes a full-width row with a downward arrow between hops instead of a rightward arrow.

2. **"Show route details" toggle**: Add a dedicated toggle button (currently the header row is not a button) with `min-h-[44px] min-w-[44px]` touch target.

3. **Alternative Routes overflow**: The alternative routes container gets `overflow-x-hidden` and the inner row uses `flex-wrap` to prevent horizontal overflow.

### SlippageControl

Two changes:

1. **Dropdown positioning**: Change `align="end"` to stay `align="end"` (already correct) but add `side="bottom"` and `avoidCollisions` (Radix default). Add `className="w-[calc(100vw-24px)] max-w-[240px]"` to the `DropdownMenuContent` so it never exceeds the viewport width on mobile.

2. **Preset button touch targets**: The preset buttons inside the dropdown get `min-h-[44px]` added to their className.

3. **Trigger button**: The settings icon button is currently `h-8 w-8`. Change to `h-11 w-11` to meet the 44px minimum.

### SwapCTA

Current: `h-14` (56px) — already meets the 48px minimum. No change needed for height. The `w-full` is already present.

### TransactionConfirmationModal

Four changes:

1. **Width on mobile**: The `DialogContent` currently has `sm:max-w-[425px]`. Add `w-[90vw] sm:w-auto` so it occupies ≥ 90% viewport width on mobile.

2. **Scrollable content**: Wrap the inner content `div` with `overflow-y-auto max-h-[70vh]` so it scrolls when content exceeds viewport height.

3. **Action button sizing**: The `Confirm Swap` and `Cancel` buttons already have `w-full`. Add `min-h-[48px]` to both.

4. **Route path wrapping**: The route path `div` already has `flex-wrap` — verify it is present and add `break-words` to token symbol spans.

5. **"View on Stellar Expert" link**: Wrap in a container with `min-h-[44px] flex items-center` to meet the touch target requirement.

---

## Data Models

No new data models. No changes to existing types in `frontend/types/`. The feature is purely presentational.

The only interface change is adding optional props to `PairSelector` if the "You Receive" field needs to explicitly signal read-only state to the parent — but since `readOnly` is already hardcoded, no prop change is needed.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: No horizontal overflow at minimum viewport

*For any* rendered SwapCard at viewport widths between 320px and 639px, the component's `scrollWidth` SHALL equal its `clientWidth` (no horizontal overflow).

**Validates: Requirements 1.1, 3.3**

---

### Property 2: PairSelector vertical stack below 360px

*For any* rendered PairSelector at a viewport width less than 360px, the Amount_Input and Token_Selector_Button SHALL be stacked vertically (the button's `offsetTop` is greater than the input's `offsetTop`).

**Validates: Requirements 1.2**

---

### Property 3: AppShell minimum horizontal padding at xs

*For any* rendered AppShell at Breakpoint_xs (320px), the computed `padding-left` and `padding-right` of the main content container SHALL each be at least 12px.

**Validates: Requirements 1.4**

---

### Property 4: Route path uses vertical layout on narrow viewports

*For any* rendered RouteDisplay at a viewport width less than 640px, the route path container SHALL have a vertical flex direction (each hop rendered as a list item, not an inline sequence).

**Validates: Requirements 1.5, 3.2**

---

### Property 5: Interactive elements meet 44×44 touch target minimum

*For any* interactive element in the swap flow (Token_Selector_Button, Slippage_Control trigger, Route_Display toggle, Mobile_Nav hamburger, Confirmation_Modal "View on Stellar Expert" link, Slippage preset buttons), its rendered bounding box SHALL be at least 44px in both width and height.

**Validates: Requirements 2.1, 2.3, 2.4, 2.5, 5.2, 6.5**

---

### Property 6: Primary action buttons meet 48px height minimum

*For any* rendered primary action button (SwapCTA, Confirmation_Modal Confirm Swap button, Confirmation_Modal Cancel button), its rendered height SHALL be at least 48px and its width SHALL equal its container width.

**Validates: Requirements 2.2, 2.6**

---

### Property 7: Amount_Input carries required mobile attributes

*For any* rendered pay-side Amount_Input, the underlying `<input>` element SHALL have `inputMode="decimal"`, `autoComplete="off"`, and `autoCorrect="off"`. *For any* rendered receive-side Amount_Input, the `<input>` element SHALL have `aria-readonly="true"` and `readOnly`.

**Validates: Requirements 4.1, 4.2, 4.4**

---

### Property 8: Empty amount state drives CTA label and placeholder

*For any* SwapCard where the pay amount is empty or zero, the Amount_Input SHALL display the placeholder "0.00" and the SwapCTA SHALL render with the label "Enter amount" in a disabled state.

**Validates: Requirements 4.5**

---

### Property 9: Slippage preset selection closes dropdown and updates value

*For any* SlippageControl and any preset value (0.1, 0.5, 1.0), clicking the preset button SHALL close the dropdown and update the displayed slippage value to the selected preset without requiring an additional interaction.

**Validates: Requirements 5.3**

---

### Property 10: Confirmation_Modal occupies ≥ 90% viewport width on mobile

*For any* open Confirmation_Modal at a viewport width less than 640px, the modal dialog element's rendered width SHALL be at least 90% of the viewport width.

**Validates: Requirements 6.1**

---

## Error Handling

This feature is layout-only. There are no new error states or async operations introduced. The existing error handling in `TransactionConfirmationModal` (the `failed` state) is unchanged in logic; only its button sizing is adjusted.

Edge cases to handle defensively:

- **Very long token symbols**: Token symbols that are unusually long (e.g., custom issued assets) could overflow the PairSelector or route path. The `truncate` class on value spans handles this.
- **Zero/empty receiveAmount in RouteDisplay**: The component already guards `parseFloat(amountOut)` — no change needed.
- **Dropdown collision on very narrow screens**: Radix `DropdownMenuContent` with `avoidCollisions` handles viewport edge cases automatically. The `w-[calc(100vw-24px)]` cap ensures it never exceeds the screen.

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are used. They are complementary:

- **Unit tests** verify specific examples, edge cases, and DOM attribute presence.
- **Property-based tests** verify universal layout invariants across a range of viewport widths and component states.

### Property-Based Testing

The project uses **Vitest** with **jsdom**. For property-based testing, we use **fast-check** (the standard PBT library for TypeScript/JavaScript).

Install:
```bash
npm install --save-dev fast-check
```

Each property test runs a minimum of **100 iterations**. Each test is tagged with a comment referencing the design property.

**Tag format**: `// Feature: mobile-swap-experience, Property {N}: {property_text}`

#### Property Test Outline

```typescript
// Feature: mobile-swap-experience, Property 7: Amount_Input carries required mobile attributes
it("pay Amount_Input has inputMode=decimal, autoComplete=off, autoCorrect=off", () => {
  fc.assert(
    fc.property(fc.string(), (payAmount) => {
      const { container } = render(<PairSelector payAmount={payAmount} ... />);
      const input = container.querySelector('input[placeholder="0.00"]:not([readonly])');
      expect(input?.getAttribute("inputmode")).toBe("decimal");
      expect(input?.getAttribute("autocomplete")).toBe("off");
      expect(input?.getAttribute("autocorrect")).toBe("off");
    }),
    { numRuns: 100 }
  );
});
```

Properties 1, 2, 3, 4, 10 involve viewport/layout dimensions. In jsdom, `offsetWidth`/`scrollWidth` are always 0. These properties are validated via:
- **CSS class assertions** (checking that the correct Tailwind classes are applied)
- **Visual regression tests** (Playwright, see below) for actual pixel-level layout

#### Property Tests by Property Number

| Property | Test approach | Library |
|----------|--------------|---------|
| 1 — No horizontal overflow | Visual regression (Playwright) | Playwright |
| 2 — PairSelector vertical stack | CSS class assertion + visual regression | fast-check + Playwright |
| 3 — AppShell padding | CSS class assertion | fast-check |
| 4 — Route path vertical layout | CSS class assertion | fast-check |
| 5 — 44×44 touch targets | DOM dimension check via class assertion | fast-check |
| 6 — 48px button height | DOM class assertion | fast-check |
| 7 — Amount_Input attributes | DOM attribute check | fast-check |
| 8 — Empty amount state | State-driven render check | fast-check |
| 9 — Slippage preset closes dropdown | User event simulation | fast-check |
| 10 — Modal ≥ 90% width | CSS class assertion + visual regression | fast-check + Playwright |

### Visual Regression Tests

Visual regression tests use **Playwright** with its built-in `toHaveScreenshot()` API. These are separate from the Vitest suite and run in CI.

Test file: `frontend/e2e/mobile-layout.spec.ts`

Viewports covered per requirements:

| Component | Viewports |
|-----------|-----------|
| SwapCard | 320px, 375px, 390px |
| Confirmation_Modal (review state) | 320px, 375px |
| RouteDisplay (multi-hop) | 320px, 375px |
| Full swap page (no horizontal scroll check) | 320px |

```typescript
// Feature: mobile-swap-experience, Property 1: No horizontal overflow at minimum viewport
test("swap page has no horizontal scroll at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/");
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const clientWidth = await page.evaluate(() => document.body.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
```

### Unit Tests

Unit tests (Vitest + Testing Library) cover:

- DOM attribute presence on Amount_Input (inputMode, autoComplete, autoCorrect, aria-readonly)
- SwapCTA label "Enter amount" when amount is empty
- SlippageControl: clicking a preset updates the value and closes the dropdown
- TransactionConfirmationModal: action buttons have `w-full` and `min-h-[48px]` classes in review/success/failed states
- QuoteSummary: all three rows render at any prop values

Unit tests avoid duplicating what property tests already cover broadly.
