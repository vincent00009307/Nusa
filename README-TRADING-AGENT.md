# Trading Agent V1 — Research Terminal

Responsive web prototype for the initial AI Trading Agent project.

## Scope
- Two initial education sources: Support & Resistance and Smart Money Concepts.
- Separate strategy modules; no automatic merging.
- Forex + crypto are planned market classes.
- Human approves decisions; no broker order execution.
- Backtesting and paper trading are planned validation stages.

## Current state
This branch contains a frontend prototype only. The chart is illustrative, sample signal cards are placeholders, and no live market data, AI inference, authentication, persistent database, backtest engine, or broker connection is wired yet. Do not use the displayed UI as trading advice.

## Deploy
Import this repository/branch into Vercel and use the default static project settings. index.html is at the repository root, so no build command is required for this prototype.

## Next engineering milestones
1. Review/apply the PostgreSQL schema in a development database.
2. Add authentication and workspace-level access controls.
3. Connect a market data source and store normalized candles.
4. Formalize all undefined strategy parameters as explicit engineering assumptions.
5. Build deterministic backtest and out-of-sample validation before paper trading.
