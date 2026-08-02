export const defaultCompanyCode = "1000";

export function initialCompanyCode(availableCompanyCodes: readonly string[] = [defaultCompanyCode]) {
  return availableCompanyCodes.length === 1 ? availableCompanyCodes[0] : defaultCompanyCode;
}
