import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider } from "@/components/providers/settings-provider";
import type { PriceQuote } from "@/types";
import { StellarRouteApiError, stellarRouteClient } from "@/lib/api/client";
import { SwapCard } from "./SwapCard";

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>(
    "@/lib/api/client",
  );
  return {
    ...actual,
    stellarRouteClient: {
      ...actual.stellarRouteClient,
      getQuote: vi.fn(),
    },
  };
});

function buildQuote(total: string): PriceQuote {
  return {
    base_asset: { asset_type: "native" },
    quote_asset: {
      asset_type: "credit_alphanum4",
      asset_code: "USDC",
      asset_issuer: "G...",
    },
    amount: "10",
    price: "0.98",
    total,
    quote_type: "sell",
    path: [],
    price_impact: "0.1",
    timestamp: Math.floor(Date.now() / 1000),
  };
}

function renderSwapCard(ui: React.ReactElement) {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("SwapCard network resilience", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows offline state clearly and blocks submission while disconnected", async () => {
    setNavigatorOnline(false);
    renderSwapCard(<SwapCard />);

    await screen.findByText(/you're offline/i);

    fireEvent.change(screen.getByLabelText("Pay amount"), {
      target: { value: "10" },
    });

    expect(
      screen.getByText("You are offline. Reconnect to refresh quote."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry quote" })).toBeInTheDocument();

    const cta = screen.getByRole("button", { name: "Offline" });
    expect(cta).toBeDisabled();
  });

  it("automatically recovers quotes after reconnecting", async () => {
    vi.mocked(stellarRouteClient.getQuote).mockResolvedValue(buildQuote("9.8000"));

    setNavigatorOnline(false);
    renderSwapCard(<SwapCard />);

    await screen.findByLabelText("Pay amount");
    fireEvent.change(screen.getByLabelText("Pay amount"), {
      target: { value: "10" },
    });

    expect(
      screen.getByText("You are offline. Reconnect to refresh quote."),
    ).toBeInTheDocument();

    act(() => {
      setNavigatorOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(
      () => {
        expect(
          screen.queryByText("You are offline. Reconnect to refresh quote."),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText("Receive amount")).toHaveValue("9.8000");
        expect(screen.getByRole("button", { name: "Review Swap" })).toBeEnabled();
      },
      { timeout: 2000 },
    );
  });

  it("shows a friendly 429 message and retry-after countdown", async () => {
    vi.mocked(stellarRouteClient.getQuote).mockRejectedValue(
      new StellarRouteApiError(
        429,
        "rate_limit_exceeded",
        "Too many requests",
        undefined,
        5_000,
      ),
    );

    renderSwapCard(
      <SwapCard
        quoteOptions={{
          debounceMs: 0,
          maxAutoRetries: 0,
        }}
      />,
    );

    await screen.findByLabelText("Pay amount");
    fireEvent.change(screen.getByLabelText("Pay amount"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText(/temporarily rate-limited/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /retry in 5s/i }),
      ).toBeDisabled();
    });
  });
});
