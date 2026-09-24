/**
 * MOCK of the DPIIT startup-recognition registry.
 * Production: replace lookupDpiit() with a call to the real DPIIT/Startup India verification API.
 */
const RECOGNISED = new Set(['DIPP145872', 'DIPP098311', 'DIPP201544']);

export async function lookupDpiit(dpiitNumber: string | null): Promise<{ verified: boolean; source: string }> {
  return {
    verified: !!dpiitNumber && RECOGNISED.has(dpiitNumber),
    source: 'MOCK_DPIIT_REGISTRY',
  };
}
