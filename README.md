# WealthWise — Comprehensive SIP, Lumpsum & Wealth Calculator

A modern, high-precision financial calculator and return backtracker built with vanilla HTML5, CSS3, and JavaScript.

## 🚀 Key Features

- **Flexible Tenure Options**: Input tenure in arbitrary combinations of Years (0–100) & Months (0–11) or enter Total Months directly (e.g., 3 months, 13 months, 28 months) with two-way synchronized inputs.
- **Investment Modes**:
  - **SIP Only**: Regular monthly systematic investments with optional annual step-up percentage.
  - **Lumpsum Only**: One-time compounding wealth growth.
  - **Hybrid Strategy**: Continuous SIP plus custom ad-hoc bonus/windfall injections at any arbitrary month.
- **Return Backtracker & Credibility Checker**:
  - Input total invested vs. promised maturity payout and duration.
  - Computes exact annualized Gross & Net CAGR / XIRR.
  - Benchmarks the returns against standard instruments (FD, PPF, Nifty 50) and flags unrealistic / scam yields.
- **Comprehensive Taxation Engine (FY 2026–27 Rules)**:
  - **Equity / Mutual Funds**: 12.5% LTCG (> 12 months, ₹1.25 Lakh annual exemption) / 20% STCG.
  - **FD / Debt / Non-Equity**: Taxed at marginal salary slab rates under the updated FY 2026–27 tax regime.
  - **Tax-Exempt**: PPF, EPF, Sovereign Gold Bonds (SGB).
  - **Custom Flat Rate**: User-defined tax percentage.
- **Interactive Visualizations**:
  - HTML5 dynamic canvas chart with customizable time windows (3Y, 5Y, 10Y, 20Y).
  - Milestone checkpoints table with 5 intermediate checkpoints.
  - Real wealth purchasing power adjusted for inflation.
- **Theming**:
  - Obsidian Dark Theme and an Off-White/Olive Light Theme with peach borders.

---

## 🛠️ Tech Stack

- **HTML5**
- **Vanilla CSS3** (Custom design system, CSS variables, glassmorphic accents)
- **Vanilla JavaScript (ES6+)** (Bisection numerical root-finding for exact XIRR/CAGR)

---

## 💻 Local Setup

Simply clone the repository and open `index.html` in any modern web browser:

```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
# Open index.html directly or use VS Code Live Server
```
