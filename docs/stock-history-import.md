# Stock history refresh

Historical charts use stored OHLCV values extracted from `Peer Stock Price.xlsx`. Excel formulas never run in the application or on Vercel.

1. Open the workbook in Microsoft Excel, refresh its stock history, and save it.
2. From the repository root, run:

   ```sh
   npm run stock-history:import -- "../Peer_Comp_Site_Data/Codex/Peer Stock Price.xlsx"
   ```

3. Review the printed count and date range for all seven tickers, then commit the updated files under `data/stock-history/`.

The import fails rather than silently dropping malformed observations. It validates sheet names, dates, chronological order, duplicates, positive OHLC prices, consistent high/low ranges, numeric non-negative volume, and reasonable row counts. EXE observations before its October 2, 2024 ticker launch are reported and excluded so predecessor-ticker history is never spliced into EXE.
