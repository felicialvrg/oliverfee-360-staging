export function saferLookupUrl(usdot?: string | null) {
  const dot = usdot?.trim();
  if (!dot || !/^\d{1,12}$/.test(dot)) return 'https://safer.fmcsa.dot.gov/CompanySnapshot.aspx';
  return `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(dot)}`;
}

export function FederalLookups({usdot}: {usdot?: string | null}) {
  const url = saferLookupUrl(usdot);
  const carrierSpecific = url.includes('query_string=');
  return <nav aria-label="Official federal carrier lookups" className="sales-actions">
    <a className="btn" href="https://motus.dot.gov/public/search" target="_blank" rel="noopener noreferrer">FMCSA Lookup</a>
    <a className="btn" href={url} target="_blank" rel="noopener noreferrer">{carrierSpecific ? `SAFER: USDOT ${usdot!.trim()}` : 'SAFER Lookup'}</a>
  </nav>;
}
