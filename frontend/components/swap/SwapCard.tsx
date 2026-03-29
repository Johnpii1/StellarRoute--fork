'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { PairSelector } from './PairSelector';
import { QuoteSummary } from './QuoteSummary';
import { RouteDisplay } from './RouteDisplay';
import { SlippageControl } from './SlippageControl';
import { SwapCTA } from './SwapCTA';
import { SimulationPanel } from './SimulationPanel';
import { FeeBreakdownPanel } from './FeeBreakdownPanel';
import { useTradeFormStorage } from '@/hooks/useTradeFormStorage';
import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  useQuoteRefresh,
  type UseQuoteRefreshOptions,
} from '@/hooks/useQuoteRefresh';
import { StellarRouteApiError } from '@/lib/api/client';
import { STELLAR_NATIVE_MAX_DECIMALS } from '@/lib/amount-input';
import { SwapValidationSchema } from '@/lib/swap-validation';

const DEFAULT_QUOTE_ASSET =
  'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

interface SwapCardProps {
  quoteOptions?: UseQuoteRefreshOptions;
}

function formatRetryCountdown(ms: number): string {
  return `${Math.max(1, Math.ceil(ms / 1_000))}s`;
}

function getFriendlyQuoteError(
  error: Error | null,
  rateLimitRemainingMs: number,
): string | null {
  if (!error) {
    return null;
  }

  if (error instanceof StellarRouteApiError && error.isRateLimit) {
    if (rateLimitRemainingMs > 0) {
      return `Quote requests are temporarily rate-limited. Please wait about ${formatRetryCountdown(
        rateLimitRemainingMs,
      )} before trying again.`;
    }

    return 'Quote requests are temporarily rate-limited. Please try again shortly.';
  }

  if (error instanceof StellarRouteApiError && error.isServerError) {
    return 'Quote service is temporarily unavailable. Please retry in a moment.';
  }

  return error.message;
}

export function SwapCard({ quoteOptions }: SwapCardProps) {
  const {
    amount: payAmount,
    setAmount: setPayAmount,
    slippage,
    setSlippage,
    reset,
    isHydrated,
  } = useTradeFormStorage();

  const { isOnline, isOffline } = useOnlineStatus();
  const [confidenceScore, setConfidenceScore] = useState<number>(85);
  const [volatility, setVolatility] = useState<'high' | 'medium' | 'low'>('low');

  const validation = SwapValidationSchema.validate(
    {
      amount: payAmount,
      maxDecimals: STELLAR_NATIVE_MAX_DECIMALS,
      slippage,
    },
    { mode: 'submit', requirePair: false },
  );
  const isValidAmount = validation.amountResult.status === 'ok';
  const parsedPayAmount = parseFloat(payAmount);
  const quoteAmount =
    Number.isFinite(parsedPayAmount) && parsedPayAmount > 0
      ? parsedPayAmount
      : undefined;
  const quoteState = useQuoteRefresh(
    'native',
    DEFAULT_QUOTE_ASSET,
    quoteAmount,
    'sell',
    {
      ...quoteOptions,
      isOnline,
    },
  );
  const receiveAmount = isOnline ? quoteState.data?.total ?? '' : '';
  const isLoading = isOnline && (quoteState.loading || quoteState.isRecovering);
  const quoteError =
    quoteAmount && !isOnline
      ? 'You are offline. Reconnect to refresh quote.'
      : getFriendlyQuoteError(quoteState.error, quoteState.rateLimitRemainingMs);
  const retryButtonLabel =
    quoteState.rateLimitRemainingMs > 0
      ? `Retry in ${formatRetryCountdown(quoteState.rateLimitRemainingMs)}`
      : 'Retry quote';

  const handlePayAmountChange = (amount: string) => {
    setPayAmount(amount);
  };

  const handleRetryQuote = () => {
    quoteState.refresh();
  };

  useEffect(() => {
    if (!quoteAmount) {
      setConfidenceScore(85);
      setVolatility('low');
      return;
    }

    const nextConfidence = Math.max(50, Math.min(95, 90 - quoteAmount / 100));
    setConfidenceScore(Math.round(nextConfidence));
    if (quoteAmount > 1000) {
      setVolatility('high');
    } else if (quoteAmount > 100) {
      setVolatility('medium');
    } else {
      setVolatility('low');
    }
  }, [quoteAmount]);

  const handleReset = () => {
    reset();
    setConfidenceScore(85);
    setVolatility('low');
  };

  // Defer render until localStorage has been read to avoid flash of default values
  if (!isHydrated) {
    return (
      <Card className="w-full border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold">Swap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full border shadow-sm">
      <CardHeader className="pb-4">
        {isOffline && (
          <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            You&apos;re offline. Quote refresh and swap submission are paused until
            your connection is restored.
          </div>
        )}
        <div className="flex items-center justify-between flex-row">
          <CardTitle className="text-xl font-semibold">Swap</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full"
              onClick={handleReset}
              title="Clear form"
            >
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">Clear form</span>
            </Button>
            <SlippageControl slippage={slippage} onChange={setSlippage} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <PairSelector
          payAmount={payAmount}
          onPayAmountChange={handlePayAmountChange}
          receiveAmount={receiveAmount}
        />
        {isValidAmount && (
          <div className="space-y-4">
            <SimulationPanel
              payAmount={payAmount}
              expectedOutput={receiveAmount}
              slippage={slippage}
              isLoading={isLoading}
            />
            <FeeBreakdownPanel
              protocolFees={[
                { name: 'Router Fee', amount: '0.001 XLM', description: 'Fee for using StellarRoute aggregator' },
                { name: 'Pool Fee', amount: '0.003%', description: 'Liquidity provider fee for AQUA pool' },
              ]}
              networkCosts={[
                { name: 'Base Fee', amount: '0.00001 XLM', description: 'Stellar network base transaction fee' },
                { name: 'Operation Fee', amount: '0.00002 XLM', description: 'Fee for path payment operations' },
              ]}
              totalFee="0.01 XLM"
              netOutput={`${(parseFloat(receiveAmount || '0') * 0.99).toFixed(4)} USDC`}
            />
            <QuoteSummary
              rate={
                quoteState.data
                  ? `1 XLM ≈ ${Number.parseFloat(quoteState.data.price).toFixed(2)} USDC`
                  : "1 XLM ≈ 0.98 USDC"
              }
              fee="0.01 XLM"
              priceImpact={
                quoteState.data?.price_impact
                  ? `${quoteState.data.price_impact}%`
                  : "< 0.1%"
              }
              isLoading={isLoading}
            />
            <RouteDisplay
              amountOut={receiveAmount}
              confidenceScore={confidenceScore}
              volatility={volatility}
              isLoading={isLoading}
            />
          </div>
        )}
        {quoteError && isValidAmount && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <p>{quoteError}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleRetryQuote}
              disabled={
                !isOnline ||
                isLoading ||
                quoteState.rateLimitRemainingMs > 0
              }
            >
              {retryButtonLabel}
            </Button>
          </div>
        )}
        <SwapCTA
          validation={validation}
          isLoading={isLoading}
          isOnline={isOnline}
          onSwap={() => console.log('Swapping...')}
        />
      </CardContent>
    </Card>
  );
}
