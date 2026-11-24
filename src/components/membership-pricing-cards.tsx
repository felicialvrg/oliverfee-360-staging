import Link from 'next/link';
import {firstYearMonthlyCents} from '@/lib/sales/assistance';
import {PLANS,money} from '@/lib/sales/types';

export function MembershipPricingCards({headingId}: {headingId: string}) {
  return <div className="plans-grid" aria-labelledby={headingId} data-membership-pricing>
    {Object.entries(PLANS).map(([name,plan]) => <section key={name} className={`card plan-card ${name==='Ultimate'?'featured':''}`}>
      <span className="eyebrow">{name}</span>
      <p className="muted">First 12 months</p>
      <p className="plan-price">{money(firstYearMonthlyCents[name as keyof typeof firstYearMonthlyCents])}<small> / month</small></p>
      <p className="muted">After 12 months: <strong>{money(plan.cents)} / month</strong></p>
      <ul><li>Carrier compliance workspace</li><li>Document organization</li><li>Plan scope confirmed during review</li><li>UCR assistance included; UCR registration fees separate</li></ul>
      <Link href="/carrier-setup" className="btn-secondary">Request a plan review ↗</Link>
    </section>)}
  </div>;
}
