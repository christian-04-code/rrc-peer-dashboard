import type { Ticker } from "./types";

export type CompanyComparisonState = {
  selectedTickers: Ticker[];
  focusedTicker: Ticker;
};

export const MAX_SELECTED_COMPANIES = 7;

export function updateCompanyComparison(
  state: CompanyComparisonState,
  ticker: Ticker,
  maxSelections = MAX_SELECTED_COMPANIES
): CompanyComparisonState {
  const isSelected = state.selectedTickers.includes(ticker);

  if (!isSelected) {
    if (state.selectedTickers.length >= maxSelections) return state;
    return {
      selectedTickers: [...state.selectedTickers, ticker],
      focusedTicker: ticker
    };
  }

  // A selected company can be removed, but the chart always retains one series.
  if (state.selectedTickers.length === 1) return state;
  const selectedTickers = state.selectedTickers.filter((item) => item !== ticker);
  return {
    selectedTickers,
    focusedTicker: ticker === state.focusedTicker ? selectedTickers[0] : state.focusedTicker
  };
}

export function focusSelectedCompany(
  state: CompanyComparisonState,
  ticker: Ticker
): CompanyComparisonState {
  return state.selectedTickers.includes(ticker) ? { ...state, focusedTicker: ticker } : state;
}
