"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TransactionConfirmationModal } from "@/components/shared/TransactionConfirmationModal";
import { TradeRouteDisplay } from "@/components/shared/TradeRouteDisplay";
import { usePairs } from "@/hooks/useApi";
import { useQuoteRefresh } from "@/hooks/useQuoteRefresh";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { QUOTE_AUTO_REFRESH_INTERVAL_MS } from "@/lib/quote-stale";
import { PathStep } from "@/types";
import { TransactionStatus } from "@/types/transaction";

const MOCK_WALLET = "GBSU...XYZ9";
const DEMO_SLIPPAGE_TOLERANCE_PCT = 0.5;

/** Basic sell-side amount check for demo (7 dp max, typical for XLM). */
function parseDemoSellAmount(raw: string): { ok: true; n: number } | { ok: false; message: string } {
  const t = raw.trim().replace(/\s+/g, "");
  if (!t) return { ok: false, message: "Enter an amount" };
  if (/[eE][+-]?\d/.test(t)) {
    return { ok: false, message: "Scientific notation is not supported" };
  }
  if (!/^\d*\.?\d+$/.test(t)) return { ok: false, message: "Invalid number" };
  const parts = t.split(".");
  if (parts.length === 2 && parts[1].length > 7) {
    return { ok: false, message: "Too many decimal places (max 7)" };
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, message: "Enter a positive amount" };
  }
  return { ok: true, n };
}

const mockRoute: PathStep[] = [
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
];

export function DemoSwap() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [txStatus, setTxStatus] = useState<TransactionStatus | "review">("review");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [txHash, setTxHash] = useState<string>();
  const [sellAmount, setSellAmount] = useState("100");

  const { addTransaction } = useTransactionHistory(MOCK_WALLET);
  const { data: pairs, loading: pairsLoading, error: pairsError } = usePairs();

  const [pairIndex, setPairIndex] = useState(0);

  const effectivePairIndex = useMemo(() => {
    if (!pairs?.length) return 0;
    return Math.min(Math.max(0, pairIndex), pairs.length - 1);
  }, [pairs, pairIndex]);

  const selectedPair = pairs?.[effectivePairIndex];

  const parseResult = useMemo(() => parseDemoSellAmount(sellAmount), [sellAmount]);

  const numericForQuote = parseResult.ok ? parseResult.n : undefined;

  const quoteBase = selectedPair?.base_asset ?? "";
  const quoteCounter = selectedPair?.counter_asset ?? "";

  const {
    data: quote,
    loading: quoteLoading,
    error: quoteError,
    refresh,
    manualRefreshCoolingDown,
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    isStale,
  } = useQuoteRefresh(quoteBase, quoteCounter, numericForQuote, "sell");

  const refreshDisabled =
    !quoteBase ||
    !quoteCounter ||
    numericForQuote === undefined ||
    quoteLoading ||
    manualRefreshCoolingDown;

  const handleSwapClick = () => {
    if (!quote && !parseResult.ok) {
      toast.error("Enter a valid amount and wait for a quote.");
      return;
    }
    setTxStatus("review");
    setErrorMessage(undefined);
    setTxHash(undefined);
    setIsModalOpen(true);
  };

  const handleConfirm = () => {
    setTxStatus("pending");

    setTimeout(() => {
      setTxStatus("submitting");

      setTimeout(() => {
        setTxStatus("processing");

        setTimeout(() => {
          const isSuccess = Math.random() > 0.2;

          if (isSuccess) {
            const mockHash = "mock_tx_" + Math.random().toString(36).substring(7);
            setTxHash(mockHash);
            setTxStatus("success");
            toast.success("Transaction Successful!", {
              description: "Demo swap completed (simulated).",
            });

            addTransaction({
              id: mockHash,
              timestamp: Date.now(),
              fromAsset: selectedPair?.base ?? "XLM",
              fromAmount: sellAmount,
              toAsset: selectedPair?.counter ?? "USDC",
              toAmount: quote?.total ?? "—",
              exchangeRate: quote?.price ?? "—",
              priceImpact: "0.1%",
              minReceived: quote?.total ?? "—",
              networkFee: "0.00001",
              routePath: quote?.path?.length ? quote.path : mockRoute,
              status: "success",
              hash: mockHash,
              walletAddress: MOCK_WALLET,
            });
          } else {
            setTxStatus("failed");
            setErrorMessage(
              "Insufficient balance or network congestion. Please try again.",
            );
            toast.error("Transaction Failed", {
              description: "Insufficient balance or network congestion.",
            });

            addTransaction({
              id: "failed_" + Date.now(),
              timestamp: Date.now(),
              fromAsset: selectedPair?.base ?? "XLM",
              fromAmount: sellAmount,
              toAsset: selectedPair?.counter ?? "USDC",
              toAmount: quote?.total ?? "—",
              exchangeRate: quote?.price ?? "—",
              priceImpact: "0.1%",
              minReceived: quote?.total ?? "—",
              networkFee: "0.00001",
              routePath: quote?.path?.length ? quote.path : mockRoute,
              status: "failed",
              errorMessage: "Insufficient balance.",
              walletAddress: MOCK_WALLET,
            });
          }
        }, 2000);
      }, 1000);
    }, 2000);
  };

  const handleCancel = () => {
    setTxStatus("review");
  };

  const routeForModal: PathStep[] =
    quote?.path?.length ? quote.path : mockRoute;

  return (
    <Card className="p-6 max-w-lg mx-auto shadow-lg mt-8 border-primary/20 bg-background/50 backdrop-blur-sm">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold mb-1">Swap Tokens</h2>
          <p className="text-sm text-muted-foreground">
            Live quotes with refresh, optional auto-refresh, and stale detection
          </p>
        </div>

        {pairsLoading && (
          <p className="text-sm text-muted-foreground">Loading pairs…</p>
        )}
        {pairsError && (
          <p className="text-sm text-destructive">
            Could not load pairs: {pairsError.message}
          </p>
        )}

        {pairs && pairs.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="pair-select">
              Pair
            </label>
            <select
              id="pair-select"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={effectivePairIndex}
              onChange={(e) => setPairIndex(Number(e.target.value))}
            >
              {pairs.map((p, i) => (
                <option key={`${p.base_asset}-${p.counter_asset}-${i}`} value={i}>
                  {p.base} / {p.counter}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="sell-amount">
            Sell amount ({selectedPair?.base ?? "—"})
          </label>
          <Input
            id="sell-amount"
            inputMode="decimal"
            value={sellAmount}
            onChange={(e) => setSellAmount(e.target.value)}
            placeholder="0.0"
            aria-invalid={!parseResult.ok}
          />
          {!parseResult.ok && sellAmount.trim() !== "" && (
            <p className="text-sm text-destructive">{parseResult.message}</p>
          )}
        </div>

        {isStale && quote && (
          <div
            className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
            role="status"
          >
            Quote may be outdated (older than server cache window). Refresh for
            the latest price.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshDisabled}
            onClick={() => refresh()}
            className="gap-2"
          >
            {quoteLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Refresh quote
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={autoRefreshEnabled}
              onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
            />
            Auto-refresh (~{Math.round(QUOTE_AUTO_REFRESH_INTERVAL_MS / 1000)}s,
            pauses when tab hidden)
          </label>
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">You receive</span>
            <span className="font-medium">
              {quoteLoading && numericForQuote !== undefined ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  …
                </span>
              ) : (
                (quote?.total ?? "—")
              )}{" "}
              {selectedPair?.counter ?? ""}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Price</span>
            <span>{quote?.price ?? "—"}</span>
          </div>
          {quoteError && numericForQuote !== undefined && (
            <p className="text-sm text-destructive">
              Quote failed: {quoteError.message}
            </p>
          )}
          <TradeRouteDisplay
            quote={quote ?? null}
            isLoading={quoteLoading && numericForQuote !== undefined}
            error={quoteError?.message}
          />
        </div>

        <Button
          className="w-full text-lg h-12"
          onClick={handleSwapClick}
          disabled={
            !selectedPair ||
            !parseResult.ok ||
            quoteLoading ||
            !quote
          }
        >
          Review Swap
        </Button>
      </div>

      <TransactionConfirmationModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        fromAsset={selectedPair?.base ?? "—"}
        fromAmount={sellAmount}
        toAsset={selectedPair?.counter ?? "—"}
        toAmount={quote?.total ?? "—"}
        exchangeRate={quote?.price ?? "—"}
        priceImpact="0.1%"
        slippageTolerancePct={DEMO_SLIPPAGE_TOLERANCE_PCT}
        networkFee="0.00001"
        routePath={routeForModal}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        status={txStatus}
        errorMessage={errorMessage}
        txHash={txHash}
      />
    </Card>
  );
}
