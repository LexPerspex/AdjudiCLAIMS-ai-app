'use client';

import { useState } from 'react';
import Link from 'next/link';

const GRAD = 'linear-gradient(135deg, #00288e 0%, #1e40af 100%)';

const DEFAULTS = {
  examiners: 10,
  hourlyRate: 45,
  claimsPerExaminer: 150,
  currentMissRate: 8,
};

function fmt(n: number, prefix = '$'): string {
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`;
  return `${prefix}${n.toFixed(0)}`;
}

function fmtHrs(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K hrs`;
  return `${n.toFixed(0)} hrs`;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, display, hint, onChange }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-7">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold" style={{ color: '#131b2e' }}>{label}</span>
        <span className="text-base font-extrabold" style={{ color: '#00288e' }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => { onChange(Number(e.target.value)); }}
        className="w-full h-1.5 rounded-full outline-none cursor-pointer appearance-none"
        style={{
          background: `linear-gradient(90deg, #00288e ${String(pct)}%, #c4c5d5 ${String(pct)}%)`,
          WebkitAppearance: 'none',
        }}
      />
      <p className="text-xs mt-1" style={{ color: '#444653' }}>{hint}</p>
    </div>
  );
}

export default function RoiCalculatorPage() {
  const [examiners, setExaminers] = useState(DEFAULTS.examiners);
  const [hourlyRate, setHourlyRate] = useState(DEFAULTS.hourlyRate);
  const [claimsPerExaminer, setClaimsPerExaminer] = useState(DEFAULTS.claimsPerExaminer);
  const [currentMissRate, setCurrentMissRate] = useState(DEFAULTS.currentMissRate);

  // Calculations
  const timeSavedPerExaminerWeekly = 1.75; // hrs/week (midpoint of 1.5-2hr range)
  const annualHoursSaved = examiners * timeSavedPerExaminerWeekly * 52;
  const annualCostSavedTime = annualHoursSaved * hourlyRate;

  const totalClaims = examiners * claimsPerExaminer;
  const penaltyAvoidedClaims = Math.floor(totalClaims * (currentMissRate / 100) * 0.85);
  const avgPenaltyPerClaim = 650;
  const annualPenaltySaved = penaltyAvoidedClaims * avgPenaltyPerClaim;

  const totalAnnualSavings = annualCostSavedTime + annualPenaltySaved;
  const monthlySavings = totalAnnualSavings / 12;

  return (
    <>
      {/* Hero */}
      <section style={{ background: GRAD }} className="text-white py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
            ROI Calculator
          </div>
          <h1 className="font-extrabold tracking-tight mb-4" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
            Calculate Your ROI
          </h1>
          <p className="text-lg" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Adjust the inputs for your claims operation. See the time savings and penalty avoidance potential in real time.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="py-16 px-6" style={{ background: '#faf8ff' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

            {/* Inputs */}
            <div className="lg:col-span-2 bg-white rounded-xl p-8 border sticky top-20" style={{ border: '1px solid #c4c5d5', boxShadow: '0 20px 40px rgba(15,23,42,0.06)' }}>
              <h2 className="text-lg font-extrabold mb-1">Your Operation</h2>
              <p className="text-sm mb-8" style={{ color: '#444653' }}>Adjust the sliders to match your team size and current performance.</p>

              <Slider
                label="Number of Examiners"
                value={examiners}
                min={1} max={100} step={1}
                display={String(examiners)}
                hint="Full-time claims examiners on staff"
                onChange={setExaminers}
              />
              <Slider
                label="Avg. Hourly Rate (fully loaded)"
                value={hourlyRate}
                min={25} max={100} step={5}
                display={`$${String(hourlyRate)}/hr`}
                hint="Include salary, benefits, overhead"
                onChange={setHourlyRate}
              />
              <Slider
                label="Open Claims per Examiner"
                value={claimsPerExaminer}
                min={50} max={250} step={10}
                display={String(claimsPerExaminer)}
                hint="Industry average: 125–175"
                onChange={setClaimsPerExaminer}
              />
              <Slider
                label="Current Deadline Miss Rate"
                value={currentMissRate}
                min={1} max={25} step={1}
                display={`${String(currentMissRate)}%`}
                hint="% of deadlines missed monthly (industry avg: 5–12%)"
                onChange={setCurrentMissRate}
              />

              <button
                onClick={() => { setExaminers(DEFAULTS.examiners); setHourlyRate(DEFAULTS.hourlyRate); setClaimsPerExaminer(DEFAULTS.claimsPerExaminer); setCurrentMissRate(DEFAULTS.currentMissRate); }}
                className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ background: '#f2f3ff', border: '1px solid #c4c5d5', color: '#444653' }}
              >
                Reset to defaults
              </button>
            </div>

            {/* Outputs */}
            <div className="lg:col-span-3 flex flex-col gap-5">
              {/* Top 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="bg-white rounded-xl p-6 border-l-4" style={{ border: '1px solid #c4c5d5', borderLeft: '4px solid #00288e' }}>
                  <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#444653' }}>Time Savings (Annual)</div>
                  <div className="text-4xl font-extrabold mb-1" style={{ color: '#00288e' }}>{fmtHrs(annualHoursSaved)}</div>
                  <div className="text-sm" style={{ color: '#444653' }}>{timeSavedPerExaminerWeekly} hrs/week × {examiners} examiners × 52 weeks</div>
                  <div className="text-xs mt-2 italic" style={{ color: 'rgba(0,40,142,0.5)' }}>Source: 1.5–2hr/week per examiner (AI-assisted document review)</div>
                </div>
                <div className="bg-white rounded-xl p-6 border-l-4" style={{ border: '1px solid #c4c5d5', borderLeft: '4px solid #059669' }}>
                  <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#059669' }}>Time Cost Saved (Annual)</div>
                  <div className="text-4xl font-extrabold mb-1" style={{ color: '#059669' }}>{fmt(annualCostSavedTime)}</div>
                  <div className="text-sm" style={{ color: '#444653' }}>{fmtHrs(annualHoursSaved)} × ${hourlyRate}/hr fully loaded</div>
                  <div className="text-xs mt-2 italic" style={{ color: 'rgba(5,150,105,0.6)' }}>Based on fully-loaded hourly cost</div>
                </div>
              </div>

              {/* Penalty avoidance */}
              <div className="bg-white rounded-xl p-6 border-l-4" style={{ border: '1px solid #c4c5d5', borderLeft: '4px solid #d97706' }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#d97706' }}>Penalty Avoidance (Annual Est.)</div>
                <div className="text-4xl font-extrabold mb-1" style={{ color: '#d97706' }}>{fmt(annualPenaltySaved)}</div>
                <div className="text-sm" style={{ color: '#444653' }}>
                  {penaltyAvoidedClaims} fewer penalty events × avg {fmt(avgPenaltyPerClaim)} per event
                </div>
                <div className="text-xs mt-2 italic" style={{ color: 'rgba(217,119,6,0.6)' }}>
                  LC 4650(c) 10% penalty on overdue TD payments. Based on {currentMissRate}% current miss rate, 85% reduction with AdjudiCLAIMS
                </div>
              </div>

              {/* Total */}
              <div className="rounded-xl p-7 text-white" style={{ background: GRAD }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.75)' }}>Total Annual Value</div>
                <div className="text-5xl font-extrabold mb-2">{fmt(totalAnnualSavings)}</div>
                <div style={{ color: 'rgba(255,255,255,0.8)' }}>
                  {fmt(monthlySavings)}/month · {fmt(annualCostSavedTime)} time savings + {fmt(annualPenaltySaved)} penalty avoidance
                </div>
              </div>

              {/* Claims volume context */}
              <div className="bg-white rounded-xl p-6 border" style={{ border: '1px solid #c4c5d5' }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#444653' }}>Your Portfolio at a Glance</div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-extrabold mb-0.5" style={{ color: '#00288e' }}>{totalClaims.toLocaleString()}</div>
                    <div className="text-xs" style={{ color: '#444653' }}>Total Open Claims</div>
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold mb-0.5" style={{ color: '#d97706' }}>{Math.floor(totalClaims * currentMissRate / 100)}</div>
                    <div className="text-xs" style={{ color: '#444653' }}>Estimated Monthly Deadline Misses</div>
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold mb-0.5" style={{ color: '#059669' }}>&gt;98%</div>
                    <div className="text-xs" style={{ color: '#444653' }}>Target Compliance Rate</div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <Link href="/contact" className="inline-block text-white font-bold px-8 py-3 rounded-lg no-underline hover:opacity-90 transition-opacity"
                  style={{ background: GRAD }}>
                  Get Accurate Numbers for Your Team →
                </Link>
              </div>
            </div>
          </div>

          {/* Assumptions */}
          <div className="mt-12 bg-white rounded-xl border overflow-hidden" style={{ border: '1px solid #c4c5d5' }}>
            <div className="px-7 py-4 border-b" style={{ background: '#f2f3ff', borderColor: '#c4c5d5' }}>
              <h3 className="font-bold text-sm">Model Assumptions &amp; Sources</h3>
            </div>
            <div className="p-7">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ background: '#c4c5d5' }}>
                {[
                  { label: 'Time savings per examiner', value: '1.5–2 hrs/week', source: 'AI-assisted document review, auto-population of claim fields, instant benefit calculations' },
                  { label: 'Average TD penalty', value: '$650/event', source: 'LC 4650(c): 10% of overdue payment. Based on avg TD payment of $6,500 (2/3 AWE at CA median wage)' },
                  { label: 'Compliance improvement', value: '85% reduction', source: 'Automated deadline tracking with statutory consequences shown at each milestone' },
                  { label: 'Fully-loaded hourly rate', value: '$25–$100/hr', source: 'Salary + benefits + overhead. CA claims examiner median salary ~$72K = ~$34.6/hr loaded to ~$45-55/hr' },
                  { label: 'Claims per examiner', value: '125–175 avg', source: 'California Workers\' Compensation industry benchmark' },
                  { label: 'Examiner miss rate', value: '5–12% monthly', source: 'Industry estimates. Varies significantly by org maturity and system quality' },
                ].map((a) => (
                  <div key={a.label} className="p-5 bg-white">
                    <div className="text-xs font-bold mb-1" style={{ color: '#444653' }}>{a.label}</div>
                    <div className="font-extrabold mb-1" style={{ color: '#00288e' }}>{a.value}</div>
                    <div className="text-xs" style={{ color: '#444653' }}>{a.source}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-4" style={{ color: '#444653' }}>
                This calculator provides estimates only. Actual results will vary based on your specific operation, claim mix, and implementation. Contact us for a custom analysis based on your actual data.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
