import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { TransactionConfirmationModal } from "@/components/shared/TransactionConfirmationModal";

describe("TransactionConfirmationModal", () => {
  it("renders critical review copy and computed minimum received", () => {
    const onOpenChange = vi.fn();

    render(
      <TransactionConfirmationModal
        isOpen
        onOpenChange={onOpenChange}
        fromAsset="XLM"
        fromAmount="10"
        toAsset="USDC"
        toAmount="100"
        exchangeRate="10"
        priceImpact="0.1%"
        slippageTolerancePct={1}
        networkFee="0.00001"
        routePath={[
          {
            from_asset: { asset_type: "native" },
            to_asset: {
              asset_type: "credit_alphanum4",
              asset_code: "USDC",
              asset_issuer: "GA5Z...",
            },
            price: "0.105",
            source: "sdex",
          },
        ]}
        onConfirm={() => {}}
        status="review"
      />,
    );

    expect(
      screen.getByText("Review your transaction details before signing."),
    ).toBeTruthy();

    // 100 with 1% slippage => 99 min received
    expect(screen.getByText(/99 USDC/)).toBeTruthy();

    expect(
      screen.getByText(
        "Demo mode: signing and submission are simulated — not yet on-chain.",
      ),
    ).toBeTruthy();
  });
});

