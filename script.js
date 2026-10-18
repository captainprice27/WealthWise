// ==========================================================================
// WealthWise – Investment & Inflation Calculation Engine
// ==========================================================================

const $ = id => document.getElementById(id);
const fmt = n => {
  if (!isFinite(n)) return '–';
  if (n > 1e15) return '₹' + compact(n);
  return '₹' + Math.round(n).toLocaleString('en-IN');
};
const pct = n => (isFinite(n) ? n.toFixed(2) : '–') + '%';
const compact = n => {
  if (!isFinite(n)) return '–';
  return n >= 1e7 ? (n/1e7).toFixed(2)+' Cr' : n >= 1e5 ? (n/1e5).toFixed(2)+' L' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : Math.round(n)+'';
};

// State Variables
let appMode = 'forward';     // 'forward' (Growth Predictor) | 'reverse' (Return Backtracker)
let currentMode = 'sip';     // 'sip' | 'lump' | 'hybrid'

let taxMode = 'equity';      // 'equity' | 'salary' | 'exempt' | 'custom'
let series = [];
let boosts = [
  { id: 1, amount: 500000, month: 15, tag: 'Year-end Bonus / Lottery' }
];

// --------------------------------------------------------------------------
// 1. Theme Toggle (Dark vs Pure Olive Light Mode with Peach Borders)
// --------------------------------------------------------------------------
const themeBtn = $('themeToggle');
const themeIcon = $('themeIcon');


function initTheme() {
  const savedTheme = localStorage.getItem('wealthwise_theme') || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('wealthwise_theme', theme);
  if (theme === 'light') {
    themeIcon.textContent = '🌙';
  } else {
    themeIcon.textContent = '☀️';
  }
  if (series.length) draw();
}

themeBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// --------------------------------------------------------------------------
// 2. App Mode Switching (Forward Predictor vs Reverse Backtracker)
// --------------------------------------------------------------------------
const btnModeForward = $('btnModeForward');
const btnModeReverse = $('btnModeReverse');
const fieldExpectedRate = $('fieldExpectedRate');
const fieldTargetCorpus = $('fieldTargetCorpus');
const viewForward = $('viewForward');
const viewReverse = $('viewReverse');
const inputsSubtitle = $('inputsSubtitle');
const chartTitle = $('chartTitle');
const chartSubtitle = $('chartSubtitle');

function setAppMode(mode) {
  appMode = mode;
  if (mode === 'forward') {
    btnModeForward.classList.add('active');
    btnModeReverse.classList.remove('active');
    fieldExpectedRate.classList.remove('hidden');
    fieldTargetCorpus.classList.add('hidden');
    viewForward.classList.remove('hidden');
    viewReverse.classList.add('hidden');
    inputsSubtitle.textContent = 'Configure your deposit pattern, return rate, and timeline';
    chartTitle.textContent = 'Wealth Accumulation Trajectory';
    chartSubtitle.textContent = 'Projected compounding trajectory with 5 intermediate milestone checkpoints';
  } else {
    btnModeForward.classList.remove('active');
    btnModeReverse.classList.add('active');
    fieldExpectedRate.classList.add('hidden');
    fieldTargetCorpus.classList.remove('hidden');
    viewForward.classList.add('hidden');
    viewReverse.classList.remove('hidden');
    inputsSubtitle.textContent = 'Enter what you invest and what payout is promised';
    chartTitle.textContent = 'Backtracked Growth Path to Target';
    chartSubtitle.textContent = 'Hypothetical compounding curve required to hit your target';
  }
  calc();
}

btnModeForward.addEventListener('click', () => setAppMode('forward'));
btnModeReverse.addEventListener('click', () => setAppMode('reverse'));

// --------------------------------------------------------------------------
// 3. Tenure Presets (3Y, 5Y, 10Y, 20Y) & Dynamic Intermediate Areas
// --------------------------------------------------------------------------
function setTenureYears(yrs) {
  $('years').value = yrs;
  $('months').value = 0;
  if ($('totalMonthsInput')) $('totalMonthsInput').value = yrs * 12;
  syncTenurePresetUI(yrs);
  calc();
}

function syncTenurePresetUI(yrs) {
  const m = parseInt($('months').value) || 0;
  const isExactYears = (m === 0);

  document.querySelectorAll('#tenurePresets .preset-pill').forEach(btn => {
    const y = parseInt(btn.dataset.years);
    btn.classList.toggle('active', isExactYears && y === yrs);
  });

  document.querySelectorAll('#chartTenurePills .chart-pill').forEach(btn => {
    const y = parseInt(btn.dataset.years);
    btn.classList.toggle('active', isExactYears && y === yrs);
  });
}

document.querySelectorAll('#tenurePresets .preset-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    const yrs = parseInt(btn.dataset.years);
    setTenureYears(yrs);
  });
});

document.querySelectorAll('#chartTenurePills .chart-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    const yrs = parseInt(btn.dataset.years);
    setTenureYears(yrs);
  });
});

// Calculate exactly 5 intermediate points between Month 0 and Month N
function getFiveIntermediatePoints(N) {
  if (N <= 1) return [];
  if (N <= 5) {
    const pts = [];
    for (let i = 1; i < N; i++) pts.push(i);
    return pts;
  }

  // 5 distinct intermediate points dividing N into 6 segments
  const points = [];
  for (let k = 1; k <= 5; k++) {
    const pt = Math.round((N * k) / 6);
    if (pt > 0 && pt < N && !points.includes(pt)) {
      points.push(pt);
    }
  }

  // Ensure 5 distinct points if N is large enough
  if (points.length < 5 && N >= 6) {
    points.length = 0;
    const step = (N - 1) / 6;
    for (let k = 1; k <= 5; k++) {
      points.push(Math.round(1 + step * k));
    }
  }

  return points.sort((a, b) => a - b);
}

function fmtAxisLabel(m) {
  if (m === 0) return '0';
  if (m % 12 === 0) return `${m / 12}y`;
  if (m < 12) return `${m}m`;
  const y = (m / 12);
  return (y % 1 === 0.5) ? `${y.toFixed(1)}y` : `${y.toFixed(1)}y`;
}

// --------------------------------------------------------------------------
// 4. Asset Class & Salary Slab Taxation Engine
// --------------------------------------------------------------------------
const taxSeg = $('taxAssetSeg');
taxSeg.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  document.querySelectorAll('#taxAssetSeg button').forEach(x => x.classList.toggle('active', x === b));
  setTaxMode(b.dataset.taxMode);
});

function setTaxMode(mode) {
  taxMode = mode;
  $('taxSubEquity').classList.toggle('hidden', mode !== 'equity');
  $('taxSubSalary').classList.toggle('hidden', mode !== 'salary');
  $('taxSubExempt').classList.toggle('hidden', mode !== 'exempt');
  $('taxSubCustom').classList.toggle('hidden', mode !== 'custom');
  calc();
}

$('taxableIncome').addEventListener('input', calc);
$('taxExemptionCheck').addEventListener('change', calc);

// India, FY 2026-27 (AY 2027-28) — new tax regime, individuals
const CESS = 1.04;
const SLABS = [
  [400000, 0], [800000, 0.05], [1200000, 0.10], [1600000, 0.15],
  [2000000, 0.20], [2400000, 0.25], [Infinity, 0.30]
];
function slabTax(income) {
  let tax = 0, prev = 0;
  for (const [cap, rate] of SLABS) {
    if (income > prev) tax += (Math.min(income, cap) - prev) * rate;
    prev = cap;
  }
  // Sec 87A: nil tax up to ₹12 L income, with marginal relief just above it
  if (income <= 1200000) tax = 0;
  else tax = Math.min(tax, income - 1200000);
  return tax * CESS;
}

function computeTax(gross, totalInvested) {
  const gains = Math.max(0, gross - totalInvested);
  const months = Math.floor(val('years')) * 12 + Math.floor(val('months'));
  const years = Math.max(months / 12, 1 / 12);
  const out = (tax, label) => ({ tax, effectiveRate: gains ? tax / gains * 100 : 0, label });
  if (gains <= 0) return out(0, '0% (no gains)');

  if (taxMode === 'equity') {
    if (months <= 12) {
      const t = gains * 0.20 * CESS;
      return out(t, `${(t / gains * 100).toFixed(1)}% (STCG 20% + cess)`);
    }
    const exemption = $('taxExemptionCheck').checked ? 125000 * Math.floor(months / 12) : 0;
    const t = Math.max(0, gains - exemption) * 0.125 * CESS;
    return out(t, `${(t / gains * 100).toFixed(1)}% (LTCG 12.5% + cess${exemption ? ', ₹1.25 L/yr exempt' : ''})`);
  }
  if (taxMode === 'salary') {
    const income = val('taxableIncome');
    const perYear = gains / years;
    const t = (slabTax(income + perYear) - slabTax(income)) * years;
    return out(t, `${(t / gains * 100).toFixed(1)}% (interest taxed at your slab)`);
  }
  if (taxMode === 'exempt') return out(0, '0% (tax-free)');
  const t = gains * val('taxCustom') / 100;
  return out(t, `${val('taxCustom').toFixed(1)}% (custom)`);
}

// --------------------------------------------------------------------------
// 5. Sliders & Input Sync
// --------------------------------------------------------------------------
const rangeKeys = ['sip', 'stepup', 'lump', 'rate', 'targetCorpus', 'inflation', 'taxCustom'];
rangeKeys.forEach(k => {
  const r = $(k + 'Range'), n = $(k);
  if (!r || !n) return;
  const paint = () => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%');
  r.addEventListener('input', () => { n.value = r.value; paint(); calc(); });
  n.addEventListener('input', () => { r.value = n.value; paint(); calc(); });
  paint();
});

function syncFromYearsMonths() {
  let y = Math.max(0, parseInt($('years').value) || 0);
  let m = Math.max(0, parseInt($('months').value) || 0);

  // Strictly clamp years to 100 max
  if (y > 100) {
    y = 100;
    $('years').value = 100;
  }
  // Strictly clamp months to 11 max
  if (m > 11) {
    m = 11;
    $('months').value = 11;
  }

  const total = Math.min(1200, y * 12 + m);
  if ($('totalMonthsInput') && document.activeElement !== $('totalMonthsInput')) {
    $('totalMonthsInput').value = total;
  }
  syncTenurePresetUI(y);
  calc();
}

['years', 'months'].forEach(k => {
  $(k).addEventListener('input', syncFromYearsMonths);
  $(k).addEventListener('change', syncFromYearsMonths);
});

if ($('totalMonthsInput')) {
  $('totalMonthsInput').addEventListener('input', () => {
    let total = Math.max(0, parseInt($('totalMonthsInput').value) || 0);
    if (total > 1200) {
      total = 1200;
      $('totalMonthsInput').value = 1200;
    }
    const y = Math.min(100, Math.floor(total / 12));
    const m = y >= 100 ? 0 : total % 12;
    $('years').value = y;
    $('months').value = m;
    syncTenurePresetUI(y);
    calc();
  });
}


// Strategy Mode Selector (SIP vs Lumpsum vs Hybrid)
$('modeSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  document.querySelectorAll('#modeSeg button').forEach(x => x.classList.toggle('active', x === b));
  setStrategyMode(b.dataset.mode);
});

function setStrategyMode(mode) {
  currentMode = mode;
  const secSip = $('secSip');
  const secLump = $('secLump');
  const secBoosts = $('secBoosts');
  const lumpLabel = $('lumpLabel');
  const lumpHint = $('lumpHint');

  if (mode === 'sip') {
    secSip.classList.remove('hidden');
    secLump.classList.add('hidden');
    secBoosts.classList.add('hidden');
  } else if (mode === 'lump') {
    secSip.classList.add('hidden');
    secLump.classList.remove('hidden');
    secBoosts.classList.add('hidden');
    lumpLabel.textContent = 'Lumpsum Investment Amount';
    lumpHint.textContent = 'One-time investment compounded over the entire period.';
  } else if (mode === 'hybrid') {
    secSip.classList.remove('hidden');
    secLump.classList.remove('hidden');
    secBoosts.classList.remove('hidden');
    lumpLabel.textContent = 'Initial Lumpsum (Invested today, optional)';
    lumpHint.textContent = 'Starting capital (can be ₹0 or any amount), followed by monthly SIP + boosts.';
  }
  calc();
}

// In-Between Lumpsum Boosts / Windfalls Manager
$('addBoostBtn').addEventListener('click', () => {
  const totalMonths = Math.floor(val('years')) * 12 + Math.floor(val('months'));
  const nextMonth = Math.min(totalMonths || 12, (boosts.length ? boosts[boosts.length - 1].month + 12 : 12));
  boosts.push({
    id: Date.now(),
    amount: 200000,
    month: nextMonth,
    tag: 'Bonus / Windfall'
  });
  renderBoostsList();
  calc();
});

function renderBoostsList() {
  const container = $('boostsList');
  if (!boosts.length) {
    container.innerHTML = '<div class="boost-empty">No extra boosts added yet. Click "+ Add Boost" to inject windfalls at any month!</div>';
    return;
  }

  container.innerHTML = boosts.map((b, idx) => `
    <div class="boost-item" data-id="${b.id}">
      <div class="boost-fields">
        <div class="boost-input-col">
          <span class="boost-lbl">Amount (₹)</span>
          <div class="num boost-num">
            <span>₹</span>
            <input type="number" class="boost-amt" min="0" step="5000" value="${b.amount}" data-idx="${idx}">
          </div>
        </div>
        <div class="boost-input-col">
          <span class="boost-lbl">At Month #</span>
          <div class="num boost-num">
            <input type="number" class="boost-month" min="1" step="1" value="${b.month}" data-idx="${idx}">
            <span>mth</span>
          </div>
        </div>
        <div class="boost-input-col boost-desc-col">
          <span class="boost-lbl">Reason / Tag</span>
          <input type="text" class="boost-tag" placeholder="e.g. Annual Bonus" value="${b.tag || ''}" data-idx="${idx}">
        </div>
      </div>
      <button type="button" class="boost-del" title="Delete boost" data-id="${b.id}">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.boost-amt').forEach(el => {
    el.addEventListener('input', e => {
      const idx = e.target.dataset.idx;
      boosts[idx].amount = Math.max(0, parseFloat(e.target.value) || 0);
      calc();
    });
  });

  container.querySelectorAll('.boost-month').forEach(el => {
    el.addEventListener('input', e => {
      const idx = e.target.dataset.idx;
      boosts[idx].month = Math.max(1, parseInt(e.target.value) || 1);
      calc();
    });
  });

  container.querySelectorAll('.boost-tag').forEach(el => {
    el.addEventListener('input', e => {
      const idx = e.target.dataset.idx;
      boosts[idx].tag = e.target.value;
      calc();
    });
  });

  container.querySelectorAll('.boost-del').forEach(el => {
    el.addEventListener('click', e => {
      const id = parseInt(e.currentTarget.dataset.id);
      boosts = boosts.filter(b => b.id !== id);
      renderBoostsList();
      calc();
    });
  });
}

// Helper to safely get positive numbers
const val = id => Math.max(0, parseFloat($(id)?.value) || 0);

// --------------------------------------------------------------------------
// 6. Core Simulation & Calculation Engine (Forward & Reverse)
// --------------------------------------------------------------------------
function calc() {
  const rawYears = Math.min(100, Math.max(0, val('years')));
  const rawMonths = Math.min(11, Math.max(0, val('months')));
  const n = Math.min(1200, Math.max(1, Math.floor(rawYears * 12 + rawMonths)));
  if ($('totalMonthsInput') && document.activeElement !== $('totalMonthsInput')) {
    $('totalMonthsInput').value = n;
  }
  if (n < 1) return;

  const inf = val('inflation') / 100;
  const im = Math.pow(1 + inf, 1 / 12); // Monthly inflation factor

  let sip0 = 0;
  let step = 0;
  let lump0 = 0;
  let activeBoosts = [];

  if (currentMode === 'sip') {
    sip0 = val('sip');
    step = val('stepup') / 100;
  } else if (currentMode === 'lump') {
    lump0 = val('lump');
  } else if (currentMode === 'hybrid') {
    sip0 = val('sip');
    step = val('stepup') / 100;
    lump0 = val('lump');
    activeBoosts = boosts.filter(b => b.month <= n && b.amount > 0);
  }

  // Raw deposit cash flows: [depositTime, amount, label]
  const rawFlows = [];
  let totalInvested = lump0;
  if (lump0 > 0) rawFlows.push([0, lump0, 'Initial Lumpsum']);

  const monthlySips = [];
  const monthlyBoosts = [];

  for (let m = 1; m <= n; m++) {
    const curSip = (currentMode === 'lump') ? 0 : sip0 * Math.pow(1 + step, Math.floor((m - 1) / 12));
    monthlySips[m] = curSip;

    let bSum = 0;
    const mb = activeBoosts.filter(b => b.month === m);
    if (mb.length > 0) bSum = mb.reduce((s, x) => s + x.amount, 0);
    monthlyBoosts[m] = { amount: bSum, tags: mb.map(x => x.tag || 'Windfall') };

    const depositTime = m - 1; // every instalment is invested at the start of its month
    if (curSip > 0) rawFlows.push([depositTime, curSip, 'SIP']);
    if (bSum > 0) rawFlows.push([depositTime, bSum, 'Boost']);
    totalInvested += curSip + bSum;
  }

  // Optimized, overflow-safe solver: Given target value and flows, find monthly rate
  const solveMonthlyRate = target => {
    if (target <= 0 || totalInvested <= 0 || rawFlows.length === 0 || !isFinite(target)) return 0;
    let lo = -0.9999, hi = 5.0;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      let fv = 0;
      let overflowed = false;
      for (let j = 0; j < rawFlows.length; j++) {
        const [t, c] = rawFlows[j];
        const p = n - t;
        const factor = Math.pow(1 + mid, p);
        if (!isFinite(factor) || factor > 1e100) {
          overflowed = true;
          break;
        }
        fv += c * factor;
        if (fv > target) {
          overflowed = true;
          break;
        }
      }
      if (overflowed || fv > target) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return (lo + hi) / 2;
  };

  if (appMode === 'forward') {
    // --------------------------------------------------------
    // FORWARD CALCULATION: Rate -> Future Wealth
    // --------------------------------------------------------
    const gRate = val('rate') / 100;
    const rm = Math.pow(1 + gRate, 1 / 12) - 1;

    series = [{ m: 0, inv: lump0, gross: lump0, real: lump0, sip: sip0, boost: 0, boostTags: [] }];
    let bal = lump0;
    let cumInv = lump0;

    for (let m = 1; m <= n; m++) {
      const curSip = monthlySips[m];
      const bObj = monthlyBoosts[m];

      bal += (curSip + bObj.amount);
      cumInv += (curSip + bObj.amount);
      bal *= (1 + rm);

      series.push({
        m,
        inv: cumInv,
        gross: bal,
        real: bal / Math.pow(im, m),
        sip: curSip,
        boost: bObj.amount,
        boostTags: bObj.tags
      });
    }

    const gross = bal;
    const gains = Math.max(0, gross - totalInvested);

    // Compute Tax using Asset Class / Salary Slab
    const taxInfo = computeTax(gross, totalInvested);
    const net = gross - taxInfo.tax;
    const real = net / Math.pow(im, n);

    $('effectiveTaxDisplay').textContent = taxInfo.label;

    // XIRR on actual flows
    const mGross = solveMonthlyRate(gross);
    const mNet = solveMonthlyRate(net);
    const aGross = (Math.pow(1 + mGross, 12) - 1) * 100;
    const aNet = (Math.pow(1 + mNet, 12) - 1) * 100;
    const aReal = ((1 + aNet / 100) / (1 + inf) - 1) * 100;

    $('rInvested').textContent = fmt(totalInvested);
    $('rGains').textContent = '+' + fmt(gains);
    $('rGross').textContent = fmt(gross);
    $('rNet').textContent = fmt(net);
    $('rReal').textContent = fmt(real);
    $('rRealNote').textContent = `With ${pct(inf * 100)} annual inflation over ${fmtTenure(n)}, your net ${fmt(net)} will have the purchasing power of ${fmt(real)} in today's money.`;

    const keepPct = net > 0 ? Math.min(100, Math.max(0, real / net * 100)) : 0;
    $('ring').style.setProperty('--p', keepPct);
    $('ringTxt').innerHTML = Math.round(keepPct) + '%<br><small style="font-size:10px;opacity:0.75">value kept</small>';

    $('aGross').textContent = pct(aGross);
    $('aNet').textContent = pct(aNet);
    $('aReal').textContent = pct(aReal);

    buildTable(n, activeBoosts);
    draw();

  } else {
    // --------------------------------------------------------
    // REVERSE CALCULATION: Final Payout -> Backtracked Rate & Credibility
    // --------------------------------------------------------
    const targetCorpus = val('targetCorpus');
    const netGains = targetCorpus - totalInvested;
    const profitPct = totalInvested > 0 ? (netGains / totalInvested * 100) : 0;

    const badge = $('targetProfitBadge');
    badge.textContent = `${netGains >= 0 ? '+' : ''}${fmt(netGains)} (${profitPct.toFixed(1)}%)`;
    badge.style.color = netGains >= 0 ? 'var(--accent-green)' : '#ef4444';

    // Solve Gross monthly rate
    const mGross = solveMonthlyRate(targetCorpus);
    const aGross = (Math.pow(1 + mGross, 12) - 1) * 100;

    // After-tax corpus using Asset Class / Salary Slab
    const taxInfo = computeTax(targetCorpus, totalInvested);
    const netCorpus = targetCorpus - taxInfo.tax;
    const mNet = solveMonthlyRate(netCorpus);
    const aNet = (Math.pow(1 + mNet, 12) - 1) * 100;

    $('effectiveTaxDisplay').textContent = taxInfo.label;

    // Real return after inflation
    const aReal = ((1 + aNet / 100) / (1 + inf) - 1) * 100;
    const realCorpus = netCorpus / Math.pow(im, n);
    const multiplier = totalInvested > 0 ? (targetCorpus / totalInvested).toFixed(2) + 'x' : '–';

    $('revGrossRate').textContent = pct(aGross);
    $('revNetRate').textContent = pct(aNet);
    $('revRealRate').textContent = pct(aReal);
    $('revMultiplier').textContent = multiplier;

    $('revInvested').textContent = fmt(totalInvested);
    $('revFinal').textContent = fmt(targetCorpus);
    $('revGain').textContent = (netGains >= 0 ? '+' : '') + fmt(netGains);
    $('revRealCorpus').textContent = fmt(realCorpus);

    $('benchThisVal').textContent = pct(aGross);

    evaluateCredibility(aGross, inf);

    // Hypothetical trajectory for chart
    series = [{ m: 0, inv: lump0, gross: lump0, real: lump0, sip: sip0, boost: 0, boostTags: [] }];
    let bal = lump0;
    let cumInv = lump0;

    for (let m = 1; m <= n; m++) {
      const curSip = monthlySips[m];
      const bObj = monthlyBoosts[m];

      bal += (curSip + bObj.amount);
      cumInv += (curSip + bObj.amount);
      bal *= (1 + mGross);

      series.push({
        m,
        inv: cumInv,
        gross: bal,
        real: bal / Math.pow(im, m),
        sip: curSip,
        boost: bObj.amount,
        boostTags: bObj.tags
      });
    }

    buildTable(n, activeBoosts);
    draw();
  }
}

// --------------------------------------------------------------------------
// 7. Investment Source Credibility & Feasibility Evaluator
// --------------------------------------------------------------------------
function evaluateCredibility(rate, inflationRate) {
  const badge = $('credibilityBadge');
  const riskTag = $('credRiskLevel');
  const textBox = $('credAnalysisText');
  const benchStatus = $('benchThisStatus');

  badge.className = 'credibility-pill';
  riskTag.className = 'risk-tag';

  if (rate < 0) {
    badge.classList.add('pill-red');
    badge.textContent = '❌ Capital Loss';
    riskTag.classList.add('tag-scam');
    riskTag.textContent = 'Loss of Principal';
    textBox.innerHTML = `<strong>Capital Erosion:</strong> The promised payout is less than your total invested principal. You are suffering a negative annualised return of <strong>${pct(rate)}</strong>. Verify scheme deductions or exit penalties.`;
    benchStatus.textContent = 'Negative Return';
  } else if (rate < 5.5) {
    badge.classList.add('pill-orange');
    badge.textContent = '⚠️ Below Inflation';
    riskTag.classList.add('tag-safe');
    riskTag.textContent = 'Low Real Value';
    textBox.innerHTML = `<strong>Purchasing Power Decline:</strong> A return of <strong>${pct(rate)}</strong> is below typical inflation (${pct(inflationRate * 100)}). While principal may be safe (similar to a standard savings bank account or traditional endowment policy), your money will buy less in the future than it does today.`;
    benchStatus.textContent = 'Sub-Inflation';
  } else if (rate <= 8.5) {
    badge.classList.add('pill-green');
    badge.textContent = '🟢 Highly Credible (Fixed Income)';
    riskTag.classList.add('tag-safe');
    riskTag.textContent = 'Low Risk • Realistic';
    textBox.innerHTML = `<strong>Safe & Standard Fixed Income:</strong> An annualised return of <strong>${pct(rate)}</strong> is realistic and fully achievable in legitimate Fixed Deposits (FD), RBI Bonds, Corporate Debt, or Government Provident Funds (PPF/EPF). It preserves capital and slightly outpaces inflation.`;
    benchStatus.textContent = 'Matches Safe Debt';
  } else if (rate <= 15.0) {
    badge.classList.add('pill-green');
    badge.textContent = '🟢 Standard Market Credible (Equity)';
    riskTag.classList.add('tag-medium');
    riskTag.textContent = 'Market Linked';
    textBox.innerHTML = `<strong>Benchmark Equity / Mutual Fund Range:</strong> An annualised return of <strong>${pct(rate)}</strong> aligns with historical long-term equity index performance (e.g. Nifty 50 or S&P 500 historically compound at ~11% to 14% p.a.). Highly credible for mutual funds or equity SIPs over long horizons, though market fluctuations apply.`;
    benchStatus.textContent = 'Matches Equity Index';
  } else if (rate <= 22.0) {
    badge.classList.add('pill-blue');
    badge.textContent = '🔵 Aggressive / High Risk';
    riskTag.classList.add('tag-medium');
    riskTag.textContent = 'High Growth • Volatile';
    textBox.innerHTML = `<strong>Aggressive Return:</strong> <strong>${pct(rate)}</strong> is achievable in top-performing mid-cap or small-cap mutual funds or strong equity bull markets, but carries significant volatility. If an unregulated entity claims this is <em>guaranteed with zero risk</em>, proceed with strict caution.`;
    benchStatus.textContent = 'Smallcap / Aggressive';
  } else if (rate <= 32.0) {
    badge.classList.add('pill-orange');
    badge.textContent = '🟠 Highly Speculative / Unstable';
    riskTag.classList.add('tag-high');
    riskTag.textContent = 'Speculative Risk';
    textBox.innerHTML = `<strong>High Speculation / Private Equity:</strong> An annualised return of <strong>${pct(rate)}</strong> is rarely sustainable in passive retail investments. Typical of high-risk crypto trading, angel investing, or leveraged real estate. Unsustainable as a guaranteed passive vehicle.`;
    benchStatus.textContent = 'Speculative Yield';
  } else {
    badge.classList.add('pill-red');
    badge.textContent = '🚨 Red Flag / Ponzi Alert';
    riskTag.classList.add('tag-scam');
    riskTag.textContent = 'Extremely Suspicious';
    textBox.innerHTML = `<strong>Extreme Warning:</strong> An annualised return of <strong>${pct(rate)}</strong> is mathematically extraordinary. No regulated financial institution or sustainable business model can consistently guarantee >30%+ annual returns over time. High probability of an unregulated scheme, MLM, or Ponzi fraud. Exercise extreme diligence!`;
    benchStatus.textContent = 'Unrealistic Yield';
  }
}

function fmtTenure(n) {
  const y = Math.floor(n / 12), m = n % 12;
  return [y && y + (y > 1 ? ' years' : ' year'), m && m + (m > 1 ? ' months' : ' month')].filter(Boolean).join(' ') || '0 months';
}

// --------------------------------------------------------------------------
// 8. Milestone Table Breakdown with 5 Intermediate Points
// --------------------------------------------------------------------------
function buildTable(n, activeBoosts) {
  const milestones = new Set();
  
  // 5 intermediate milestone points
  const interPoints = getFiveIntermediatePoints(n);
  interPoints.forEach(p => milestones.add(p));

  // Windfall boost months in hybrid mode
  if (currentMode === 'hybrid') {
    activeBoosts.forEach(b => {
      if (b.month >= 1 && b.month <= n) milestones.add(b.month);
    });
  }

  // Always include final maturity month
  milestones.add(n);

  const sortedMonths = Array.from(milestones).sort((a, b) => a - b);

  $('tbody').innerHTML = sortedMonths.map((m, idx) => {
    const s = series[m];
    if (!s) return '';
    const isMaturity = (m === n);
    const label = fmtAxisLabel(m);
    
    let eventNote = '–';
    if (s.boost > 0) {
      eventNote = `<span class="table-pill">🎯 +${compact(s.boost)} ${s.boostTags.join(', ')}</span>`;
    } else if (isMaturity) {
      eventNote = `<span style="font-weight:600;color:var(--accent-a)">🏁 Final Maturity</span>`;
    } else {
      eventNote = `<span style="font-size:11px;color:var(--mut)">Checkpoint ${interPoints.indexOf(m) + 1} of 5</span>`;
    }

    return `
      <tr>
        <td><strong>${label} (${m} months)</strong></td>
        <td>${currentMode === 'lump' ? '–' : fmt(s.sip)}</td>
        <td>${fmt(s.inv)}</td>
        <td style="font-weight:600;color:var(--txt-heading)">${fmt(s.gross)}</td>
        <td style="color:var(--accent-c);font-weight:600">${fmt(s.real)}</td>
        <td>${eventNote}</td>
      </tr>
    `;
  }).join('');
}

// --------------------------------------------------------------------------
// 9. Interactive Canvas Growth Chart with 5 Intermediate Areas
// --------------------------------------------------------------------------
const cv = $('chart');
const ctx = cv.getContext('2d');
let geo = {};

function draw(hover) {
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth || 600;
  const H = 320;
  cv.width = W * dpr;
  cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  if (!series.length) return;

  const isLight = (document.documentElement.getAttribute('data-theme') === 'light');

  // Palette: Olive core in light mode, peach in borders only
  const colInvested = isLight ? '#4d6228' : '#6366f1';
  const colGross = isLight ? '#2d6a4f' : '#22d3ee';
  const colReal = isLight ? '#738c47' : '#f59e0b';
  const colGrid = isLight ? 'rgba(77, 98, 40, 0.1)' : 'rgba(255, 255, 255, 0.07)';
  const colAxis = isLight ? '#556832' : '#9aa0c3';
  const colIntermediate = isLight ? 'rgba(77, 98, 40, 0.18)' : 'rgba(255, 255, 255, 0.12)';

  const L = 64, R = 18, T = 16, B = 32;
  const w = W - L - R, h = H - T - B;
  const n = series.length - 1;

  // Safe linear scan for maxVal (avoids call stack limit on large arrays)
  let maxVal = 1;
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    if (s.gross > maxVal) maxVal = s.gross;
    if (s.inv > maxVal) maxVal = s.inv;
  }
  maxVal *= 1.06;
  if (!isFinite(maxVal) || maxVal <= 0) maxVal = 1;

  const x = m => L + (m / (n || 1)) * w;
  const y = v => T + h - (v / maxVal) * h;
  geo = { L, w, n, x, y };

  // 1. Horizontal Grid Lines & Y-Axis Labels
  ctx.font = '500 11px Inter, sans-serif';
  ctx.fillStyle = colAxis;
  ctx.strokeStyle = colGrid;
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';

  for (let i = 0; i <= 4; i++) {
    const valY = maxVal * i / 4;
    const yy = y(valY);
    ctx.beginPath();
    ctx.moveTo(L, yy);
    ctx.lineTo(W - R, yy);
    ctx.stroke();
    ctx.fillText('₹' + compact(valY), L - 8, yy + 4);
  }

  // 2. Exactly 5 Intermediate Points & X-Axis Gridlines
  const interPoints = getFiveIntermediatePoints(n);
  const allXPoints = [0, ...interPoints, n];

  ctx.textAlign = 'center';
  allXPoints.forEach((m, idx) => {
    const px = x(m);

    // Subtle vertical guide line for intermediate points
    ctx.beginPath();
    ctx.moveTo(px, T);
    ctx.lineTo(px, T + h);
    ctx.strokeStyle = (m === 0 || m === n) ? colGrid : colIntermediate;
    ctx.setLineDash((m === 0 || m === n) ? [] : [2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small tick mark at bottom
    ctx.beginPath();
    ctx.moveTo(px, T + h);
    ctx.lineTo(px, T + h + 4);
    ctx.strokeStyle = colAxis;
    ctx.stroke();

    // X-Axis text label
    ctx.fillStyle = (idx === 0 || idx === allXPoints.length - 1) ? colAxis : (isLight ? '#354420' : '#d1d5db');
    ctx.fillText(fmtAxisLabel(m), px, H - 10);
  });

  // 3. Area Fill for Gross Wealth
  const drawPath = key => {
    ctx.beginPath();
    series.forEach((s, idx) => {
      idx === 0 ? ctx.moveTo(x(s.m), y(s[key])) : ctx.lineTo(x(s.m), y(s[key]));
    });
  };

  const gFill = ctx.createLinearGradient(0, T, 0, T + h);
  if (isLight) {
    gFill.addColorStop(0, 'rgba(45, 106, 79, 0.25)');
    gFill.addColorStop(1, 'rgba(45, 106, 79, 0.01)');
  } else {
    gFill.addColorStop(0, 'rgba(34, 211, 238, 0.35)');
    gFill.addColorStop(1, 'rgba(34, 211, 238, 0.0)');
  }
  drawPath('gross');
  ctx.lineTo(x(n), y(0));
  ctx.lineTo(x(0), y(0));
  ctx.closePath();
  ctx.fillStyle = gFill;
  ctx.fill();

  // 4. Draw Trajectory Lines
  const drawLine = (key, color, dash = [], lineWidth = 2.4) => {
    drawPath(key);
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.setLineDash([]);
  };

  drawLine('gross', colGross, [], 2.8);
  drawLine('inv', colInvested, [], 2.4);
  drawLine('real', colReal, [6, 4], 2.2);

  // 5. Markers for Windfall Boosts (in Hybrid mode)
  if (currentMode === 'hybrid') {
    series.forEach(s => {
      if (s.boost > 0) {
        const px = x(s.m);
        ctx.beginPath();
        ctx.moveTo(px, T);
        ctx.lineTo(px, T + h);
        ctx.strokeStyle = isLight ? 'rgba(224, 122, 95, 0.7)' : colReal;
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);

        const py = y(s.gross);
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = isLight ? '#e07a5f' : colReal;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }

  // 6. Hover Crosshair & Dots
  if (hover != null && series[hover]) {
    const s = series[hover];
    const px = x(hover);

    ctx.strokeStyle = isLight ? 'rgba(77, 98, 40, 0.35)' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, T);
    ctx.lineTo(px, T + h);
    ctx.stroke();

    [
      ['gross', colGross],
      ['inv', colInvested],
      ['real', colReal]
    ].forEach(([k, col]) => {
      ctx.beginPath();
      ctx.arc(px, y(s[k]), 5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

// Hover Tooltip Interaction
const tip = $('tip');

cv.addEventListener('mousemove', e => {
  if (!series.length) return;
  const r = cv.getBoundingClientRect();
  const px = e.clientX - r.left;
  const m = Math.max(0, Math.min(geo.n, Math.round((px - geo.L) / (geo.w || 1) * geo.n)));
  const s = series[m];
  if (!s) return;

  draw(m);

  let extraHtml = '';
  if (s.boost > 0) {
    extraHtml = `<div style="margin-top:4px;padding-top:4px;border-top:1px dashed var(--input-border);color:var(--accent-c);font-weight:600">🎯 Windfall: +${fmt(s.boost)} (${s.boostTags.join(', ')})</div>`;
  }

  tip.innerHTML = `
    <b>${fmtTenure(m) || 'Start (Day 0)'}</b><br>
    <span style="color:var(--accent-a)">Invested:</span> <strong>${fmt(s.inv)}</strong><br>
    <span style="color:var(--accent-green)">Gross Value:</span> <strong>${fmt(s.gross)}</strong><br>
    <span style="color:var(--accent-c)">Real (Inflation-Adj):</span> <strong>${fmt(s.real)}</strong>
    ${extraHtml}
  `;
  tip.style.opacity = 1;

  const tipWidth = 200;
  let tx = geo.x(m) + 14;
  if (tx + tipWidth > cv.clientWidth) {
    tx = geo.x(m) - tipWidth - 14;
  }
  tip.style.left = Math.max(10, tx) + 'px';
  tip.style.top = Math.max(10, (e.clientY - r.top - 20)) + 'px';
});

cv.addEventListener('mouseleave', () => {
  tip.style.opacity = 0;
  draw();
});

window.addEventListener('resize', () => draw());

// --------------------------------------------------------------------------
// Initialization
// --------------------------------------------------------------------------
initTheme();
renderBoostsList();
setStrategyMode('sip');
setTaxMode('equity');
setAppMode('forward');
syncTenurePresetUI(10);
