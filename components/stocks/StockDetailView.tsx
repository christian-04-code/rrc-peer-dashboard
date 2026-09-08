"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Ticker } from "@/lib/dashboard/company-registry";
import type { StockDetailResponse } from "@/lib/market/stock-detail-types";
import { StockPriceChart } from "@/components/stocks/StockPriceChart";

function money(value: number | null): string { return value === null ? "--" : value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function percent(value: number | null): string { return value === null ? "--" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`; }
function compact(value: number | null): string {
  if (value === null) return "--";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}
function whole(value: number | null): string { return value === null ? "--" : Math.round(value).toLocaleString("en-US"); }
function historyNote(value: number | null): string | null { return value === null ? "Insufficient price history" : null; }

export function StockDetailView({ ticker, requestedTicker }: { ticker: Ticker | null; requestedTicker: string }) {
  const [state, setState] = useState<{ data: StockDetailResponse | null; loading: boolean; error: string | null }>({ data: null, loading: Boolean(ticker), error: null });

  useEffect(() => {
    if (!ticker) return;
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    fetch(`/api/stocks/${ticker}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? "Unsupported stock ticker." : "Stock data is temporarily unavailable.");
        return response.json() as Promise<StockDetailResponse>;
      })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setState({ data: null, loading: false, error: error.message }); });
    return () => controller.abort();
  }, [ticker]);

  if (!ticker) return <StockShell><StatePanel title={`${requestedTicker} is not supported`} detail="Stock detail is available for RRC, AR, CNX, CRK, EQT, EXE, and GPOR." /></StockShell>;
  if (state.loading) return <StockShell><div className="stock-loading" role="status"><span />Loading {ticker} market data…</div></StockShell>;
  if (state.error || !state.data) return <StockShell><StatePanel title="Stock data unavailable" detail={state.error ?? "Please try again shortly."} /></StockShell>;

  const data = state.data;
  const changeClass = data.dailyChange === null ? "neutral" : data.dailyChange >= 0 ? "positive" : "negative";
  const metrics = [
    ["YTD Return", percent(data.returns.ytd), historyNote(data.returns.ytd)],
    ["6-Month Return", percent(data.returns.sixMonth), historyNote(data.returns.sixMonth)],
    ["1-Year Return", percent(data.returns.oneYear), historyNote(data.returns.oneYear)],
    ["3-Year Return", percent(data.returns.threeYear), historyNote(data.returns.threeYear)],
    ["5-Year Return", percent(data.returns.fiveYear), historyNote(data.returns.fiveYear)],
    ["52-Week High", money(data.fiftyTwoWeekHigh), "Intraday high"],
    ["52-Week Low", money(data.fiftyTwoWeekLow), "Intraday low"],
    ["5-Year High", money(data.fiveYearHigh), "Intraday high"],
    ["5-Year Low", money(data.fiveYearLow), "Intraday low"],
    ["50-Day Moving Average", money(data.movingAverage50), historyNote(data.movingAverage50)],
    ["200-Day Moving Average", money(data.movingAverage200), historyNote(data.movingAverage200)],
    ["Current vs. 200-Day MA", percent(data.currentVsMovingAverage200), historyNote(data.currentVsMovingAverage200)],
    ["Distance From 52-Week High", percent(data.distanceFrom52WeekHigh), data.currentPrice === null ? "Current quote unavailable" : null],
    ["Distance From 52-Week Low", percent(data.distanceFrom52WeekLow), data.currentPrice === null ? "Current quote unavailable" : null],
    ["Average Volume (1Y)", whole(data.averageVolume1y), null],
    ["Market Capitalization", data.marketCap === null ? "--" : `$${compact(data.marketCap)}`, data.marketCapSource ? "Saved workbook value" : null]
  ] as const;
  const quoteTime = data.quoteTimestamp
    ? new Date(data.quoteTimestamp * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Current quote unavailable";

  return (
    <StockShell>
      <header className="stock-hero">
        <div><span className="stock-kicker">Stock detail · {data.ticker}</span><h1>{data.companyName}</h1><p>{data.ticker} · NYSE</p></div>
        <div className="stock-quote"><strong>{money(data.currentPrice)}</strong><span className={changeClass}>{data.dailyChange === null ? "--" : `${data.dailyChange >= 0 ? "+" : ""}${money(data.dailyChange)}`} <b>{data.dailyChangePercent === null ? "--" : `(${percent(data.dailyChangePercent)})`}</b></span><small>Finnhub · {quoteTime}</small></div>
      </header>

      <section className="stock-chart-card" aria-labelledby="stock-price-title">
        <div className="stock-section-head"><div><span>Historical performance</span><h2 id="stock-price-title">Share price</h2></div><small>{data.history.source} · Historical close<br />{data.history.earliestDate} to {data.history.latestDate}</small></div>
        <StockPriceChart observations={data.history.observations} ticker={data.ticker} />
      </section>

      <section className="stock-metrics" aria-labelledby="stock-metrics-title">
        <div className="stock-section-head"><div><span>Workbook-derived analytics</span><h2 id="stock-metrics-title">Stock metrics</h2></div><small>Calculated from stored OHLCV observations</small></div>
        <div className="stock-metric-grid">{metrics.map(([label, value, note]) => <div className="stock-metric" key={label}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>)}</div>
      </section>
    </StockShell>
  );
}

function StockShell({ children }: { children: React.ReactNode }) {
  return <main className="stock-shell"><nav className="stock-nav" aria-label="Stock detail navigation"><Link href="/">← Range Resources Market &amp; Peer Dashboard</Link><span>Market data</span></nav><div className="stock-content">{children}</div></main>;
}

function StatePanel({ title, detail }: { title: string; detail: string }) {
  return <section className="stock-state" role="status"><strong>{title}</strong><p>{detail}</p><Link href="/">Return to dashboard</Link></section>;
}
