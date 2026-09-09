"""Validate the checked-in ParishLink SQLite/D1 migration in memory."""

from pathlib import Path
import sqlite3


MIGRATIONS = Path(__file__).parents[1] / "drizzle"

EXPECTED_TABLES = {
    "announcements", "appointment_events", "appointment_participants", "appointments",
    "audit_logs", "availability_blocks", "chatbot_messages", "clergy_assignments",
    "clergy_profiles", "document_requirements", "document_submissions",
    "evaluation_responses", "idempotency_keys", "mobile_credentials",
    "mobile_rate_limits", "mobile_sessions", "notifications", "parishes",
    "queue_tickets", "sacramental_records", "service_types", "user_parish_memberships",
    "users", "venues",
}


def main() -> None:
    connection = sqlite3.connect(":memory:")
    connection.execute("PRAGMA foreign_keys = ON")
    migrations = sorted(MIGRATIONS.glob("[0-9][0-9][0-9][0-9]_*.sql"))
    if not migrations:
        raise RuntimeError("No versioned migrations were found.")
    for migration in migrations:
        sql = migration.read_text(encoding="utf-8").replace("--> statement-breakpoint", "")
        connection.executescript(sql)
    tables = [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]
    missing = EXPECTED_TABLES.difference(tables)
    unexpected = set(tables).difference(EXPECTED_TABLES)
    if missing or unexpected:
        raise RuntimeError(f"Schema table mismatch; missing={sorted(missing)}, unexpected={sorted(unexpected)}")
    foreign_key_issues = connection.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_key_issues:
        raise RuntimeError(f"Foreign-key validation failed: {foreign_key_issues}")
    integrity = connection.execute("PRAGMA integrity_check").fetchone()
    if integrity != ("ok",):
        raise RuntimeError(f"Integrity check failed: {integrity}")
    index_names = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'"
        )
    }
    required_indexes = {"idx_appointments_clergy_window", "idx_appointments_venue_window", "idx_idempotency_actor_scope_key"}
    if not required_indexes.issubset(index_names):
        raise RuntimeError(f"Required index missing: {sorted(required_indexes.difference(index_names))}")
    print(f"Migration chain valid: {len(migrations)} files, {len(tables)} tables, {len(index_names)} indexes")
    print(", ".join(tables))


if __name__ == "__main__":
    main()
