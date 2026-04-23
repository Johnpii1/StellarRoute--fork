# Implementation Plan: Mobile Swap Experience

## Overview

Surgical Tailwind/CSS layout adjustments, DOM attribute additions, touch-target sizing, and visual regression test coverage across the existing swap component tree. No new components, routes, or backend changes.

## Tasks

- [x] 1. Fix AppShell and Header layout at minimum viewport
  - [x] 1.1 Update AppShell container padding to `px-3 sm:px-6 lg:px-8`
    - Replace the existing `px-4` base padding with `px-3` so the 12px minimum is met at 320px
    - _Requirements: 1.4_
  - [ ]* 1.2 Write property test for AppShell minimum padding (Property 3)
    - **Property 3: AppShell minimum horizontal padding at xs**
    - **Validates: Requirements 1.4**
  - [x] 1.3 Update hamburger button in Header to `h-11 w-11` with `flex items-center justify-center`
    - Replace `h-8 w-8` so the touch target meets 44×44px
    - _Requirements: 2.5_
  - [ ]* 1.4 Write property test for hamburger touch target (Property 5, partial)
    - **Property 5: Interactive elements meet 44×44 touch target minimum**
    - **Validates: Requirements 2.5**

- [x] 2. Update PairSelector for vertical stack and input attributes
  - [x] 2.1 Add `max-[359px]:flex-col` to the inner flex row and `overflow-x-hidden` to the outer container
    - Ensures Amount_Input and Token_Selector_Button stack vertically below 360px
    - _Requirements: 1.1, 1.2_
  - [ ]* 2.2 Write property test for PairSelector vertical stack (Property 2)
    - **Property 2: PairSelector vertical stack below 360px**
    - **Validates: Requirements 1.2**
  - [x] 2.3 Add `inputMode="decimal"`, `autoComplete="off"`, `autoCorrect="off"` to the pay-side Amount_Input
    - _Requirements: 4.1, 4.2_
  - [x] 2.4 Add `aria-readonly="true"` to the receive-side Amount_Input (already `readOnly`)
    - _Requirements: 4.4_
  - [ ]* 2.5 Write property test for Amount_Input attributes (Property 7)
    - **Property 7: Amount_Input carries required mobile attributes**
    - **Validates: Requirements 4.1, 4.2, 4.4**
  - [x] 2.6 Verify placeholder "0.00" is present and SwapCTA shows "Enter amount" (disabled) when pay amount is empty
    - _Requirements: 4.5_
  - [ ]* 2.7 Write property test for empty amount state (Property 8)
    - **Property 8: Empty amount state drives CTA label and placeholder**
    - **Validates: Requirements 4.5**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update QuoteSummary for readable layout at 320px
  - [x] 4.1 Add `truncate max-w-[60%]` to value `<span>` elements and `min-w-0 truncate` to the price impact span
    - Prevents wrapping and clipping at Breakpoint_xs while keeping `justify-between` rows
    - _Requirements: 3.1, 3.5_
  - [ ]* 4.2 Write unit tests for QuoteSummary rendering all three rows at narrow widths
    - Test that rate, fee, and price impact rows all render with any prop values
    - _Requirements: 1.3, 3.1, 3.5_

- [x] 5. Update RouteDisplay for vertical layout and touch target
  - [x] 5.1 Change the route path row to `flex-col sm:flex-row` with downward arrows between hops at narrow widths
    - Replaces horizontal scrolling row with a vertical stacked list below `sm`
    - _Requirements: 1.5, 3.2_
  - [ ]* 5.2 Write property test for route path vertical layout (Property 4)
    - **Property 4: Route path uses vertical layout on narrow viewports**
    - **Validates: Requirements 1.5, 3.2**
  - [x] 5.3 Ensure the "Show route details" toggle is a `<button>` with `min-h-[44px] min-w-[44px]`
    - _Requirements: 2.4_
  - [x] 5.4 Add `overflow-x-hidden` to the Alternative Routes container and `flex-wrap` to its inner row
    - _Requirements: 3.3_
  - [ ]* 5.5 Write property test for RouteDisplay toggle touch target (Property 5, partial)
    - **Property 5: Interactive elements meet 44×44 touch target minimum**
    - **Validates: Requirements 2.4**

- [x] 6. Update SlippageControl for mobile usability
  - [x] 6.1 Change the trigger button from `h-8 w-8` to `h-11 w-11`
    - Meets the 44×44px touch target requirement
    - _Requirements: 2.3_
  - [x] 6.2 Add `className="w-[calc(100vw-24px)] max-w-[240px]"` to `DropdownMenuContent` and ensure `avoidCollisions` is set
    - Prevents the dropdown panel from overflowing the viewport horizontally
    - _Requirements: 5.1_
  - [x] 6.3 Add `min-h-[44px]` to each preset button (0.1%, 0.5%, 1.0%) inside the dropdown
    - _Requirements: 5.2_
  - [ ]* 6.4 Write property test for slippage preset selection (Property 9)
    - **Property 9: Slippage preset selection closes dropdown and updates value**
    - **Validates: Requirements 5.3**
  - [ ]* 6.5 Write property test for SlippageControl touch targets (Property 5, partial)
    - **Property 5: Interactive elements meet 44×44 touch target minimum**
    - **Validates: Requirements 2.3, 5.2**

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update TransactionConfirmationModal for mobile layout
  - [x] 8.1 Add `w-[90vw] sm:w-auto` to `DialogContent` so the modal occupies ≥ 90% viewport width on mobile
    - _Requirements: 6.1_
  - [ ]* 8.2 Write property test for modal width on mobile (Property 10)
    - **Property 10: Confirmation_Modal occupies ≥ 90% viewport width on mobile**
    - **Validates: Requirements 6.1**
  - [x] 8.3 Wrap the inner content `div` with `overflow-y-auto max-h-[70vh]` for scrollable content
    - _Requirements: 6.2_
  - [x] 8.4 Add `min-h-[48px]` to the Confirm Swap and Cancel buttons (both already have `w-full`)
    - _Requirements: 2.6, 6.4_
  - [ ]* 8.5 Write property test for Confirmation_Modal action button sizing (Property 6, partial)
    - **Property 6: Primary action buttons meet 48px height minimum**
    - **Validates: Requirements 2.6**
  - [x] 8.6 Add `break-words` to token symbol spans in the route path display; verify `flex-wrap` is present on the route path `div`
    - _Requirements: 3.4_
  - [x] 8.7 Wrap the "View on Stellar Expert" link in a container with `min-h-[44px] flex items-center`
    - _Requirements: 6.5_
  - [ ]* 8.8 Write unit tests for Confirmation_Modal button classes and modal width class in review/success/failed states
    - _Requirements: 2.6, 6.1, 6.4_

- [x] 9. Verify SwapCTA meets 48px minimum height
  - [x] 9.1 Confirm `h-14` (56px) and `w-full` are present on SwapCTA; no change needed if already correct
    - _Requirements: 2.2_
  - [ ]* 9.2 Write property test for SwapCTA height (Property 6, partial)
    - **Property 6: Primary action buttons meet 48px height minimum**
    - **Validates: Requirements 2.2**

- [x] 10. Add visual regression tests (Playwright)
  - [x] 10.1 Create `frontend/e2e/mobile-layout.spec.ts` with SwapCard snapshots at 320px, 375px, 390px
    - _Requirements: 7.1_
  - [x] 10.2 Add Confirmation_Modal (review state) snapshots at 320px and 375px
    - _Requirements: 7.2_
  - [x] 10.3 Add RouteDisplay (multi-hop path) snapshots at 320px and 375px
    - _Requirements: 7.3_
  - [x] 10.4 Add no-horizontal-scroll assertion for the swap page at 320px (Property 1)
    - **Property 1: No horizontal overflow at minimum viewport**
    - **Validates: Requirements 1.1, 7.5**
  - [x] 10.5 Configure CI to fail on screenshot diff exceeding the defined pixel threshold
    - _Requirements: 7.4_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Properties 1, 2, 10 are validated via Playwright visual regression; all others via fast-check + Vitest
- Install fast-check before running property tests: `npm install --save-dev fast-check`
