/**
 * Baseline service catalogue taken from the capstone paper: the eight parishes of
 * the Vicariate of St. John Mary Vianney and the five sacramental services with
 * their documentary requirements. Seeded once; later edits made through the
 * admin Settings module are never overwritten.
 */
export const PARISHES = [
  ['metropolitan-cathedral', 'metropolitan-cathedral', 'Metropolitan Cathedral of San Fernando'],
  ['san-guillermo', 'san-guillermo', 'San Guillermo Parish'],
  ['sanctuario-san-jose', 'sanctuario-san-jose', 'Sanctuario de San Jose Parish'],
  ['sta-lucia', 'sta-lucia', 'Sta. Lucia Parish'],
  ['sto-nino', 'sto-nino', 'Sto. Niño Parish'],
  ['san-isidro-labrador', 'san-isidro-labrador', 'San Isidro Labrador Parish'],
  ['st-joseph', 'st-joseph', 'St. Joseph Parish'],
  ['our-lady-of-lourdes', 'our-lady-of-lourdes', 'Archdiocesan Shrine of Our Lady of Lourdes'],
] as const;

/** [id, slug, name, duration minutes, buffer before, buffer after] */
export const SERVICES = [
  ['baptism', 'baptism', 'Baptism', 60, 15, 15],
  ['wedding', 'wedding', 'Wedding', 90, 30, 30],
  ['confirmation', 'confirmation', 'Confirmation', 60, 15, 15],
  ['first-communion', 'first-communion', 'First Communion', 60, 15, 15],
  ['funeral-mass', 'funeral-mass', 'Funeral Mass', 45, 15, 15],
] as const;

/** [id, service id, name, sort order] */
export const REQUIREMENTS = [
  ['baptism-birth', 'baptism', "Child's PSA Birth Certificate", 1],
  ['baptism-marriage', 'baptism', "Parents' Marriage Certificate (if married in Church)", 2],
  ['baptism-permission', 'baptism', 'Baptismal permission letter (if outside home parish)', 3],
  ['baptism-godparent', 'baptism', 'Godparent qualification form', 4],
  ['wedding-birth', 'wedding', 'PSA Birth Certificates (bride & groom)', 1],
  ['wedding-cenomar', 'wedding', 'CENOMAR', 2],
  ['wedding-sacraments', 'wedding', 'Baptismal & Confirmation Certificates', 3],
  ['wedding-license', 'wedding', 'Marriage License', 4],
  ['wedding-precana', 'wedding', 'Pre-Cana Seminar Certificate', 5],
  ['wedding-banns', 'wedding', 'Marriage Banns', 6],
  ['confirmation-baptismal', 'confirmation', 'Baptismal Certificate', 1],
  ['confirmation-class', 'confirmation', 'Catechism / Confirmation Class Certificate', 2],
  ['communion-baptismal', 'first-communion', 'Baptismal Certificate', 1],
  ['communion-catechism', 'first-communion', 'Catechism Attendance Record', 2],
  ['funeral-death', 'funeral-mass', 'Death Certificate', 1],
  ['funeral-burial', 'funeral-mass', 'Certificate of Burial Permit', 2],
  ['funeral-baptismal', 'funeral-mass', 'Baptismal Certificate (deceased, if available)', 3],
] as const;

/** Insert the catalogue only where rows are missing (never overwrites administrator edits). */
export function catalogStatements(db: D1Database): D1PreparedStatement[] {
  return [
    ...PARISHES.map((parish) => db.prepare('INSERT OR IGNORE INTO parishes (id, slug, name) VALUES (?, ?, ?)').bind(...parish)),
    ...SERVICES.map((service) => db.prepare(`INSERT OR IGNORE INTO service_types
      (id, slug, name, duration_minutes, buffer_before_minutes, buffer_after_minutes) VALUES (?, ?, ?, ?, ?, ?)`).bind(...service)),
    ...REQUIREMENTS.map((requirement) => db.prepare(`INSERT OR IGNORE INTO document_requirements
      (id, service_type_id, name, sort_order) VALUES (?, ?, ?, ?)`).bind(...requirement)),
  ];
}
