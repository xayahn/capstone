# Demonstration Data (local development only)

All data described here is **synthetic** (fictional people, appointments, documents and records). It is created automatically the first time the local development server receives a request, and **never** in production (`NODE_ENV=production` only verifies the migrated schema).

## Reset

```powershell
cd apps/admin
# stop "pnpm dev" first
pnpm demo:reset
pnpm dev
```

`demo:reset` deletes the local database and private file storage (`.wrangler/state/v3/d1` and `r2`). On the next request the server:

1. applies every migration in `drizzle/` in order (the same files production uses; the single schema source of truth), and records them in `_parishlink_migrations`;
2. inserts the baseline catalogue (8 parishes, 5 sacraments, 17 documentary requirements) without overwriting later administrator edits;
3. seeds the demonstration dataset, with dates **relative to today**.

## What is seeded

| Item | Amount |
|---|---|
| Parishes | 8 (Vicariate of St. John Mary Vianney) |
| Parish staff | 1 per parish (8) |
| Clergy | 9 (two at the Metropolitan Cathedral) |
| Venues | 11 (main church per parish; Cathedral chapel, San Guillermo baptistry) |
| Parishioners | 24 (3 per parish); 4 can sign in to the mobile app |
| Appointments | 88 (11 per parish) covering **every** status, from about 5 weeks ago to 4 weeks ahead |
| Documents | One per requirement per appointment; statuses consistent with each appointment's status; every submitted file is a small synthetic PDF in private storage with a matching SHA-256 |
| Change requests | 1 pending reschedule (Cathedral), 1 pending cancellation (San Guillermo) |
| Mass schedule | Morning Mass 6:00–7:00 AM for each parish, yesterday through the next 6 days |
| Walk-in queue | Today's tickets at the Cathedral (1 serving, 3 waiting, 2 served) and San Guillermo (2 waiting) |
| Announcements | 1 vicariate-wide and 3 parish notices (with matching parishioner notifications) |
| Sacramental records | 3 working copies per parish (2 verified against the archive) |
| Evaluation responses | **None.** ISO/IEC 25010 results appear only after the real evaluation. |

Parish addresses, office hours and contact details are intentionally left blank until the team enters verified information through the admin Settings module.

The seed's invariants are tested in `tests/demo-seed.test.ts`: no priest or venue is double-booked (buffers included), no appointment overlaps the Mass schedule, approved appointments have every required document verified, and every stored file matches its SHA-256.

## Demo accounts

**Password for every demo account:** `ParishLink2026!`

### Admin web portal (http://localhost:3000)

| Email | Role |
|---|---|
| `admin@parishlink.test` | System administrator (vicariate-wide, technical administration only) |
| `staff.cathedral@parishlink.test` | Parish staff, Metropolitan Cathedral |
| `staff.sanguillermo@parishlink.test` | Parish staff, San Guillermo |
| `staff.sanctuario@parishlink.test` | Parish staff, Sanctuario de San Jose |
| `staff.stalucia@parishlink.test` | Parish staff, Sta. Lucia |
| `staff.stonino@parishlink.test` | Parish staff, Sto. Niño |
| `staff.sanisidro@parishlink.test` | Parish staff, San Isidro Labrador |
| `staff.stjoseph@parishlink.test` | Parish staff, St. Joseph |
| `staff.lourdes@parishlink.test` | Parish staff, Shrine of Our Lady of Lourdes |
| `dizon@example.test` | Clergy, Msgr. R. Dizon (Cathedral) |
| `manalo@example.test` | Clergy, Fr. A. Manalo (San Guillermo) |
| `pineda@example.test` | Clergy, Fr. M. Pineda (Sta. Lucia) |

The other six clergy (`e.santos@`, `j.cruz@`, `b.tolentino@`, `c.reyes@`, `d.lopez@`, `n.ocampo@example.test`) use the same password.

### Mobile app (parishioners)

| Email | Home parish |
|---|---|
| `liza.gomez@example.test` | Metropolitan Cathedral (has a pending reschedule request and a request that needs a document replaced) |
| `paolo.garcia@example.test` | Metropolitan Cathedral |
| `ronald.dizon@example.test` | San Guillermo |
| `angela.reyes@example.test` | Sta. Lucia |

> Never use these accounts or this password with real personal data.
