export type VATResult = { rate: number; amount: number; label: string };

const EU_COUNTRIES = new Set([
  "GERMANY", "FRANCE", "ITALY", "SPAIN", "NETHERLANDS", "BELGIUM", "SWEDEN",
  "AUSTRIA", "DENMARK", "FINLAND", "IRELAND", "LUXEMBOURG", "PORTUGAL",
  "CZECH REPUBLIC", "POLAND", "ROMANIA", "HUNGARY", "SLOVAKIA", "SLOVENIA",
  "BULGARIA", "CROATIA", "CYPRUS", "ESTONIA", "GREECE", "LATVIA", "LITHUANIA",
  "MALTA",
]);

export function calculateVAT(country: string, subtotal: number): VATResult {
  const upper = country.toUpperCase();

  let rate = 0;
  let label = "No tax";

  if (upper === "NIGERIA") {
    rate = 0.075;
    label = "VAT (7.5%)";
  } else if (upper === "UNITED KINGDOM" || EU_COUNTRIES.has(upper)) {
    rate = 0.2;
    label = "VAT (20%)";
  }

  return { rate, amount: subtotal * rate, label };
}
