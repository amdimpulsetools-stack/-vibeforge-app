import type {
  InsuranceCoverageQuote,
  OrganizationInsuranceCarrierWithName,
} from "@/types/insurance";

/**
 * Pure calculator: given a service price, a list of carriers the patient is
 * affiliated with, and the set of (carrier × service) coverage pairs, returns
 * one quote per carrier so the UI can render the available options. The quote
 * for a non-covering carrier has coverage_percent = 0 and patient_copay equal
 * to the full base price — useful when the user wants to see why "Particular"
 * is the only viable option.
 */
export function calculateCoverageQuotes(args: {
  basePrice: number;
  serviceId: string;
  patientCarriers: OrganizationInsuranceCarrierWithName[];
  coverageMap: Record<string, Set<string>>;
}): InsuranceCoverageQuote[] {
  const { basePrice, serviceId, patientCarriers, coverageMap } = args;
  return patientCarriers.map((carrier) => {
    const covered = coverageMap[carrier.id]?.has(serviceId) ?? false;
    const pct = covered ? carrier.coverage_percent : 0;
    const insuranceAmount = round2((basePrice * pct) / 100);
    const copay = round2(basePrice - insuranceAmount);
    return {
      carrier,
      covered,
      coverage_percent: pct,
      insurance_amount: insuranceAmount,
      patient_copay: copay,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
