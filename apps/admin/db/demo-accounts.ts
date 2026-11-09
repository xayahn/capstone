/**
 * Local demonstration accounts. Seeded ONLY when NODE_ENV is not "production"
 * (local development) and always with synthetic data. Documented in
 * docs/STAFF_AUTHENTICATION.md and docs/DEMO_DATA.md.
 */
export const LOCAL_DEMO_PASSWORD = 'ParishLink2026!';
/** @deprecated kept for older imports; use LOCAL_DEMO_PASSWORD */
export const LOCAL_DEMO_STAFF_PASSWORD = LOCAL_DEMO_PASSWORD;

export type DemoStaffAccount = { userId: string; email: string; role: 'system_admin' | 'parish_staff' | 'clergy'; label: string };

export const LOCAL_DEMO_STAFF_ACCOUNTS: readonly DemoStaffAccount[] = [
  { userId: 'user-admin-demo', email: 'admin@parishlink.test', role: 'system_admin', label: 'System administrator (vicariate-wide)' },
  { userId: 'user-staff-cathedral', email: 'staff.cathedral@parishlink.test', role: 'parish_staff', label: 'Parish staff, Metropolitan Cathedral' },
  { userId: 'user-staff-sanguillermo', email: 'staff.sanguillermo@parishlink.test', role: 'parish_staff', label: 'Parish staff, San Guillermo Parish' },
  { userId: 'user-staff-sanctuario', email: 'staff.sanctuario@parishlink.test', role: 'parish_staff', label: 'Parish staff, Sanctuario de San Jose Parish' },
  { userId: 'user-staff-stalucia', email: 'staff.stalucia@parishlink.test', role: 'parish_staff', label: 'Parish staff, Sta. Lucia Parish' },
  { userId: 'user-staff-stonino', email: 'staff.stonino@parishlink.test', role: 'parish_staff', label: 'Parish staff, Sto. Niño Parish' },
  { userId: 'user-staff-sanisidro', email: 'staff.sanisidro@parishlink.test', role: 'parish_staff', label: 'Parish staff, San Isidro Labrador Parish' },
  { userId: 'user-staff-stjoseph', email: 'staff.stjoseph@parishlink.test', role: 'parish_staff', label: 'Parish staff, St. Joseph Parish' },
  { userId: 'user-staff-lourdes', email: 'staff.lourdes@parishlink.test', role: 'parish_staff', label: 'Parish staff, Shrine of Our Lady of Lourdes' },
  { userId: 'user-clergy-dizon', email: 'dizon@example.test', role: 'clergy', label: 'Clergy, Msgr. R. Dizon (Metropolitan Cathedral)' },
  { userId: 'user-clergy-manalo', email: 'manalo@example.test', role: 'clergy', label: 'Clergy, Fr. A. Manalo (San Guillermo Parish)' },
  { userId: 'user-clergy-pineda', email: 'pineda@example.test', role: 'clergy', label: 'Clergy, Fr. M. Pineda (Sta. Lucia Parish)' },
];

export type DemoParishionerAccount = { userId: string; email: string; label: string };

/** Parishioner accounts that can sign in to the mobile app with LOCAL_DEMO_PASSWORD. */
export const LOCAL_DEMO_PARISHIONER_ACCOUNTS: readonly DemoParishionerAccount[] = [
  { userId: 'parishioner-01', email: 'liza.gomez@example.test', label: 'Liza Gomez (Metropolitan Cathedral)' },
  { userId: 'parishioner-04', email: 'ronald.dizon@example.test', label: 'Ronald Dizon (San Guillermo Parish)' },
  { userId: 'parishioner-10', email: 'angela.reyes@example.test', label: 'Angela Reyes (Sta. Lucia Parish)' },
  { userId: 'parishioner-02', email: 'paolo.garcia@example.test', label: 'Paolo Garcia (Metropolitan Cathedral)' },
];
