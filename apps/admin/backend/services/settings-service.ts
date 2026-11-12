import { getRawDb } from '@/db/runtime';
import { AdminServiceError } from '@/backend/services/admin-error';
import { validPhoneNumber } from '@/shared/validation';
import type {
  Actor,
  AdminMutation,
  ParishProfile,
  RequirementSetting,
  ServiceSetting,
} from '@/shared/domain';

function cleanPlainText(
  value: string | null | undefined,
  label: string,
  min: number,
  max: number,
  singleLine = false,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new AdminServiceError(`${label} must be text.`);
  const withoutControls = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  const normalized = singleLine ? withoutControls.replace(/\s+/g, ' ').trim() : withoutControls.trim();
  if (!normalized) return null;
  if (/<[a-z!/]/i.test(normalized)) {
    throw new AdminServiceError(`${label} must be plain text without HTML markup.`);
  }
  if (normalized.length < min || normalized.length > max) {
    throw new AdminServiceError(`${label} must be ${min}–${max} characters.`);
  }
  return normalized;
}

async function recordSettingAudit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  parishId: string | null,
  detail: string,
): Promise<void> {
  await getRawDb()
    .prepare(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
       VALUES (?, ?, ?, ?, ?, ?, 'success', ?)`,
    )
    .bind(crypto.randomUUID(), actor.id, action, entityType, entityId, parishId, detail.slice(0, 1000))
    .run();
}

export async function loadParishProfiles(actor: Actor): Promise<ParishProfile[]> {
  const db = getRawDb();
  const query =
    actor.role === 'system_admin'
      ? db.prepare(
          `SELECT id, name, address, office_hours AS officeHours, contact_phone AS contactPhone,
             contact_email AS contactEmail, description
           FROM parishes WHERE is_active = 1 ORDER BY name`,
        )
      : db
          .prepare(
            `SELECT id, name, address, office_hours AS officeHours, contact_phone AS contactPhone,
               contact_email AS contactEmail, description
             FROM parishes WHERE id = ? AND is_active = 1`,
          )
          .bind(actor.parishId);
  const result = await query.all<ParishProfile>();
  return result.results;
}

export async function loadServiceSettings(): Promise<ServiceSetting[]> {
  const db = getRawDb();
  const [servicesResult, requirementsResult] = await Promise.all([
    db
      .prepare(
        `SELECT id, slug, name, duration_minutes AS durationMinutes,
           buffer_before_minutes AS bufferBeforeMinutes,
           buffer_after_minutes AS bufferAfterMinutes,
           description, is_active AS isActive
         FROM service_types
         ORDER BY CASE id
           WHEN 'baptism' THEN 1
           WHEN 'wedding' THEN 2
           WHEN 'confirmation' THEN 3
           WHEN 'first-communion' THEN 4
           WHEN 'funeral-mass' THEN 5
           ELSE 99
         END, name`,
      )
      .all<{
        id: string;
        slug: string;
        name: string;
        durationMinutes: number;
        bufferBeforeMinutes: number;
        bufferAfterMinutes: number;
        description: string | null;
        isActive: number;
      }>(),
    db
      .prepare(
        `SELECT id, service_type_id AS serviceTypeId, name, instructions,
           is_required AS isRequired, sort_order AS sortOrder, is_active AS isActive
         FROM document_requirements
         ORDER BY service_type_id, sort_order ASC, name ASC`,
      )
      .all<{
        id: string;
        serviceTypeId: string;
        name: string;
        instructions: string | null;
        isRequired: number;
        sortOrder: number;
        isActive: number;
      }>(),
  ]);

  const requirementsByService = new Map<string, RequirementSetting[]>();
  for (const row of requirementsResult.results) {
    const list = requirementsByService.get(row.serviceTypeId) ?? [];
    list.push({
      id: row.id,
      serviceTypeId: row.serviceTypeId,
      name: row.name,
      instructions: row.instructions,
      isRequired: Boolean(row.isRequired),
      sortOrder: Number(row.sortOrder),
      isActive: Boolean(row.isActive),
    });
    requirementsByService.set(row.serviceTypeId, list);
  }

  return servicesResult.results.map((service) => ({
    id: service.id,
    slug: service.slug,
    name: service.name,
    durationMinutes: Number(service.durationMinutes),
    bufferBeforeMinutes: Number(service.bufferBeforeMinutes),
    bufferAfterMinutes: Number(service.bufferAfterMinutes),
    description: service.description,
    isActive: Boolean(service.isActive),
    requirements: requirementsByService.get(service.id) ?? [],
  }));
}

export async function updateParishProfile(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'parish.profile.update' }>,
): Promise<string> {
  if (actor.role === 'clergy') {
    throw new AdminServiceError('Parish directory updates are limited to parish staff and system administrators.', 403);
  }
  if (actor.role !== 'system_admin' && (!actor.parishId || actor.parishId !== mutation.parishId)) {
    throw new AdminServiceError('You can only update your assigned parish profile.', 403);
  }

  const db = getRawDb();
  const parish = await db
    .prepare('SELECT id, name FROM parishes WHERE id = ? AND is_active = 1')
    .bind(mutation.parishId)
    .first<{ id: string; name: string }>();
  if (!parish) throw new AdminServiceError('Parish not found.', 404);

  const address = cleanPlainText(mutation.address, 'Parish address', 4, 240, true);
  const officeHours = cleanPlainText(mutation.officeHours, 'Office hours', 4, 160, true);
  const contactPhone = cleanPlainText(mutation.contactPhone, 'Contact phone', 10, 24, true);
  if (contactPhone && !validPhoneNumber(contactPhone)) {
    throw new AdminServiceError('Enter a valid parish phone number with area or country code (for example, +63 (045) 555-0101).');
  }
  const rawEmail = cleanPlainText(mutation.contactEmail, 'Contact email', 5, 254, true);
  const contactEmail = rawEmail ? rawEmail.toLowerCase() : null;
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) {
    throw new AdminServiceError('Enter a valid parish email address.');
  }
  const description = cleanPlainText(mutation.description, 'Parish description', 8, 500, false);

  await db
    .prepare(
      `UPDATE parishes
       SET address = ?, office_hours = ?, contact_phone = ?, contact_email = ?, description = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(address, officeHours, contactPhone, contactEmail, description, parish.id)
    .run();

  await recordSettingAudit(
    actor,
    'parish.profile.update',
    'parish',
    parish.id,
    parish.id,
    `${parish.name} public directory updated`,
  );
  return parish.id;
}

export async function updateServiceSetting(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'service.update' }>,
): Promise<string> {
  if (actor.role !== 'system_admin') {
    throw new AdminServiceError('Only system administrators can change sacrament scheduling rules.', 403);
  }
  if (!Number.isInteger(mutation.durationMinutes) || mutation.durationMinutes < 15 || mutation.durationMinutes > 360) {
    throw new AdminServiceError('Sacrament duration must be a whole number from 15 to 360 minutes.');
  }
  if (!Number.isInteger(mutation.bufferBeforeMinutes) || mutation.bufferBeforeMinutes < 0 || mutation.bufferBeforeMinutes > 120) {
    throw new AdminServiceError('Preparation buffer before must be 0 to 120 minutes.');
  }
  if (!Number.isInteger(mutation.bufferAfterMinutes) || mutation.bufferAfterMinutes < 0 || mutation.bufferAfterMinutes > 120) {
    throw new AdminServiceError('Cleanup buffer after must be 0 to 120 minutes.');
  }
  if (typeof mutation.isActive !== 'boolean') {
    throw new AdminServiceError('Sacrament availability must be active or paused.');
  }
  const description = cleanPlainText(mutation.description, 'Sacrament description', 4, 500, false);

  const db = getRawDb();
  const service = await db
    .prepare('SELECT id, name FROM service_types WHERE id = ?')
    .bind(mutation.serviceTypeId)
    .first<{ id: string; name: string }>();
  if (!service) throw new AdminServiceError('Sacramental service not found.', 404);

  if (!mutation.isActive) {
    const remaining = await db
      .prepare('SELECT COUNT(*) AS count FROM service_types WHERE is_active = 1 AND id <> ?')
      .bind(service.id)
      .first<{ count: number }>();
    if (Number(remaining?.count ?? 0) < 1) {
      throw new AdminServiceError('At least one sacramental service must remain active.', 409);
    }
  }

  await db
    .prepare(
      `UPDATE service_types
       SET duration_minutes = ?, buffer_before_minutes = ?, buffer_after_minutes = ?,
           description = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(
      mutation.durationMinutes,
      mutation.bufferBeforeMinutes,
      mutation.bufferAfterMinutes,
      description,
      mutation.isActive ? 1 : 0,
      service.id,
    )
    .run();

  await recordSettingAudit(
    actor,
    'service.update',
    'service_type',
    service.id,
    null,
    `${service.name}: ${mutation.durationMinutes}m, buffers ${mutation.bufferBeforeMinutes}/${mutation.bufferAfterMinutes}m, ${mutation.isActive ? 'active' : 'paused'}`,
  );
  return service.id;
}

export async function createRequirementSetting(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'requirement.create' }>,
): Promise<string> {
  if (actor.role !== 'system_admin') {
    throw new AdminServiceError('Only system administrators can manage documentary requirements.', 403);
  }
  const name = cleanPlainText(mutation.name, 'Requirement name', 3, 120, true);
  if (!name) throw new AdminServiceError('Requirement name is required.');
  const instructions = cleanPlainText(mutation.instructions, 'Requirement instructions', 4, 500, false);
  if (typeof mutation.isRequired !== 'boolean') {
    throw new AdminServiceError('Specify whether the requirement is mandatory or optional.');
  }

  const db = getRawDb();
  const service = await db
    .prepare('SELECT id, name FROM service_types WHERE id = ?')
    .bind(mutation.serviceTypeId)
    .first<{ id: string; name: string }>();
  if (!service) throw new AdminServiceError('Sacramental service not found.', 404);

  const duplicate = await db
    .prepare('SELECT id FROM document_requirements WHERE service_type_id = ? AND lower(name) = lower(?) LIMIT 1')
    .bind(service.id, name)
    .first<{ id: string }>();
  if (duplicate) {
    throw new AdminServiceError('That sacrament already lists a requirement with this name.', 409);
  }

  let sortOrder: number;
  if (mutation.sortOrder !== undefined) {
    if (!Number.isInteger(mutation.sortOrder) || mutation.sortOrder < 0 || mutation.sortOrder > 999) {
      throw new AdminServiceError('Requirement order must be a whole number from 0 to 999.');
    }
    sortOrder = mutation.sortOrder;
  } else {
    const maxRow = await db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM document_requirements WHERE service_type_id = ?')
      .bind(service.id)
      .first<{ maxOrder: number }>();
    sortOrder = Math.min(999, Number(maxRow?.maxOrder ?? 0) + 1);
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO document_requirements
         (id, service_type_id, name, instructions, is_required, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(id, service.id, name, instructions, mutation.isRequired ? 1 : 0, sortOrder)
    .run();

  await recordSettingAudit(
    actor,
    'requirement.create',
    'document_requirement',
    id,
    null,
    `${service.name}: ${name} (${mutation.isRequired ? 'required' : 'optional'})`,
  );
  return id;
}

export async function updateRequirementSetting(
  actor: Actor,
  mutation: Extract<AdminMutation, { action: 'requirement.update' }>,
): Promise<string> {
  if (actor.role !== 'system_admin') {
    throw new AdminServiceError('Only system administrators can manage documentary requirements.', 403);
  }
  const name = cleanPlainText(mutation.name, 'Requirement name', 3, 120, true);
  if (!name) throw new AdminServiceError('Requirement name is required.');
  const instructions = cleanPlainText(mutation.instructions, 'Requirement instructions', 4, 500, false);
  if (typeof mutation.isRequired !== 'boolean') {
    throw new AdminServiceError('Specify whether the requirement is mandatory or optional.');
  }
  if (!Number.isInteger(mutation.sortOrder) || mutation.sortOrder < 0 || mutation.sortOrder > 999) {
    throw new AdminServiceError('Requirement order must be a whole number from 0 to 999.');
  }
  if (typeof mutation.isActive !== 'boolean') {
    throw new AdminServiceError('Requirement state must be active or inactive.');
  }

  const db = getRawDb();
  const current = await db
    .prepare(
      `SELECT dr.id, dr.service_type_id AS serviceTypeId, st.name AS serviceName
       FROM document_requirements dr
       JOIN service_types st ON st.id = dr.service_type_id
       WHERE dr.id = ?`,
    )
    .bind(mutation.requirementId)
    .first<{ id: string; serviceTypeId: string; serviceName: string }>();
  if (!current) throw new AdminServiceError('Documentary requirement not found.', 404);

  const duplicate = await db
    .prepare(
      'SELECT id FROM document_requirements WHERE service_type_id = ? AND id <> ? AND lower(name) = lower(?) LIMIT 1',
    )
    .bind(current.serviceTypeId, current.id, name)
    .first<{ id: string }>();
  if (duplicate) {
    throw new AdminServiceError('That sacrament already lists another requirement with this name.', 409);
  }

  await db
    .prepare(
      `UPDATE document_requirements
       SET name = ?, instructions = ?, is_required = ?, sort_order = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(name, instructions, mutation.isRequired ? 1 : 0, mutation.sortOrder, mutation.isActive ? 1 : 0, current.id)
    .run();

  await recordSettingAudit(
    actor,
    'requirement.update',
    'document_requirement',
    current.id,
    null,
    `${current.serviceName}: ${name} (${mutation.isActive ? (mutation.isRequired ? 'required' : 'optional') : 'inactive'})`,
  );
  return current.id;
}
