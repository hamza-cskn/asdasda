import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@asys.local";
const RESIDENT_EMAIL = "resident@asys.local";
const SECURITY_EMAIL = "security@asys.local";
const DEMO_PASSWORD = "AsysDemo1234!";

function toLocalDateTimeInput(value: Date): string {
  const pad = (input: number) => `${input}`.padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(
    value.getMinutes()
  )}`;
}

function buildReservationWindow(dayOffset: number): { start: string; end: string } {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + dayOffset);
  startsAt.setHours(13, 0, 0, 0);

  const endsAt = new Date(startsAt);
  endsAt.setHours(14, 0, 0, 0);

  return {
    start: toLocalDateTimeInput(startsAt),
    end: toLocalDateTimeInput(endsAt)
  };
}

function buildUniqueMonth(seed: string): string {
  const parsed = Number.parseInt(seed.slice(-8), 10);
  const normalized = Number.isFinite(parsed) ? parsed : Date.now();
  const month = (normalized % 12) + 1;
  const year = 2032 + (normalized % 10);
  return `${year}-${`${month}`.padStart(2, "0")}`;
}

async function createReservationWithRetry(page: Page): Promise<void> {
  const dayOffsets = [30, 45, 60, 90, 120, 180];
  const areaOptions = await page.locator('[data-testid="resident-reservation-area"] option').count();
  const maxAreaIndex = Math.max(areaOptions - 1, 1);

  for (let areaIndex = 1; areaIndex <= maxAreaIndex; areaIndex += 1) {
    await page.getByTestId("resident-reservation-area").selectOption({ index: areaIndex });

    for (const dayOffset of dayOffsets) {
      const reservationWindow = buildReservationWindow(dayOffset);
      await page.getByTestId("resident-reservation-start").fill(reservationWindow.start);
      await page.getByTestId("resident-reservation-end").fill(reservationWindow.end);
      await page.getByTestId("resident-reservation-submit").click();

      const feedback = page.getByTestId("resident-reservation-feedback");
      await expect(feedback).toBeVisible();
      const feedbackText = (await feedback.innerText()).toLocaleLowerCase("tr-TR");
      if (feedbackText.includes("rezervasyon olusturuldu")) {
        return;
      }
      if (
        feedbackText.includes("cakisan rezervasyon") ||
        feedbackText.includes("gunde en fazla bir rezervasyon")
      ) {
        continue;
      }
      throw new Error(`Unexpected reservation feedback: ${feedbackText}`);
    }
  }

  throw new Error("Could not create a reservation without conflict after multiple attempts.");
}

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/giris");
  await expect(page.getByTestId("login-page")).toBeVisible();
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(DEMO_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("shell-panel")).toBeVisible();
}

async function logout(page: Page): Promise<void> {
  await page.getByTestId("logout-button").click();
  await expect(page.getByTestId("login-page")).toBeVisible();
}

async function expectMaintenanceChartState(page: Page): Promise<void> {
  const chart = page.getByTestId("maintenance-pie-chart");
  if ((await chart.count()) > 0) {
    await expect(chart).toBeVisible();
    return;
  }

  await expect(page.getByText("Bakim kategorisi verisi bulunmuyor.")).toBeVisible();
}

function parseDebtorCountText(input: string): { filtered: number; total: number } {
  const parsed = /Filtrelenen borclu daire:\s*(\d+)\s*\/\s*(\d+)/.exec(input);
  if (!parsed) {
    throw new Error(`Unexpected debtor count text: ${input}`);
  }

  return {
    filtered: Number.parseInt(parsed[1] ?? "0", 10),
    total: Number.parseInt(parsed[2] ?? "0", 10)
  };
}

test.describe.configure({ mode: "serial" });

test("login and forgot-password forms keep feedback isolated", async ({ page }) => {
  await page.goto("/giris");
  await expect(page.getByTestId("login-page")).toBeVisible();

  await page.getByTestId("login-email").fill(`missing-${Date.now()}@asys.local`);
  await page.getByTestId("login-password").fill("WrongPassword123!");
  await page.getByTestId("login-submit").click();

  const loginFeedback = page.getByTestId("login-form-feedback");
  await expect(loginFeedback).toBeVisible();
  await expect(page.getByTestId("forgot-form-feedback")).toHaveCount(0);

  await page.getByTestId("forgot-email").fill(RESIDENT_EMAIL);
  await page.getByTestId("forgot-submit").click();
  const forgotFeedback = page.getByTestId("forgot-form-feedback");
  await expect(forgotFeedback).toBeVisible();
  await expect(forgotFeedback).toContainText("Sifre sifirlama adimlari");

  await expect(loginFeedback).toBeVisible();
});

test("admin can publish after quick update and feedback stays in announcement form", async ({ page }) => {
  const uniqueTag = `${Date.now()}`;
  const firstTitle = `Quick Update 1 ${uniqueTag}`;
  const secondTitle = `Quick Update 2 ${uniqueTag}`;

  await loginAs(page, ADMIN_EMAIL);
  await expect(page.getByTestId("admin-page")).toBeVisible();

  await page.getByTestId("admin-announcement-title").fill(firstTitle);
  await page.getByTestId("admin-announcement-content").fill("Ilk duyuru icerigi yeterli uzunlukta.");
  await page.getByTestId("admin-announcement-publish").click();
  await expect(page.getByTestId("admin-announcement-feedback")).toContainText("Duyuru yayimlandi.");

  const createdAnnouncementCard = page
    .locator(".announcement-card")
    .filter({ hasText: firstTitle })
    .first();
  await expect(createdAnnouncementCard).toBeVisible();
  await createdAnnouncementCard.getByRole("button", { name: "Hemen Guncelle" }).click();
  await expect(page.getByTestId("admin-announcement-feedback")).toContainText("Duyuru guncellendi.");

  await page.getByTestId("admin-announcement-title").fill(secondTitle);
  await page.getByTestId("admin-announcement-content").fill("Ikinci duyuru icerigi de yeterli uzunlukta.");
  await page.getByTestId("admin-announcement-publish").click();
  await expect(page.getByTestId("admin-announcement-feedback")).toContainText("Duyuru yayimlandi.");
  await expect(page.getByText(secondTitle, { exact: true })).toBeVisible();

  await expect(page.locator('article[data-testid="admin-page"] > p.error')).toHaveCount(0);
  await logout(page);
});

test("admin, resident, security role flows are functional end-to-end", async ({ page }) => {
  const uniqueTag = `${Date.now()}`;
  const duesMonth = buildUniqueMonth(uniqueTag);
  const announcementTitle = `E2E Duyuru ${uniqueTag}`;
  const secondAnnouncementTitle = `E2E Duyuru 2 ${uniqueTag}`;
  const maintenanceDescription = `E2E Bakim Talebi ${uniqueTag}`;
  const visitorPlate = `34E2E${uniqueTag.slice(-4)}`;
  let maintenanceWasCreated = false;

  await loginAs(page, ADMIN_EMAIL);
  await expect(page.getByTestId("admin-page")).toBeVisible();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
  await expectMaintenanceChartState(page);
  await expect(page.getByTestId("dues-line-chart")).toBeVisible();
  await expect(page.getByTestId("parking-occupancy-map")).toBeVisible();

  await page.getByTestId("admin-announcement-title").fill(announcementTitle);
  await page.getByTestId("admin-announcement-content").fill("E2E duyuru icerigi");
  await page.getByTestId("admin-announcement-publish").click();
  await expect(page.getByTestId("admin-announcement-feedback")).toContainText("Duyuru yayimlandi.");

  const createdAnnouncementCard = page
    .locator(".announcement-card")
    .filter({ hasText: announcementTitle })
    .first();
  await expect(createdAnnouncementCard).toBeVisible();
  await createdAnnouncementCard.getByRole("button", { name: "Hemen Guncelle" }).click();
  await expect(page.getByTestId("admin-announcement-feedback")).toContainText("Duyuru guncellendi.");

  await page.getByTestId("admin-announcement-title").fill(secondAnnouncementTitle);
  await page.getByTestId("admin-announcement-content").fill("E2E ikinci duyuru icerigi");
  await page.getByTestId("admin-announcement-publish").click();
  await expect(page.getByTestId("admin-announcement-feedback")).toContainText("Duyuru yayimlandi.");

  await page.getByTestId("admin-announcement-title").fill("ab");
  await page.getByTestId("admin-announcement-content").fill("kisa");
  await page.getByTestId("admin-announcement-publish").click();
  await expect(page.getByTestId("admin-announcement-feedback")).toContainText("Baslik en az 3 karakter olmalidir.");
  await expect(page.getByText("Duyuru yayimlanamadi.")).toHaveCount(0);

  await page.getByTestId("admin-report-month").fill(duesMonth);
  await page.getByTestId("admin-generate-dues").click();
  await expect(page.getByTestId("admin-dues-feedback")).toContainText(`${duesMonth} donemi icin`);
  await logout(page);

  await loginAs(page, RESIDENT_EMAIL);
  await expect(page.getByTestId("resident-page")).toBeVisible();
  await expect(page.getByText(secondAnnouncementTitle, { exact: true })).toBeVisible();

  await page.getByTestId("resident-maintenance-category").fill("E2E Kontrol");
  await page.getByTestId("resident-maintenance-description").fill(maintenanceDescription);
  await page.getByTestId("resident-maintenance-photo").fill("https://example.com/e2e.jpg");
  await page.getByTestId("resident-maintenance-category").fill("aa");
  await page.getByTestId("resident-maintenance-description").fill("kisa");
  await page.getByTestId("resident-maintenance-submit").click();
  await expect(page.getByTestId("resident-maintenance-feedback")).toContainText("Kategori en az 3 karakter olmalidir.");

  await page.getByTestId("resident-maintenance-category").fill("E2E Kontrol");
  await page.getByTestId("resident-maintenance-description").fill(maintenanceDescription);
  await page.getByTestId("resident-maintenance-submit").click();
  const residentMaintenanceFeedback = page.getByTestId("resident-maintenance-feedback");
  await expect(residentMaintenanceFeedback).toBeVisible();
  const residentMaintenanceFeedbackText = await residentMaintenanceFeedback.innerText();
  if (residentMaintenanceFeedbackText.includes("Bakim talebi olusturuldu.")) {
    maintenanceWasCreated = true;
  } else {
    await expect(residentMaintenanceFeedback).toContainText("Ayni anda en fazla 3 acik bakim talebi olusturabilirsiniz.");
  }

  const paymentButtons = page.locator('[data-testid^="resident-pay-"][data-testid$="-CREDIT_CARD"]');
  await expect(paymentButtons.first()).toBeVisible();
  while ((await paymentButtons.count()) > 0) {
    await paymentButtons.first().click();
    await expect(page.getByTestId("resident-payment-feedback")).toContainText("Odeme tamamlandi.");
  }

  await createReservationWithRetry(page);
  await expect(page.getByTestId("resident-reservation-feedback")).toContainText("Rezervasyon olusturuldu.");
  await logout(page);

  await loginAs(page, ADMIN_EMAIL);
  const adminMaintenanceCards = page.locator('[data-testid^="admin-maintenance-"]');
  const adminMaintenanceCard = maintenanceWasCreated
    ? adminMaintenanceCards.filter({ hasText: maintenanceDescription }).first()
    : adminMaintenanceCards.first();
  await expect(adminMaintenanceCard).toBeVisible();
  await adminMaintenanceCard.getByRole("button", { name: "Tamamlandi" }).click();
  await expect(page.getByTestId("admin-maintenance-feedback")).toContainText("Bakim talep durumu guncellendi.");

  await page.getByTestId("admin-report-month").fill("2031-01");
  await page.getByTestId("admin-generate-dues").click();
  await expect(page.getByTestId("admin-dues-feedback")).toContainText("2031-01 donemi icin");

  const initialDebtor = parseDebtorCountText(await page.getByTestId("debtor-count").innerText());
  expect(initialDebtor.total).toBeGreaterThan(0);

  await page.getByTestId("debtor-search").fill("zzz");
  await expect(page.getByText("Filtreye uyan borclu daire yok.")).toBeVisible();
  const noMatchDebtor = parseDebtorCountText(await page.getByTestId("debtor-count").innerText());
  expect(noMatchDebtor.total).toBe(initialDebtor.total);
  expect(noMatchDebtor.filtered).toBe(0);

  await page.getByTestId("debtor-search").fill("");
  await page.getByTestId("debtor-min-outstanding").fill("999999");
  const minFilterDebtor = parseDebtorCountText(await page.getByTestId("debtor-count").innerText());
  expect(minFilterDebtor.total).toBe(initialDebtor.total);
  expect(minFilterDebtor.filtered).toBe(0);

  await page.getByTestId("debtor-min-outstanding").fill("0");
  await page.getByTestId("debtor-only-overdue").click();
  const overdueDebtor = parseDebtorCountText(await page.getByTestId("debtor-count").innerText());
  expect(overdueDebtor.total).toBe(initialDebtor.total);
  const overdueCards = page.locator(".debtor-card");
  expect(await overdueCards.count()).toBe(overdueDebtor.filtered);
  for (let index = 0; index < overdueDebtor.filtered; index += 1) {
    const overdueText = await overdueCards.nth(index).innerText();
    const match = /Gecikmis kayit:\s*(\d+)/.exec(overdueText);
    expect(Number.parseInt(match?.[1] ?? "0", 10)).toBeGreaterThan(0);
  }
  await logout(page);

  await loginAs(page, RESIDENT_EMAIL);
  const residentRateButton = page.getByRole("button", { name: "Puanla" }).first();
  await expect(residentRateButton).toBeVisible();
  await residentRateButton.click();
  await expect(page.getByTestId("resident-maintenance-feedback")).toContainText("Bakim talebi puanlandi.");
  await logout(page);

  await loginAs(page, SECURITY_EMAIL);
  await expect(page.getByTestId("security-page")).toBeVisible();
  await page.getByTestId("security-visitor-submit").click();
  await expect(page.getByTestId("security-visitor-feedback")).toBeVisible();

  await page.getByTestId("security-visitor-plate").fill(visitorPlate);
  await page.getByTestId("security-visitor-apartment").selectOption({ index: 1 });
  await page.getByTestId("security-visitor-spot").selectOption({ index: 1 });
  await page.getByTestId("security-visitor-submit").click();
  await expect(page.getByTestId("security-visitor-feedback")).toContainText("Ziyaretci kaydi olusturuldu.");

  const vehicleCard = page.locator('[data-testid^="security-vehicle-"]').filter({ hasText: visitorPlate }).first();
  await expect(vehicleCard).toBeVisible();
  await vehicleCard.getByRole("button", { name: "Cikis Kaydet" }).click();
  await expect(page.getByTestId("security-visitor-feedback")).toContainText("Ziyaretci cikisi kaydedildi.");
});
