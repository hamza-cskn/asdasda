import { Client } from "pg";
import bcrypt from "bcrypt";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/asys?schema=public";
const DEMO_PASSWORD = "AsysDemo1234!";

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const adminId = "usr_admin";
  const residentId = "usr_resident";
  const securityId = "usr_security";
  const apartmentId = "apt_a1";
  const apartmentBId = "apt_b2";

  await client.query("BEGIN");

  await client.query(`DELETE FROM visitor_vehicles`);
  await client.query(`DELETE FROM reservations`);
  await client.query(`DELETE FROM maintenance_requests`);
  await client.query(`DELETE FROM announcements`);
  await client.query(`DELETE FROM notifications`);
  await client.query(`DELETE FROM email_outbox`);
  await client.query(`DELETE FROM audit_logs`);
  await client.query(`DELETE FROM password_reset_tokens`);

  await client.query(
    `INSERT INTO users (user_id, name, email, password_hash, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (email) DO UPDATE
     SET name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_active = EXCLUDED.is_active,
         updated_at = CURRENT_TIMESTAMP`,
    [adminId, "Site Yoneticisi", "admin@asys.local", passwordHash]
  );

  await client.query(
    `INSERT INTO users (user_id, name, email, password_hash, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'RESIDENT', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (email) DO UPDATE
     SET name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_active = EXCLUDED.is_active,
         updated_at = CURRENT_TIMESTAMP`,
    [residentId, "Ornek Sakin", "resident@asys.local", passwordHash]
  );

  await client.query(
    `INSERT INTO users (user_id, name, email, password_hash, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'SECURITY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (email) DO UPDATE
     SET name = EXCLUDED.name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_active = EXCLUDED.is_active,
         updated_at = CURRENT_TIMESTAMP`,
    [securityId, "Guvenlik Gorevlisi", "security@asys.local", passwordHash]
  );

  await client.query(
    `INSERT INTO apartments (apartment_id, block, floor, number, monthly_due, is_occupied, created_at, updated_at)
     VALUES ($1, 'A', 1, '1', 1500.00, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (block, number) DO UPDATE
     SET floor = EXCLUDED.floor,
         monthly_due = EXCLUDED.monthly_due,
         is_occupied = EXCLUDED.is_occupied,
         updated_at = CURRENT_TIMESTAMP`,
    [apartmentId]
  );

  await client.query(
    `INSERT INTO apartments (apartment_id, block, floor, number, monthly_due, is_occupied, created_at, updated_at)
     VALUES ($1, 'B', 2, '8', 1750.00, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (block, number) DO UPDATE
     SET floor = EXCLUDED.floor,
         monthly_due = EXCLUDED.monthly_due,
         is_occupied = EXCLUDED.is_occupied,
         updated_at = CURRENT_TIMESTAMP`,
    [apartmentBId]
  );

  await client.query(
    `UPDATE users
     SET apartment_id = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE email = 'resident@asys.local'`,
    [apartmentId]
  );

  await client.query(
    `INSERT INTO common_areas (common_area_id, type, name, description, max_duration_hours, daily_limit_hours, opens_at, closes_at, created_at)
     VALUES
       ('ca_gym', 'GYM', 'Spor Salonu', 'Fitness ve spor alani', 2, 2, '07:00', '23:00', CURRENT_TIMESTAMP),
       ('ca_meeting', 'MEETING_ROOM', 'Toplanti Odasi', 'Site sakinleri icin toplanti alani', 4, 4, '07:00', '23:00', CURRENT_TIMESTAMP),
       ('ca_park', 'CHILD_PARK', 'Cocuk Parki', 'Cocuk oyun ve etkinlik alani', 2, 2, '07:00', '23:00', CURRENT_TIMESTAMP)
     ON CONFLICT (name) DO UPDATE
     SET type = EXCLUDED.type,
         description = EXCLUDED.description,
         max_duration_hours = EXCLUDED.max_duration_hours,
         daily_limit_hours = EXCLUDED.daily_limit_hours,
         opens_at = EXCLUDED.opens_at,
         closes_at = EXCLUDED.closes_at`
  );

  await client.query(
    `INSERT INTO parking_spots (parking_spot_id, spot_number, type, apartment_id, created_at)
     VALUES
       ('spot_a1', 'A-01', 'STANDARD', $1, CURRENT_TIMESTAMP),
       ('spot_a2', 'A-02', 'STANDARD', NULL, CURRENT_TIMESTAMP),
       ('spot_accessible_1', 'ENG-01', 'ACCESSIBLE', NULL, CURRENT_TIMESTAMP),
       ('spot_visitor_1', 'MIS-01', 'VISITOR', NULL, CURRENT_TIMESTAMP),
       ('spot_visitor_2', 'MIS-02', 'VISITOR', NULL, CURRENT_TIMESTAMP)
     ON CONFLICT (spot_number) DO UPDATE
     SET type = EXCLUDED.type,
         apartment_id = EXCLUDED.apartment_id`,
    [apartmentId]
  );

  await client.query(
    `DELETE FROM payments
     WHERE due_id IN (
       SELECT due_id
       FROM dues
       WHERE apartment_id IN ($1, $2)
     )`,
    [apartmentId, apartmentBId]
  );

  await client.query(
    `DELETE FROM dues
     WHERE apartment_id IN ($1, $2)`,
    [apartmentId, apartmentBId]
  );

  await client.query(
    `INSERT INTO dues (due_id, apartment_id, amount, due_date, status, late_fee_amount, created_at, updated_at)
     VALUES
       ('due_a1_2026_02', $1, 1500.00, '2026-02-05T12:00:00.000Z', 'PAID', 0.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('due_a1_2026_03', $1, 1500.00, '2026-03-05T12:00:00.000Z', 'PAID', 0.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('due_a1_2026_04', $1, 1500.00, '2026-04-05T12:00:00.000Z', 'PENDING', 0.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (apartment_id, due_date) DO UPDATE
     SET amount = EXCLUDED.amount,
         status = EXCLUDED.status,
         late_fee_amount = EXCLUDED.late_fee_amount,
         updated_at = CURRENT_TIMESTAMP`,
    [apartmentId]
  );

  await client.query(
    `INSERT INTO payments (payment_id, due_id, amount, method, paid_at, created_by_id, created_at)
     VALUES
       ('pay_a1_2026_02', 'due_a1_2026_02', 1500.00, 'BANK_TRANSFER', '2026-02-04T12:00:00.000Z', $1, CURRENT_TIMESTAMP),
       ('pay_a1_2026_03', 'due_a1_2026_03', 1500.00, 'CREDIT_CARD', '2026-03-04T12:00:00.000Z', $1, CURRENT_TIMESTAMP)
     ON CONFLICT (payment_id) DO NOTHING`,
    [residentId]
  );

  await client.query("COMMIT");
  await client.end();

  console.log("Seed tamamlandi: demo kullanicilari bcrypt hash ile guncellendi.");
}

main().catch(async (error) => {
  console.error("Seed hatasi", error);
  process.exitCode = 1;
});
