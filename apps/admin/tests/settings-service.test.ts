import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { d1, migratedDatabase } from './helpers/d1';

const { runtime } = vi.hoisted(() => ({
  runtime: {
    getRawDb: vi.fn(),
    ensureRuntimeDatabase: vi.fn(async () => {}),
    ensurePublicRuntimeDatabase: vi.fn(async () => {}),
  },
}));
vi.mock('cloudflare:workers', () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock('../db/runtime', () => runtime);
vi.mock('@/db/runtime', () => runtime);

import { loadDashboardState, performAdminMutation } from '../backend/services/admin-service';
import { createMobileAppointment, loadMobileCatalog, searchMobileAvailability } from '../backend/services/mobile-service';
import type { MobileActor } from '../backend/auth/mobile-auth';
import type { Actor } from '../shared/domain';

let sql: DatabaseSync;
const DAY = 86_400_000;
const futureManilaDate = (daysAhead: number) =>
  new Date(Date.now() + 8 * 3_600_000 + daysAhead * DAY).toISOString().slice(0, 10);

const sysAdmin: Actor = {
  id: 'admin-1',
  name: 'Ana Fernandez',
  email: 'admin@example.test',
  role: 'system_admin',
  parishId: null,
  parishName: 'Vicariate-wide',
  clergyProfileId: null,
};
const staffP1: Actor = {
  id: 'staff-1',
  name: 'Elena Gomez',
  email: 'staff1@example.test',
  role: 'parish_staff',
  parishId: 'san-guillermo',
  parishName: 'San Guillermo Parish',
  clergyProfileId: null,
};
const staffP2: Actor = {
  id: 'staff-2',
  name: 'Ramon Cruz',
  email: 'staff2@example.test',
  role: 'parish_staff',
  parishId: 'sta-lucia',
  parishName: 'Sta. Lucia Parish',
  clergyProfileId: null,
};
const clergyP1: Actor = {
  id: 'clergy-1',
  name: 'Fr. Manalo',
  email: 'clergy1@example.test',
  role: 'clergy',
  parishId: 'san-guillermo',
  parishName: 'San Guillermo Parish',
  clergyProfileId: 'c1',
};
const parishioner: MobileActor = {
  id: 'member-1',
  sessionId: 'sess-1',
  displayName: 'Maria Santos',
  email: 'maria@example.test',
  mobileNumber: '+63 917 555 0199',
  homeParishId: 'san-guillermo',
  notificationsEnabled: true,
  emailVerified: true,
};

beforeEach(() => {
  sql = migratedDatabase();
  sql.exec(`
    INSERT INTO parishes (id, slug, name) VALUES
      ('san-guillermo', 'san-guillermo', 'San Guillermo Parish'),
      ('sta-lucia', 'sta-lucia', 'Sta. Lucia Parish');
    INSERT INTO service_types (id, slug, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, description) VALUES
      ('baptism', 'baptism', 'Baptism', 60, 15, 15, 'Initial baptism description'),
      ('wedding', 'wedding', 'Wedding', 90, 30, 30, 'Initial wedding description');
    INSERT INTO document_requirements (id, service_type_id, name, instructions, is_required, sort_order) VALUES
      ('req-birth', 'baptism', 'PSA Birth Certificate', 'Clear scan', 1, 1);
    INSERT INTO users (id, email, full_name, role, home_parish_id) VALUES
      ('admin-1', 'admin@example.test', 'Ana Fernandez', 'system_admin', NULL),
      ('staff-1', 'staff1@example.test', 'Elena Gomez', 'parish_staff', 'san-guillermo'),
      ('staff-2', 'staff2@example.test', 'Ramon Cruz', 'parish_staff', 'sta-lucia'),
      ('clergy-1', 'clergy1@example.test', 'Fr. Manalo', 'clergy', 'san-guillermo'),
      ('member-1', 'maria@example.test', 'Maria Santos', 'parishioner', 'san-guillermo');
    INSERT INTO clergy_profiles (id, user_id, display_title, home_parish_id) VALUES
      ('c1', 'clergy-1', 'Fr. Manalo', 'san-guillermo');
    INSERT INTO venues (id, parish_id, name, capacity) VALUES
      ('v1', 'san-guillermo', 'Main church', 450);
    INSERT INTO mobile_credentials (user_id, password_hash, password_salt) VALUES
      ('member-1', 'hash', 'salt');
  `);
  runtime.getRawDb.mockReturnValue(d1(sql));
});

describe('Settings mutations: parish profile, sacrament scheduling rules, and requirements', () => {
  it('allows parish_staff to update own parish directory, denies cross-parish/clergy, and updates mobile catalog', async () => {
    await expect(
      performAdminMutation(
        clergyP1,
        {
          action: 'parish.profile.update',
          parishId: 'san-guillermo',
          address: 'Cabambangan, Bacolor, Pampanga',
          officeHours: 'Tue–Sat 8:00 AM – 5:00 PM',
          contactPhone: '+63 (045) 555-0102',
          contactEmail: 'office@sanguillermo.test',
          description: 'Historic parish community serving Bacolor.',
        },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });

    await expect(
      performAdminMutation(
        staffP2,
        {
          action: 'parish.profile.update',
          parishId: 'san-guillermo',
          address: 'Unauthorized cross-parish edit',
          officeHours: null,
          contactPhone: null,
          contactEmail: null,
          description: null,
        },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });

    // Reject HTML markup in public directory fields
    await expect(
      performAdminMutation(
        staffP1,
        {
          action: 'parish.profile.update',
          parishId: 'san-guillermo',
          address: '<script>alert(1)</script>Cabambangan',
          officeHours: null,
          contactPhone: null,
          contactEmail: null,
          description: null,
        },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 400 });

    await performAdminMutation(
      staffP1,
      {
        action: 'parish.profile.update',
        parishId: 'san-guillermo',
        address: 'Cabambangan, Bacolor, Pampanga',
        officeHours: 'Tue–Sat 8:30 AM – 4:30 PM',
        contactPhone: '+63 (045) 555-0102',
        contactEmail: 'OFFICE@SANGUILLERMO.TEST',
        description: 'Historic parish coordinating sacraments and pastoral care.',
      },
      crypto.randomUUID(),
    );

    const catalog = await loadMobileCatalog();
    const updatedParish = catalog.parishes.find((item) => item.id === 'san-guillermo');
    expect(updatedParish?.contact).toEqual({
      address: 'Cabambangan, Bacolor, Pampanga',
      officeHours: 'Tue–Sat 8:30 AM – 4:30 PM',
      phone: '+63 (045) 555-0102',
      email: 'office@sanguillermo.test',
      description: 'Historic parish coordinating sacraments and pastoral care.',
    });

    const staffState = await loadDashboardState(staffP1);
    expect(staffState.parishProfiles).toHaveLength(1);
    expect(staffState.parishProfiles[0]?.contactEmail).toBe('office@sanguillermo.test');
  });

  it('restricts sacrament & requirement mutations to system_admin and preserves snapshots on existing bookings', async () => {
    const bookingDate = futureManilaDate(25);
    const existing = await createMobileAppointment(
      parishioner,
      {
        serviceId: 'baptism',
        parishId: 'san-guillermo',
        clergyId: 'c1',
        venueId: 'v1',
        date: bookingDate,
        time: '8:00 AM',
      },
      crypto.randomUUID(),
    );
    expect(existing.documents.map((doc) => doc.label)).toEqual(['PSA Birth Certificate']);
    expect(existing.bufferAfterMinutes).toBe(15);

    // Non-system-admin roles cannot edit sacraments or requirements
    for (const actor of [staffP1, clergyP1]) {
      await expect(
        performAdminMutation(
          actor,
          {
            action: 'service.update',
            serviceTypeId: 'baptism',
            durationMinutes: 60,
            bufferBeforeMinutes: 30,
            bufferAfterMinutes: 30,
            description: 'Updated',
            isActive: true,
          },
          crypto.randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 403 });

      await expect(
        performAdminMutation(
          actor,
          {
            action: 'requirement.create',
            serviceTypeId: 'baptism',
            name: 'Godparent Seminar Certificate',
            instructions: 'Signed by parish catechist',
            isRequired: true,
          },
          crypto.randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 403 });
    }

    // System admin updates Baptism bufferAfter from 15m -> 45m and adds a new requirement
    await performAdminMutation(
      sysAdmin,
      {
        action: 'service.update',
        serviceTypeId: 'baptism',
        durationMinutes: 60,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 45,
        description: 'Updated baptism schedule guidance.',
        isActive: true,
      },
      crypto.randomUUID(),
    );

    await performAdminMutation(
      sysAdmin,
      {
        action: 'requirement.create',
        serviceTypeId: 'baptism',
        name: 'Godparent Seminar Certificate',
        instructions: 'Signed by parish catechist',
        isRequired: true,
      },
      crypto.randomUUID(),
    );

    // Duplicate requirement name on same sacrament is rejected (409)
    await expect(
      performAdminMutation(
        sysAdmin,
        {
          action: 'requirement.create',
          serviceTypeId: 'baptism',
          name: 'godparent seminar certificate',
          instructions: null,
          isRequired: false,
        },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });

    // Existing 8:00 AM booking still has its 15-minute buffer snapshot (ends 9:15 AM),
    // so 9:30 AM (with 15m bufferBefore -> 9:15 AM) remains available!
    const availability = await searchMobileAvailability({
      serviceId: 'baptism',
      parishId: 'san-guillermo',
      clergyId: 'c1',
      venueId: 'v1',
      date: bookingDate,
    });
    expect(availability.slots.find((slot) => slot.time === '9:30 AM')?.available).toBe(true);

    // Existing booking still has only its original 1 document submission
    const oldSubmissionCount = sql
      .prepare('SELECT COUNT(*) AS count FROM document_submissions WHERE appointment_id = ?')
      .get(existing.id) as { count: number };
    expect(oldSubmissionCount.count).toBe(1);

    // A brand-new booking receives BOTH requirements and the new 45m bufferAfter!
    const nextBooking = await createMobileAppointment(
      parishioner,
      {
        serviceId: 'baptism',
        parishId: 'san-guillermo',
        clergyId: 'c1',
        venueId: 'v1',
        date: futureManilaDate(28),
        time: '8:00 AM',
      },
      crypto.randomUUID(),
    );
    expect(nextBooking.documents.map((doc) => doc.label).sort()).toEqual([
      'Godparent Seminar Certificate',
      'PSA Birth Certificate',
    ]);
    expect(nextBooking.bufferAfterMinutes).toBe(45);

    // Retiring a requirement hides it from future mobile catalog without touching existing bookings
    const createdReq = sql
      .prepare("SELECT id FROM document_requirements WHERE name = 'Godparent Seminar Certificate'")
      .get() as { id: string };
    await performAdminMutation(
      sysAdmin,
      {
        action: 'requirement.update',
        requirementId: createdReq.id,
        name: 'Godparent Seminar Certificate',
        instructions: 'Retired requirement',
        isRequired: false,
        sortOrder: 2,
        isActive: false,
      },
      crypto.randomUUID(),
    );
    const catalog = await loadMobileCatalog();
    const baptismCatalog = catalog.services.find((item) => item.id === 'baptism');
    expect(baptismCatalog?.requirements).toEqual(['PSA Birth Certificate']);

    // Cannot pause ALL sacraments: pausing baptism succeeds while wedding is active, then pausing wedding fails (409)
    await performAdminMutation(
      sysAdmin,
      {
        action: 'service.update',
        serviceTypeId: 'baptism',
        durationMinutes: 60,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 45,
        description: 'Updated baptism schedule guidance.',
        isActive: false,
      },
      crypto.randomUUID(),
    );
    await expect(
      performAdminMutation(
        sysAdmin,
        {
          action: 'service.update',
          serviceTypeId: 'wedding',
          durationMinutes: 90,
          bufferBeforeMinutes: 30,
          bufferAfterMinutes: 30,
          description: 'Initial wedding description',
          isActive: false,
        },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
