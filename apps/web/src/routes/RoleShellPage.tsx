import type {
  Announcement,
  CommonArea,
  DashboardSummary,
  Due,
  MaintenanceRequest,
  MaintenanceStatus,
  ManagedUser,
  Notification,
  ParkingSpot,
  Payment,
  PaymentMethod,
  Reservation,
  Role,
  UserProfile,
  VisitorVehicle
} from "@asys/contracts";
import {
  Anchor,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title
} from "@mantine/core";
import { LineChart, PieChart } from "@mantine/charts";
import { IconAlertCircle, IconCircleCheck } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import {
  deleteAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  updateAnnouncement
} from "../announcements/api";
import { listCommonAreas } from "../common-areas/api";
import { fetchDashboard, monthlyReportUrl } from "../dashboard/api";
import { generateMonthlyDues, listDues } from "../dues/api";
import {
  createMaintenanceRequest,
  listMaintenanceRequests,
  rateMaintenanceRequest,
  updateMaintenanceStatus
} from "../maintenance/api";
import { listNotifications, markNotificationRead } from "../notifications/api";
import {
  assignParkingSpot,
  createVisitorVehicle,
  exitVisitorVehicle,
  listParkingSpots,
  listVisitorVehicles
} from "../parking/api";
import { createPayment, listPayments, paymentReceiptUrl } from "../payments/api";
import { cancelReservation, createReservation, listReservations } from "../reservations/api";
import {
  createManagedUser,
  fetchUserProfile,
  listApartments,
  listManagedUsers,
  updateManagedUserActivation,
  updateUserProfile
} from "../users/api";
import { toUserMessage } from "../lib/error-utils";

const maintenanceStatuses: MaintenanceStatus[] = ["BEKLEMEDE", "ISLEMDE", "TAMAMLANDI"];
const paymentMethods: PaymentMethod[] = ["CREDIT_CARD", "BANK_TRANSFER"];

function sortAnnouncementsDesc(items: Announcement[]): Announcement[] {
  return [...items].sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function sortMaintenanceDesc(items: MaintenanceRequest[]): MaintenanceRequest[] {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function sortNotificationsDesc(items: Notification[]): Notification[] {
  return [...items].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatMaintenanceStatus(status: MaintenanceStatus): string {
  switch (status) {
    case "BEKLEMEDE":
      return "Beklemede";
    case "ISLEMDE":
      return "Islemde";
    case "TAMAMLANDI":
      return "Tamamlandi";
    default:
      return status;
  }
}

function roleLabel(role: Role): string {
  if (role === "ADMIN") {
    return "Yonetici";
  }
  if (role === "SECURITY") {
    return "Guvenlik";
  }
  return "Sakin";
}

function useSessionToken(): string | null {
  const { session } = useAuth();
  return session?.accessToken ?? null;
}

type FormFeedback =
  | {
      kind: "error" | "info";
      message: string;
    }
  | null;

function FeedbackMessage({ feedback, testId }: { feedback: FormFeedback; testId: string }) {
  if (!feedback) {
    return null;
  }

  return (
    <Alert
      variant="light"
      color={feedback.kind === "error" ? "red" : "teal"}
      icon={feedback.kind === "error" ? <IconAlertCircle size={16} /> : <IconCircleCheck size={16} />}
      data-testid={testId}
      className="form-feedback-alert"
    >
      {feedback.message}
    </Alert>
  );
}

function NotificationList({
  notifications,
  onMarkRead
}: {
  notifications: Notification[];
  onMarkRead: (notificationId: string) => Promise<void>;
}) {
  if (notifications.length === 0) {
    return <Text c="dimmed">Bildirim bulunmuyor.</Text>;
  }

  return (
    <Stack className="announcement-list">
      {notifications.map((notification) => (
        <Card key={notification.id} className="announcement-card" withBorder radius="lg" shadow="sm">
          <Stack gap={6}>
            <Group justify="space-between" align="flex-start">
              <Text fw={700}>{notification.title}</Text>
              <Text size="xs" c="dimmed">
                {formatDateTime(notification.createdAt)}
              </Text>
            </Group>
            <Text size="sm">{notification.message}</Text>
            <Group gap={8}>
              <Badge variant="light" color="ocean">
                {notification.category}
              </Badge>
              <Text size="xs" c="dimmed">
                Kategori
              </Text>
            </Group>
          </Stack>
          <Group className="inline-actions" mt="sm">
            {notification.link ? <Anchor href={notification.link}>Ac</Anchor> : null}
            {!notification.isRead ? (
              <Button
                type="button"
                size="xs"
                variant="light"
                onClick={() => {
                  void onMarkRead(notification.id);
                }}
              >
                Okundu Isaretle
              </Button>
            ) : (
              <Badge color="teal" variant="light">
                Okundu
              </Badge>
            )}
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

function AnnouncementList({
  announcements,
  emptyMessage
}: {
  announcements: Announcement[];
  emptyMessage: string;
}) {
  if (announcements.length === 0) {
    return <Text c="dimmed">{emptyMessage}</Text>;
  }

  return (
    <Stack className="announcement-list">
      {announcements.map((announcement) => (
        <Card key={announcement.id} className="announcement-card" withBorder radius="lg" shadow="sm">
          <Group justify="space-between" align="flex-start">
            <Text fw={700}>{announcement.title}</Text>
            <Text size="xs" c="dimmed">
              {formatDateTime(announcement.publishedAt)} | {announcement.authorName ?? "Yonetim"}
            </Text>
          </Group>
          <Text size="sm" mt="xs">
            {announcement.content}
          </Text>
        </Card>
      ))}
    </Stack>
  );
}

function setOptional<T extends object>(target: T, key: keyof T, value: unknown): void {
  if (value !== undefined && value !== null && value !== "") {
    target[key] = value as T[keyof T];
  }
}

const chartPalette = ["#0d9488", "#0ea5e9", "#f59e0b", "#ef4444", "#7c3aed", "#14b8a6", "#64748b"];

function monthShortLabel(month: string): string {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    return month;
  }

  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  return new Intl.DateTimeFormat("tr-TR", { month: "short" }).format(date);
}

function MaintenancePieChart({
  buckets
}: {
  buckets: DashboardSummary["maintenanceByCategory"];
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) {
    return <Text c="dimmed">Bakim kategorisi verisi bulunmuyor.</Text>;
  }
  const data = buckets.map((bucket, index) => ({
    name: bucket.category,
    value: bucket.count,
    color: chartPalette[index % chartPalette.length] ?? "ocean.6"
  }));

  return (
    <Stack className="chart-pie-layout" data-testid="maintenance-pie-chart">
      <PieChart
        data={data}
        size={180}
        withLabels
        labelsType="percent"
        withTooltip
        tooltipDataSource="segment"
        mx="auto"
      />
      <Stack className="chart-legend" gap={4}>
        {buckets.map((bucket, index) => {
          const ratio = total === 0 ? 0 : (bucket.count / total) * 100;
          return (
            <Text key={bucket.category} size="sm">
              <span
                className="chart-legend-swatch"
                style={{ backgroundColor: chartPalette[index % chartPalette.length] }}
                aria-hidden
              />
              {bucket.category}: {bucket.count} ({formatMoney(ratio)}%)
            </Text>
          );
        })}
      </Stack>
    </Stack>
  );
}

function DuesTrendLineChart({
  points
}: {
  points: DashboardSummary["duesTrend"];
}) {
  if (points.length === 0) {
    return <Text c="dimmed">Tahsilat trend verisi bulunmuyor.</Text>;
  }
  const maxValue = Math.max(...points.map((point) => point.collectedAmount), 1);
  const data = points.map((point) => ({
    month: monthShortLabel(point.month),
    Tahsilat: point.collectedAmount
  }));

  return (
    <Stack className="chart-line" data-testid="dues-line-chart">
      <LineChart
        h={240}
        data={data}
        dataKey="month"
        series={[{ name: "Tahsilat", color: "ocean.6" }]}
        withDots
        strokeWidth={3}
        valueFormatter={(value) => `${formatMoney(value)} TL`}
      />
      <Text className="hint" size="sm">
        Maksimum: {formatMoney(maxValue)} TL
      </Text>
    </Stack>
  );
}

function ParkingOccupancyMap({ spots }: { spots: ParkingSpot[] }) {
  if (spots.length === 0) {
    return <Text c="dimmed">Park verisi bulunmuyor.</Text>;
  }

  return (
    <div className="parking-map-wrapper" data-testid="parking-occupancy-map">
      <Group className="parking-legend" gap="xs">
        <Badge className="legend-item legend-standard" variant="light">
          Standart
        </Badge>
        <Badge className="legend-item legend-accessible" variant="light">
          Engelli
        </Badge>
        <Badge className="legend-item legend-visitor" variant="light">
          Ziyaretci
        </Badge>
        <Badge className="legend-item legend-occupied" variant="light">
          Dolu
        </Badge>
        <Badge className="legend-item legend-empty" variant="light">
          Bos
        </Badge>
      </Group>
      <SimpleGrid className="parking-map-grid" cols={{ base: 1, sm: 2, lg: 4 }}>
        {spots.map((spot) => {
          const toneClass = spot.type === "ACCESSIBLE" ? "tone-accessible" : spot.type === "VISITOR" ? "tone-visitor" : "tone-standard";
          const occupiedClass = spot.isOccupied ? "is-occupied" : "is-empty";
          return (
            <Card key={spot.id} withBorder radius="md" className={`parking-cell ${toneClass} ${occupiedClass}`}>
              <Stack gap={4}>
                <Text fw={700}>{spot.spotNumber}</Text>
                <Text size="sm">Tip: {spot.type}</Text>
                <Text size="sm">Durum: {spot.isOccupied ? "Dolu" : "Bos"}</Text>
                <Text size="sm">
                  {spot.apartmentLabel ? `Daire: ${spot.apartmentLabel}` : spot.occupiedByPlate ? `Plaka: ${spot.occupiedByPlate}` : "-"}
                </Text>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
    </div>
  );
}

export function AdminShellPage() {
  const { user } = useAuth();
  const accessToken = useSessionToken();
  const token = accessToken ?? "";

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [apartments, setApartments] = useState<Array<{ id: string; label: string }>>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [parkingSpots, setParkingSpots] = useState<ParkingSpot[]>([]);
  const [visitorVehicles, setVisitorVehicles] = useState<VisitorVehicle[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [reportMonth, setReportMonth] = useState("2026-04");

  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [maintenanceFilterCategory, setMaintenanceFilterCategory] = useState("");
  const [maintenanceFilterStatus, setMaintenanceFilterStatus] = useState<MaintenanceStatus | "">("");
  const [maintenanceFilterDateFrom, setMaintenanceFilterDateFrom] = useState("");
  const [maintenanceFilterDateTo, setMaintenanceFilterDateTo] = useState("");
  const [selectedSpotId, setSelectedSpotId] = useState("");
  const [selectedSpotApartmentId, setSelectedSpotApartmentId] = useState("");
  const [createUserName, setCreateUserName] = useState("");
  const [createUserEmail, setCreateUserEmail] = useState("");
  const [createUserPassword, setCreateUserPassword] = useState("AsysDemo1234!");
  const [createUserRole, setCreateUserRole] = useState<Role>("RESIDENT");
  const [createUserApartmentId, setCreateUserApartmentId] = useState("");
  const [debtorSearch, setDebtorSearch] = useState("");
  const [debtorMinOutstanding, setDebtorMinOutstanding] = useState("");
  const [debtorOnlyOverdue, setDebtorOnlyOverdue] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [loadErrorMessage, setLoadErrorMessage] = useState("");
  const [userFeedback, setUserFeedback] = useState<FormFeedback>(null);
  const [announcementFeedback, setAnnouncementFeedback] = useState<FormFeedback>(null);
  const [maintenanceFeedback, setMaintenanceFeedback] = useState<FormFeedback>(null);
  const [duesFeedback, setDuesFeedback] = useState<FormFeedback>(null);
  const [reservationFeedback, setReservationFeedback] = useState<FormFeedback>(null);
  const [parkingFeedback, setParkingFeedback] = useState<FormFeedback>(null);
  const [isCreateUserSubmitting, setIsCreateUserSubmitting] = useState(false);
  const [isAnnouncementSubmitting, setIsAnnouncementSubmitting] = useState(false);
  const [announcementBusyId, setAnnouncementBusyId] = useState<string | null>(null);
  const [isMaintenanceFilterSubmitting, setIsMaintenanceFilterSubmitting] = useState(false);
  const [isDuesSubmitting, setIsDuesSubmitting] = useState(false);
  const [reservationBusyId, setReservationBusyId] = useState<string | null>(null);
  const [isAssigningSpot, setIsAssigningSpot] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [maintenanceBusyId, setMaintenanceBusyId] = useState<string | null>(null);

  const minOutstanding = Number.parseFloat(debtorMinOutstanding);
  const effectiveMinOutstanding = Number.isFinite(minOutstanding) && minOutstanding > 0 ? minOutstanding : 0;
  const filteredDebtors =
    dashboard?.debtorApartments.filter((debtor) => {
      const matchesSearch = debtorSearch.trim()
        ? debtor.apartmentLabel.toLocaleLowerCase("tr-TR").includes(debtorSearch.trim().toLocaleLowerCase("tr-TR"))
        : true;
      const matchesAmount = debtor.outstandingAmount >= effectiveMinOutstanding;
      const matchesOverdue = debtorOnlyOverdue ? debtor.overdueCount > 0 : true;
      return matchesSearch && matchesAmount && matchesOverdue;
    }) ?? [];

  useEffect(() => {
    if (!token) {
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setLoadErrorMessage("");

    void Promise.all([
      listManagedUsers(token),
      listApartments(token),
      listAnnouncements(token),
      listMaintenanceRequests(token),
      listDues(token),
      listPayments(token),
      listReservations(token),
      listParkingSpots(token),
      listVisitorVehicles(token),
      fetchDashboard(token),
      listNotifications(token)
    ])
      .then(
        ([
          usersResponse,
          apartmentsResponse,
          announcementsResponse,
          maintenanceResponse,
          duesResponse,
          paymentsResponse,
          reservationsResponse,
          parkingResponse,
          visitorResponse,
          dashboardResponse,
          notificationResponse
        ]) => {
          if (isCancelled) {
            return;
          }

          setUsers(usersResponse);
          setApartments(apartmentsResponse.map((item) => ({ id: item.id, label: `${item.block}-${item.number}` })));
          setAnnouncements(sortAnnouncementsDesc(announcementsResponse));
          setMaintenanceRequests(sortMaintenanceDesc(maintenanceResponse));
          setDues(duesResponse);
          setPayments(paymentsResponse);
          setReservations(reservationsResponse);
          setParkingSpots(parkingResponse);
          setVisitorVehicles(visitorResponse);
          setDashboard(dashboardResponse);
          setNotifications(sortNotificationsDesc(notificationResponse.notifications));
        }
      )
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }
        setLoadErrorMessage(toUserMessage(error, "Yonetici paneli verileri yuklenemedi."));
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [token]);

  if (!user || !accessToken) {
    return (
      <article>
        <h2>Yonetici Paneli</h2>
        <p>Yonetici oturumu bulunamadi.</p>
      </article>
    );
  }

  async function onToggleUserActivation(targetUser: ManagedUser) {
    setPendingUserId(targetUser.id);
    setUserFeedback(null);

    try {
      const updated = await updateManagedUserActivation(token, targetUser.id, !targetUser.isActive);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setUserFeedback({
        kind: "info",
        message: updated.isActive ? "Kullanici aktive edildi." : "Kullanici pasife alindi."
      });
    } catch (error) {
      setUserFeedback({
        kind: "error",
        message: toUserMessage(error, "Kullanici durum formu islenemedi.")
      });
    } finally {
      setPendingUserId(null);
    }
  }

  async function onCreateUser() {
    setIsCreateUserSubmitting(true);
    setUserFeedback(null);

    try {
      const created = await createManagedUser(token, {
        name: createUserName,
        email: createUserEmail,
        password: createUserPassword,
        role: createUserRole,
        apartmentId: createUserApartmentId || null
      });
      setUsers((current) => [created, ...current]);
      setCreateUserName("");
      setCreateUserEmail("");
      setCreateUserApartmentId("");
      setUserFeedback({
        kind: "info",
        message: "Yeni kullanici olusturuldu."
      });
    } catch (error) {
      setUserFeedback({
        kind: "error",
        message: toUserMessage(error, "Kullanici formu gonderilemedi. Lutfen alanlari kontrol edin.")
      });
    } finally {
      setIsCreateUserSubmitting(false);
    }
  }

  async function onPublishAnnouncement() {
    setIsAnnouncementSubmitting(true);
    setAnnouncementFeedback(null);
    try {
      const created = await publishAnnouncement(token, {
        title: announcementTitle,
        content: announcementContent
      });
      setAnnouncements((current) => sortAnnouncementsDesc([created, ...current]));
      setAnnouncementTitle("");
      setAnnouncementContent("");
      setAnnouncementFeedback({
        kind: "info",
        message: "Duyuru yayimlandi."
      });
    } catch (error) {
      setAnnouncementFeedback({
        kind: "error",
        message: toUserMessage(error, "Duyuru formu gonderilemedi. Lutfen alanlari kontrol edin.")
      });
    } finally {
      setIsAnnouncementSubmitting(false);
    }
  }

  async function onQuickUpdateAnnouncement(announcement: Announcement) {
    setAnnouncementBusyId(announcement.id);
    setAnnouncementFeedback(null);
    try {
      const updated = await updateAnnouncement(token, announcement.id, {
        title: `${announcement.title} (Guncel)`,
        content: announcement.content
      });
      setAnnouncements((current) =>
        sortAnnouncementsDesc(current.map((item) => (item.id === updated.id ? updated : item)))
      );
      setAnnouncementFeedback({
        kind: "info",
        message: "Duyuru guncellendi."
      });
    } catch (error) {
      setAnnouncementFeedback({
        kind: "error",
        message: toUserMessage(error, "Duyuru hizli guncelleme islemi tamamlanamadi.")
      });
    } finally {
      setAnnouncementBusyId(null);
    }
  }

  async function onDeleteAnnouncement(announcementId: string) {
    setAnnouncementBusyId(announcementId);
    setAnnouncementFeedback(null);
    try {
      await deleteAnnouncement(token, announcementId);
      setAnnouncements((current) => current.filter((item) => item.id !== announcementId));
      setAnnouncementFeedback({
        kind: "info",
        message: "Duyuru silindi."
      });
    } catch (error) {
      setAnnouncementFeedback({
        kind: "error",
        message: toUserMessage(error, "Duyuru silme islemi tamamlanamadi.")
      });
    } finally {
      setAnnouncementBusyId(null);
    }
  }

  async function onMarkNotificationRead(notificationId: string) {
    try {
      const updated = await markNotificationRead(token, notificationId);
      setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      return;
    }
  }

  async function refreshDashboardSnapshot() {
    try {
      const latest = await fetchDashboard(token);
      setDashboard(latest);
    } catch {
      return;
    }
  }

  async function onApplyMaintenanceFilters() {
    const filters: {
      category?: string;
      status?: MaintenanceStatus;
      dateFrom?: string;
      dateTo?: string;
    } = {};
    setOptional(filters, "category", maintenanceFilterCategory);
    setOptional(filters, "status", maintenanceFilterStatus || undefined);
    setOptional(filters, "dateFrom", maintenanceFilterDateFrom);
    setOptional(filters, "dateTo", maintenanceFilterDateTo);

    setIsMaintenanceFilterSubmitting(true);
    setMaintenanceFeedback(null);
    try {
      const filtered = await listMaintenanceRequests(token, filters);
      setMaintenanceRequests(sortMaintenanceDesc(filtered));
      setMaintenanceFeedback({
        kind: "info",
        message: "Bakim filtreleri uygulandi."
      });
    } catch (error) {
      setMaintenanceFeedback({
        kind: "error",
        message: toUserMessage(error, "Bakim filtre formu gonderilemedi.")
      });
    } finally {
      setIsMaintenanceFilterSubmitting(false);
    }
  }

  async function onUpdateMaintenanceStatus(requestId: string, status: MaintenanceStatus) {
    setMaintenanceBusyId(requestId);
    setMaintenanceFeedback(null);
    try {
      const updated = await updateMaintenanceStatus(token, requestId, status);
      setMaintenanceRequests((current) =>
        sortMaintenanceDesc(current.map((item) => (item.id === requestId ? updated : item)))
      );
      setMaintenanceFeedback({
        kind: "info",
        message: "Bakim talep durumu guncellendi."
      });
    } catch (error) {
      setMaintenanceFeedback({
        kind: "error",
        message: toUserMessage(error, "Bakim talebi guncellenemedi.")
      });
    } finally {
      setMaintenanceBusyId(null);
    }
  }

  async function onGenerateMonthlyDues() {
    setIsDuesSubmitting(true);
    setDuesFeedback(null);
    try {
      const message = await generateMonthlyDues(token, reportMonth);
      setDuesFeedback({
        kind: "info",
        message
      });
      setDues(await listDues(token));
      await refreshDashboardSnapshot();
    } catch (error) {
      setDuesFeedback({
        kind: "error",
        message: toUserMessage(error, "Aidat formu gonderilemedi. Lutfen tekrar deneyin.")
      });
    } finally {
      setIsDuesSubmitting(false);
    }
  }

  async function onCancelReservation(reservationId: string) {
    setReservationBusyId(reservationId);
    setReservationFeedback(null);
    try {
      await cancelReservation(token, reservationId);
      setReservations(await listReservations(token));
      await refreshDashboardSnapshot();
      setReservationFeedback({
        kind: "info",
        message: "Rezervasyon iptal edildi."
      });
    } catch (error) {
      setReservationFeedback({
        kind: "error",
        message: toUserMessage(error, "Rezervasyon iptal formu tamamlanamadi.")
      });
    } finally {
      setReservationBusyId(null);
    }
  }

  async function onAssignSpot() {
    setParkingFeedback(null);
    if (!selectedSpotId) {
      setParkingFeedback({
        kind: "error",
        message: "Park yeri secilmeden atama kaydedilemez."
      });
      return;
    }

    setIsAssigningSpot(true);
    try {
      const updated = await assignParkingSpot(token, selectedSpotId, selectedSpotApartmentId || null);
      setParkingSpots((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await refreshDashboardSnapshot();
      setParkingFeedback({
        kind: "info",
        message: "Park yeri atamasi guncellendi."
      });
    } catch (error) {
      setParkingFeedback({
        kind: "error",
        message: toUserMessage(error, "Park atama formu gonderilemedi.")
      });
    } finally {
      setIsAssigningSpot(false);
    }
  }

  return (
    <article data-testid="admin-page" className="page-container">
      <Title order={2} className="page-title">Yonetici Paneli</Title>
      {isLoading ? (
        <div className="loading-shimmer">
          <div className="loading-shimmer-bar" />
          <div className="loading-shimmer-bar" />
          <div className="loading-shimmer-bar" />
        </div>
      ) : null}
      {loadErrorMessage ? (
        <Alert variant="light" color="red" icon={<IconAlertCircle size={16} />} mt="sm" radius="lg">
          {loadErrorMessage}
        </Alert>
      ) : null}

      {dashboard ? (
        <section className="announcement-section" data-testid="admin-dashboard">
          <h3>Dashboard</h3>
          <div className="kpi-grid">
            <article className="kpi-card">
              <h4>Toplam Tahsilat</h4>
              <p data-testid="kpi-total-collection">{formatMoney(dashboard.totalCollection)} TL</p>
            </article>
            <article className="kpi-card">
              <h4>Açık Bakım</h4>
              <p data-testid="kpi-open-maintenance">{dashboard.openMaintenanceCount}</p>
            </article>
            <article className="kpi-card">
              <h4>Park Doluluk</h4>
              <p data-testid="kpi-occupancy">%{formatMoney(dashboard.occupancyRate)}</p>
            </article>
          </div>
          <div className="dashboard-grid">
            <article className="chart-container">
              <h4>Bakım Kategori Dağılımı</h4>
              <MaintenancePieChart buckets={dashboard.maintenanceByCategory} />
            </article>
            <article className="chart-container">
              <h4>12 Aylık Tahsilat Trendi</h4>
              <DuesTrendLineChart points={dashboard.duesTrend} />
            </article>
          </div>
          <article className="announcement-card">
            <h4>Borclu Daireler (Gelismis Filtre)</h4>
            <div className="auth-form debtor-filter-form">
              <TextInput
                id="debtor-search"
                data-testid="debtor-search"
                label="Daire Ara"
                value={debtorSearch}
                onChange={(event) => setDebtorSearch(event.target.value)}
                placeholder="A-1, B-8..."
              />
              <TextInput
                id="debtor-min-outstanding"
                data-testid="debtor-min-outstanding"
                label="Min Borc (TL)"
                type="number"
                min={0}
                step="0.01"
                value={debtorMinOutstanding}
                onChange={(event) => setDebtorMinOutstanding(event.target.value)}
              />
              <Checkbox
                id="debtor-only-overdue"
                data-testid="debtor-only-overdue"
                label="Sadece Gecikmeli"
                checked={debtorOnlyOverdue}
                onChange={(event) => setDebtorOnlyOverdue(event.currentTarget.checked)}
                mt={30}
              />
            </div>
            <p data-testid="debtor-count">
              Filtrelenen borclu daire: {filteredDebtors.length} / {dashboard.debtorApartments.length}
            </p>
            <div className="announcement-list">
              {filteredDebtors.map((debtor) => (
                <article key={debtor.apartmentId} className="announcement-card debtor-card">
                  <h4>{debtor.apartmentLabel}</h4>
                  <p>Borc: {formatMoney(debtor.outstandingAmount)} TL</p>
                  <p>Gecikmis kayit: {debtor.overdueCount}</p>
                </article>
              ))}
              {filteredDebtors.length === 0 ? <p>Filtreye uyan borclu daire yok.</p> : null}
            </div>
          </article>
          <div className="inline-actions">
            <p>Borclu daire sayisi: {dashboard.debtorApartments.length}</p>
            <Anchor href={monthlyReportUrl(reportMonth)}>Aylik Tahsilat PDF Raporu</Anchor>
          </div>
        </section>
      ) : null}

      <section className="announcement-section">
        <h3>Kullanici Yonetimi</h3>
        <div className="auth-form">
          <TextInput
            id="create-user-name"
            label="Ad Soyad"
            value={createUserName}
            onChange={(event) => setCreateUserName(event.target.value)}
          />
          <TextInput
            id="create-user-email"
            label="E-posta"
            type="email"
            value={createUserEmail}
            onChange={(event) => setCreateUserEmail(event.target.value)}
          />
          <TextInput
            id="create-user-password"
            label="Sifre"
            type="text"
            minLength={12}
            value={createUserPassword}
            onChange={(event) => setCreateUserPassword(event.target.value)}
          />
          <NativeSelect
            id="create-user-role"
            label="Rol"
            value={createUserRole}
            onChange={(event) => setCreateUserRole(event.target.value as Role)}
            data={[
              { value: "RESIDENT", label: "Sakin" },
              { value: "SECURITY", label: "Guvenlik" },
              { value: "ADMIN", label: "Yonetici" }
            ]}
          />
          <NativeSelect
            id="create-user-apartment"
            label="Daire (opsiyonel)"
            value={createUserApartmentId}
            onChange={(event) => setCreateUserApartmentId(event.target.value)}
            data={[
              { value: "", label: "Seciniz" },
              ...apartments.map((apartment) => ({
                value: apartment.id,
                label: apartment.label
              }))
            ]}
          />
          <Button type="button" disabled={isCreateUserSubmitting} onClick={() => void onCreateUser()}>
            {isCreateUserSubmitting ? "Olusturuluyor..." : "Kullanici Olustur"}
          </Button>
        </div>
        <FeedbackMessage feedback={userFeedback} testId="admin-user-feedback" />
        <div className="user-list">
          {users.map((managedUser) => (
            <div key={managedUser.id} className="user-row">
              <div>
                <p className="user-name">
                  {managedUser.name} ({roleLabel(managedUser.role)})
                </p>
                <p>{managedUser.email}</p>
                <p>Daire: {managedUser.apartmentLabel ?? "-"}</p>
                <p>Durum: {managedUser.isActive ? "Aktif" : "Pasif"}</p>
              </div>
              <Button
                type="button"
                disabled={pendingUserId === managedUser.id || managedUser.id === user.id}
                onClick={() => {
                  void onToggleUserActivation(managedUser);
                }}
              >
                {managedUser.isActive ? "Pasife Al" : "Aktif Et"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="announcement-section">
        <h3>Duyurular</h3>
        <div className="auth-form">
          <TextInput
            id="announcement-title"
            data-testid="admin-announcement-title"
            label="Baslik"
            value={announcementTitle}
            onChange={(event) => setAnnouncementTitle(event.target.value)}
          />
          <Textarea
            id="announcement-content"
            data-testid="admin-announcement-content"
            label="Icerik"
            rows={4}
            value={announcementContent}
            onChange={(event) => setAnnouncementContent(event.target.value)}
          />
          <Button
            type="button"
            data-testid="admin-announcement-publish"
            disabled={isAnnouncementSubmitting}
            onClick={() => void onPublishAnnouncement()}
          >
            {isAnnouncementSubmitting ? "Yayimlaniyor..." : "Duyuru Yayimla"}
          </Button>
        </div>
        <FeedbackMessage feedback={announcementFeedback} testId="admin-announcement-feedback" />
        <div className="announcement-list">
          {announcements.map((announcement) => (
            <article key={announcement.id} className="announcement-card">
              <header>
                <h4>{announcement.title}</h4>
                <p>{formatDateTime(announcement.publishedAt)}</p>
              </header>
              <p>{announcement.content}</p>
              <div className="inline-actions">
                <Button
                  type="button"
                  disabled={announcementBusyId === announcement.id}
                  onClick={() => {
                    void onQuickUpdateAnnouncement(announcement);
                  }}
                >
                  Hemen Guncelle
                </Button>
                <Button
                  type="button"
                  disabled={announcementBusyId === announcement.id}
                  onClick={() => {
                    void onDeleteAnnouncement(announcement.id);
                  }}
                >
                  Sil
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="announcement-section">
        <h3>Bakim Talepleri</h3>
        <div className="auth-form maintenance-filter-form">
          <TextInput
            id="maintenance-category"
            label="Kategori"
            value={maintenanceFilterCategory}
            onChange={(event) => setMaintenanceFilterCategory(event.target.value)}
          />
          <NativeSelect
            id="maintenance-status"
            label="Durum"
            value={maintenanceFilterStatus}
            onChange={(event) => setMaintenanceFilterStatus((event.target.value || "") as MaintenanceStatus | "")}
            data={[
              { value: "", label: "Tum durumlar" },
              ...maintenanceStatuses.map((status) => ({
                value: status,
                label: formatMaintenanceStatus(status)
              }))
            ]}
          />
          <TextInput
            id="maintenance-date-from"
            label="Baslangic"
            type="date"
            value={maintenanceFilterDateFrom}
            onChange={(event) => setMaintenanceFilterDateFrom(event.target.value)}
          />
          <TextInput
            id="maintenance-date-to"
            label="Bitis"
            type="date"
            value={maintenanceFilterDateTo}
            onChange={(event) => setMaintenanceFilterDateTo(event.target.value)}
          />
          <Button type="button" disabled={isMaintenanceFilterSubmitting} onClick={() => void onApplyMaintenanceFilters()}>
            {isMaintenanceFilterSubmitting ? "Filtreleniyor..." : "Filtrele"}
          </Button>
        </div>
        <FeedbackMessage feedback={maintenanceFeedback} testId="admin-maintenance-feedback" />
        <div className="announcement-list">
          {maintenanceRequests.map((request) => (
            <article key={request.id} className="announcement-card" data-testid={`admin-maintenance-${request.id}`}>
              <h4>{request.category}</h4>
              <p>{request.description}</p>
              <p>Durum: {formatMaintenanceStatus(request.status)}</p>
              <div className="inline-actions">
                {maintenanceStatuses.map((status) => (
                  <Button
                    key={status}
                    type="button"
                    data-testid={`admin-maintenance-${request.id}-${status}`}
                    disabled={maintenanceBusyId === request.id || request.status === status}
                    onClick={() => {
                      void onUpdateMaintenanceStatus(request.id, status);
                    }}
                  >
                    {formatMaintenanceStatus(status)}
                  </Button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="announcement-section">
        <h3>Aidat ve Odemeler</h3>
        <div className="inline-actions">
          <TextInput
            type="month"
            data-testid="admin-report-month"
            value={reportMonth}
            onChange={(event) => setReportMonth(event.target.value)}
          />
          <Button
            type="button"
            data-testid="admin-generate-dues"
            disabled={isDuesSubmitting}
            onClick={() => void onGenerateMonthlyDues()}
          >
            {isDuesSubmitting ? "Olusturuluyor..." : "Aylik Aidat Olustur"}
          </Button>
          <Anchor href={monthlyReportUrl(reportMonth)}>PDF Tahsilat Raporu</Anchor>
        </div>
        <FeedbackMessage feedback={duesFeedback} testId="admin-dues-feedback" />
        <p>Aidat kaydi: {dues.length}</p>
        <p>Odeme kaydi: {payments.length}</p>
      </section>

      <section className="announcement-section">
        <h3>Rezervasyonlar</h3>
        <div className="announcement-list">
          {reservations.map((reservation) => (
            <article key={reservation.id} className="announcement-card">
              <h4>{reservation.commonAreaName}</h4>
              <p>
                {reservation.residentName} | {formatDateTime(reservation.startsAt)} - {formatDateTime(reservation.endsAt)}
              </p>
              <p>Durum: {reservation.status}</p>
              {reservation.status === "ACTIVE" ? (
                <Button
                  type="button"
                  disabled={reservationBusyId === reservation.id}
                  onClick={() => void onCancelReservation(reservation.id)}
                >
                  Iptal Et
                </Button>
              ) : null}
            </article>
          ))}
        </div>
        <FeedbackMessage feedback={reservationFeedback} testId="admin-reservation-feedback" />
      </section>

      <section className="announcement-section">
        <h3>Park ve Ziyaretci Takibi</h3>
        <div className="auth-form">
          <NativeSelect
            id="spot-select"
            data-testid="admin-spot-select"
            label="Park Yeri"
            value={selectedSpotId}
            onChange={(event) => setSelectedSpotId(event.target.value)}
            data={[
              { value: "", label: "Seciniz" },
              ...parkingSpots.map((spot) => ({
                value: spot.id,
                label: `${spot.spotNumber} (${spot.type})`
              }))
            ]}
          />
          <NativeSelect
            id="spot-apartment-select"
            data-testid="admin-spot-apartment-select"
            label="Daire Atama"
            value={selectedSpotApartmentId}
            onChange={(event) => setSelectedSpotApartmentId(event.target.value)}
            data={[
              { value: "", label: "Bosalt" },
              ...apartments.map((apartment) => ({
                value: apartment.id,
                label: apartment.label
              }))
            ]}
          />
          <Button type="button" data-testid="admin-spot-save" disabled={isAssigningSpot} onClick={() => void onAssignSpot()}>
            {isAssigningSpot ? "Kaydediliyor..." : "Atamayi Kaydet"}
          </Button>
        </div>
        <FeedbackMessage feedback={parkingFeedback} testId="admin-parking-feedback" />
        <ParkingOccupancyMap spots={parkingSpots} />
        <p>Aktif ziyaretci: {visitorVehicles.filter((vehicle) => vehicle.exitedAt === null).length}</p>
      </section>

      <section className="announcement-section">
        <h3>Bildirimler</h3>
        <NotificationList
          notifications={notifications}
          onMarkRead={async (notificationId) => {
            await onMarkNotificationRead(notificationId);
          }}
        />
      </section>
    </article>
  );
}

export function ResidentShellPage() {
  const accessToken = useSessionToken();
  const token = accessToken ?? "";

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [commonAreas, setCommonAreas] = useState<CommonArea[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [maintenanceCategory, setMaintenanceCategory] = useState("");
  const [maintenanceDescription, setMaintenanceDescription] = useState("");
  const [maintenancePhotoUrl, setMaintenancePhotoUrl] = useState("");
  const [reservationAreaId, setReservationAreaId] = useState("");
  const [reservationStart, setReservationStart] = useState("");
  const [reservationEnd, setReservationEnd] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");

  const [loadErrorMessage, setLoadErrorMessage] = useState("");
  const [profileFeedback, setProfileFeedback] = useState<FormFeedback>(null);
  const [maintenanceFeedback, setMaintenanceFeedback] = useState<FormFeedback>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<FormFeedback>(null);
  const [reservationFeedback, setReservationFeedback] = useState<FormFeedback>(null);
  const [isProfileSubmitting, setIsProfileSubmitting] = useState(false);
  const [isMaintenanceSubmitting, setIsMaintenanceSubmitting] = useState(false);
  const [maintenanceRatingBusyId, setMaintenanceRatingBusyId] = useState<string | null>(null);
  const [paymentBusyKey, setPaymentBusyKey] = useState<string | null>(null);
  const [isReservationSubmitting, setIsReservationSubmitting] = useState(false);
  const [reservationBusyId, setReservationBusyId] = useState<string | null>(null);
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!token) {
      return;
    }

    let isCancelled = false;
    setLoadErrorMessage("");

    void Promise.all([
      listAnnouncements(token),
      listMaintenanceRequests(token),
      listDues(token),
      listPayments(token),
      listReservations(token),
      listCommonAreas(token),
      fetchUserProfile(token),
      listNotifications(token)
    ])
      .then(
        ([
          announcementsResponse,
          maintenanceResponse,
          duesResponse,
          paymentsResponse,
          reservationsResponse,
          areasResponse,
          profileResponse,
          notificationsResponse
        ]) => {
          if (isCancelled) {
            return;
          }

          setAnnouncements(sortAnnouncementsDesc(announcementsResponse));
          setMaintenanceRequests(sortMaintenanceDesc(maintenanceResponse));
          setDues(duesResponse);
          setPayments(paymentsResponse);
          setReservations(reservationsResponse);
          setCommonAreas(areasResponse);
          setProfile(profileResponse);
          setProfileName(profileResponse.name);
          setProfilePhone(profileResponse.phone ?? "");
          setNotifications(sortNotificationsDesc(notificationsResponse.notifications));
        }
      )
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }
        setLoadErrorMessage(toUserMessage(error, "Sakin panel verileri yuklenemedi."));
      });

    return () => {
      isCancelled = true;
    };
  }, [token]);

  if (!accessToken) {
    return (
      <article>
        <h2>Sakin Paneli</h2>
        <p>Oturum bilgisi bulunamadi.</p>
      </article>
    );
  }

  async function onMarkNotificationRead(notificationId: string) {
    try {
      const updated = await markNotificationRead(token, notificationId);
      setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      return;
    }
  }

  async function onCreateMaintenanceRequest() {
    setIsMaintenanceSubmitting(true);
    setMaintenanceFeedback(null);
    try {
      const created = await createMaintenanceRequest(token, {
        category: maintenanceCategory,
        description: maintenanceDescription,
        photoUrl: maintenancePhotoUrl
      });
      setMaintenanceRequests((current) => sortMaintenanceDesc([created, ...current]));
      setMaintenanceCategory("");
      setMaintenanceDescription("");
      setMaintenancePhotoUrl("");
      setMaintenanceFeedback({
        kind: "info",
        message: "Bakim talebi olusturuldu."
      });
    } catch (error) {
      setMaintenanceFeedback({
        kind: "error",
        message: toUserMessage(error, "Bakim talep formu gonderilemedi. Lutfen alanlari kontrol edin.")
      });
    } finally {
      setIsMaintenanceSubmitting(false);
    }
  }

  async function onRateMaintenanceRequest(requestId: string) {
    const rating = ratingDrafts[requestId] ?? 5;
    setMaintenanceRatingBusyId(requestId);
    setMaintenanceFeedback(null);
    try {
      const updated = await rateMaintenanceRequest(token, requestId, rating);
      setMaintenanceRequests((current) =>
        sortMaintenanceDesc(current.map((item) => (item.id === requestId ? updated : item)))
      );
      setMaintenanceFeedback({
        kind: "info",
        message: "Bakim talebi puanlandi."
      });
    } catch (error) {
      setMaintenanceFeedback({
        kind: "error",
        message: toUserMessage(error, "Bakim puanlama islemi tamamlanamadi.")
      });
    } finally {
      setMaintenanceRatingBusyId(null);
    }
  }

  async function onPayDue(dueId: string, method: PaymentMethod) {
    const busyKey = `${dueId}:${method}`;
    setPaymentBusyKey(busyKey);
    setPaymentFeedback(null);
    try {
      const payment = await createPayment(token, { dueId, method });
      setPayments((current) => [payment, ...current]);
      setDues(await listDues(token));
      setPaymentFeedback({
        kind: "info",
        message: "Odeme tamamlandi."
      });
    } catch (error) {
      setPaymentFeedback({
        kind: "error",
        message: toUserMessage(error, "Odeme formu gonderilemedi.")
      });
    } finally {
      setPaymentBusyKey(null);
    }
  }

  async function onCreateReservation() {
    setIsReservationSubmitting(true);
    setReservationFeedback(null);
    try {
      await createReservation(token, {
        commonAreaId: reservationAreaId,
        startsAt: new Date(reservationStart).toISOString(),
        endsAt: new Date(reservationEnd).toISOString()
      });
      setReservations(await listReservations(token));
      setReservationFeedback({
        kind: "info",
        message: "Rezervasyon olusturuldu."
      });
    } catch (error) {
      setReservationFeedback({
        kind: "error",
        message: toUserMessage(error, "Rezervasyon formu gonderilemedi. Saatleri kontrol edin.")
      });
    } finally {
      setIsReservationSubmitting(false);
    }
  }

  async function onCancelReservation(reservationId: string) {
    setReservationBusyId(reservationId);
    setReservationFeedback(null);
    try {
      await cancelReservation(token, reservationId);
      setReservations(await listReservations(token));
      setReservationFeedback({
        kind: "info",
        message: "Rezervasyon iptal edildi."
      });
    } catch (error) {
      setReservationFeedback({
        kind: "error",
        message: toUserMessage(error, "Rezervasyon iptal islemi tamamlanamadi.")
      });
    } finally {
      setReservationBusyId(null);
    }
  }

  async function onUpdateProfile() {
    setIsProfileSubmitting(true);
    setProfileFeedback(null);
    try {
      const updated = await updateUserProfile(token, {
        name: profileName,
        phone: profilePhone
      });
      setProfile(updated);
      setProfileFeedback({
        kind: "info",
        message: "Profil guncellendi."
      });
    } catch (error) {
      setProfileFeedback({
        kind: "error",
        message: toUserMessage(error, "Profil formu gonderilemedi.")
      });
    } finally {
      setIsProfileSubmitting(false);
    }
  }

  return (
    <article data-testid="resident-page" className="page-container">
      <Title order={2} className="page-title">Sakin Paneli</Title>
      {loadErrorMessage ? (
        <Alert variant="light" color="red" icon={<IconAlertCircle size={16} />} mt="sm" radius="lg">
          {loadErrorMessage}
        </Alert>
      ) : null}

      <section className="announcement-section">
        <h3>Profil</h3>
        {profile ? (
          <div className="auth-form">
            <TextInput
              id="resident-name"
              label="Ad Soyad"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
            />
            <TextInput
              id="resident-phone"
              label="Telefon"
              value={profilePhone}
              onChange={(event) => setProfilePhone(event.target.value)}
            />
            <p>Daire: {profile.apartment ? `${profile.apartment.block}-${profile.apartment.number}` : "-"}</p>
            <Button type="button" disabled={isProfileSubmitting} onClick={() => void onUpdateProfile()}>
              {isProfileSubmitting ? "Guncelleniyor..." : "Profili Guncelle"}
            </Button>
            <FeedbackMessage feedback={profileFeedback} testId="resident-profile-feedback" />
          </div>
        ) : null}
      </section>

      <section className="announcement-section">
        <h3>Duyurular</h3>
        <AnnouncementList announcements={announcements} emptyMessage="Henuz duyuru yok." />
      </section>

      <section className="announcement-section">
        <h3>Bakim Talepleri</h3>
        <div className="auth-form">
          <TextInput
            id="maintenance-create-category"
            data-testid="resident-maintenance-category"
            label="Kategori"
            value={maintenanceCategory}
            onChange={(event) => setMaintenanceCategory(event.target.value)}
          />
          <Textarea
            id="maintenance-create-description"
            data-testid="resident-maintenance-description"
            label="Aciklama"
            rows={4}
            value={maintenanceDescription}
            onChange={(event) => setMaintenanceDescription(event.target.value)}
          />
          <TextInput
            id="maintenance-create-photo"
            data-testid="resident-maintenance-photo"
            label="Fotograf Baglantisi veya data URL"
            value={maintenancePhotoUrl}
            onChange={(event) => setMaintenancePhotoUrl(event.target.value)}
          />
          <Button
            type="button"
            data-testid="resident-maintenance-submit"
            disabled={isMaintenanceSubmitting}
            onClick={() => void onCreateMaintenanceRequest()}
          >
            {isMaintenanceSubmitting ? "Gonderiliyor..." : "Talep Gonder"}
          </Button>
        </div>
        <FeedbackMessage feedback={maintenanceFeedback} testId="resident-maintenance-feedback" />
        <div className="announcement-list">
          {maintenanceRequests.map((request) => (
            <article key={request.id} className="announcement-card" data-testid={`resident-maintenance-${request.id}`}>
              <h4>{request.category}</h4>
              <p>{request.description}</p>
              <p>Durum: {formatMaintenanceStatus(request.status)}</p>
              {request.status === "TAMAMLANDI" ? (
                request.rating ? (
                  <p>Puan: {request.rating}/5</p>
                ) : (
                  <div className="inline-actions">
                    <NativeSelect
                      value={String(ratingDrafts[request.id] ?? 5)}
                      onChange={(event) =>
                        setRatingDrafts((current) => ({
                          ...current,
                          [request.id]: Number(event.target.value)
                        }))
                      }
                      data={[
                        { value: "1", label: "1" },
                        { value: "2", label: "2" },
                        { value: "3", label: "3" },
                        { value: "4", label: "4" },
                        { value: "5", label: "5" }
                      ]}
                    />
                    <Button
                      type="button"
                      disabled={maintenanceRatingBusyId === request.id}
                      onClick={() => void onRateMaintenanceRequest(request.id)}
                    >
                      Puanla
                    </Button>
                  </div>
                )
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="announcement-section">
        <h3>Aidat ve Odeme</h3>
        <div className="announcement-list">
          {dues.map((due) => (
            <article key={due.id} className="announcement-card" data-testid={`resident-due-${due.id}`}>
              <h4>{due.apartmentLabel}</h4>
              <p>Vade: {formatDateTime(due.dueDate)}</p>
              <p>Durum: {due.status}</p>
              <p>Kalan: {formatMoney(due.outstandingAmount)} TL</p>
              {due.outstandingAmount > 0 ? (
                <div className="inline-actions">
                  {paymentMethods.map((method) => (
                    <Button
                      key={method}
                      type="button"
                      data-testid={`resident-pay-${due.id}-${method}`}
                      disabled={paymentBusyKey !== null}
                      onClick={() => void onPayDue(due.id, method)}
                    >
                      {method === "CREDIT_CARD" ? "Kart ile Ode" : "Havale ile Ode"}
                    </Button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
        <FeedbackMessage feedback={paymentFeedback} testId="resident-payment-feedback" />

        <h4>Odeme Gecmisi</h4>
        <div className="announcement-list">
          {payments.map((payment) => (
            <article key={payment.id} className="announcement-card" data-testid={`resident-payment-${payment.id}`}>
              <p>
                {payment.apartmentLabel} | {formatDateTime(payment.paidAt)}
              </p>
              <p>
                {formatMoney(payment.amount)} TL | {payment.method}
              </p>
              <Anchor href={paymentReceiptUrl(payment.id)}>Makbuz PDF</Anchor>
            </article>
          ))}
        </div>
      </section>

      <section className="announcement-section">
        <h3>Rezervasyon</h3>
        <div className="auth-form">
          <NativeSelect
            id="reservation-area"
            data-testid="resident-reservation-area"
            label="Ortak Alan"
            value={reservationAreaId}
            onChange={(event) => setReservationAreaId(event.target.value)}
            data={[
              { value: "", label: "Seciniz" },
              ...commonAreas.map((area) => ({
                value: area.id,
                label: area.name
              }))
            ]}
          />
          <TextInput
            id="reservation-start"
            data-testid="resident-reservation-start"
            type="datetime-local"
            label="Baslangic"
            value={reservationStart}
            onChange={(event) => setReservationStart(event.target.value)}
          />
          <TextInput
            id="reservation-end"
            data-testid="resident-reservation-end"
            type="datetime-local"
            label="Bitis"
            value={reservationEnd}
            onChange={(event) => setReservationEnd(event.target.value)}
          />
          <Button
            type="button"
            data-testid="resident-reservation-submit"
            disabled={isReservationSubmitting}
            onClick={() => void onCreateReservation()}
          >
            {isReservationSubmitting ? "Kaydediliyor..." : "Rezervasyon Yap"}
          </Button>
        </div>
        <FeedbackMessage feedback={reservationFeedback} testId="resident-reservation-feedback" />
        <div className="announcement-list">
          {reservations.map((reservation) => (
            <article key={reservation.id} className="announcement-card" data-testid={`resident-reservation-${reservation.id}`}>
              <p>{reservation.commonAreaName}</p>
              <p>
                {formatDateTime(reservation.startsAt)} - {formatDateTime(reservation.endsAt)}
              </p>
              <p>Durum: {reservation.status}</p>
              {reservation.status === "ACTIVE" ? (
                <Button
                  type="button"
                  data-testid={`resident-reservation-cancel-${reservation.id}`}
                  disabled={reservationBusyId === reservation.id}
                  onClick={() => void onCancelReservation(reservation.id)}
                >
                  Iptal
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="announcement-section">
        <h3>Bildirimler</h3>
        <NotificationList
          notifications={notifications}
          onMarkRead={async (notificationId) => {
            await onMarkNotificationRead(notificationId);
          }}
        />
      </section>
    </article>
  );
}

export function SecurityShellPage() {
  const accessToken = useSessionToken();
  const token = accessToken ?? "";

  const [apartments, setApartments] = useState<Array<{ id: string; label: string }>>([]);
  const [parkingSpots, setParkingSpots] = useState<ParkingSpot[]>([]);
  const [visitorVehicles, setVisitorVehicles] = useState<VisitorVehicle[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [plate, setPlate] = useState("");
  const [apartmentId, setApartmentId] = useState("");
  const [parkingSpotId, setParkingSpotId] = useState("");
  const [loadErrorMessage, setLoadErrorMessage] = useState("");
  const [visitorFeedback, setVisitorFeedback] = useState<FormFeedback>(null);
  const [isVisitorSubmitting, setIsVisitorSubmitting] = useState(false);
  const [visitorExitBusyId, setVisitorExitBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isCancelled = false;
    setLoadErrorMessage("");

    void Promise.all([listApartments(token), listParkingSpots(token), listVisitorVehicles(token), listNotifications(token)])
      .then(([apartmentsResponse, parkingResponse, visitorResponse, notificationsResponse]) => {
        if (isCancelled) {
          return;
        }

        setApartments(apartmentsResponse.map((item) => ({ id: item.id, label: `${item.block}-${item.number}` })));
        setParkingSpots(parkingResponse);
        setVisitorVehicles(visitorResponse);
        setNotifications(sortNotificationsDesc(notificationsResponse.notifications));
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return;
        }
        setLoadErrorMessage(toUserMessage(error, "Guvenlik paneli verileri yuklenemedi."));
      });

    return () => {
      isCancelled = true;
    };
  }, [token]);

  if (!accessToken) {
    return (
      <article>
        <h2>Guvenlik Paneli</h2>
        <p>Guvenlik oturumu bulunamadi.</p>
      </article>
    );
  }

  async function onMarkNotificationRead(notificationId: string) {
    try {
      const updated = await markNotificationRead(token, notificationId);
      setNotifications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      return;
    }
  }

  async function onCreateVisitor() {
    setIsVisitorSubmitting(true);
    setVisitorFeedback(null);

    try {
      const created = await createVisitorVehicle(token, {
        plate,
        apartmentId,
        parkingSpotId
      });
      setVisitorVehicles((current) => [created, ...current]);
      setPlate("");
      setVisitorFeedback({
        kind: "info",
        message: "Ziyaretci kaydi olusturuldu."
      });
    } catch (error) {
      setVisitorFeedback({
        kind: "error",
        message: toUserMessage(error, "Ziyaretci giris formu gonderilemedi.")
      });
    } finally {
      setIsVisitorSubmitting(false);
    }
  }

  async function onExitVisitor(vehicleId: string) {
    setVisitorExitBusyId(vehicleId);
    setVisitorFeedback(null);
    try {
      const updated = await exitVisitorVehicle(token, vehicleId);
      setVisitorVehicles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setVisitorFeedback({
        kind: "info",
        message: "Ziyaretci cikisi kaydedildi."
      });
    } catch (error) {
      setVisitorFeedback({
        kind: "error",
        message: toUserMessage(error, "Ziyaretci cikis islemi tamamlanamadi.")
      });
    } finally {
      setVisitorExitBusyId(null);
    }
  }

  const visitorSpots = parkingSpots.filter((spot) => spot.type === "VISITOR");

  return (
    <article data-testid="security-page" className="page-container">
      <Title order={2} className="page-title">Güvenlik Paneli</Title>
      {loadErrorMessage ? (
        <Alert variant="light" color="red" icon={<IconAlertCircle size={16} />} mt="sm" radius="lg">
          {loadErrorMessage}
        </Alert>
      ) : null}

      <section className="announcement-section">
        <h3>Ziyaretci Arac Girisi</h3>
        <div className="auth-form">
          <TextInput
            id="visitor-plate"
            data-testid="security-visitor-plate"
            label="Plaka"
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
          />
          <NativeSelect
            id="visitor-apartment"
            data-testid="security-visitor-apartment"
            label="Daire"
            value={apartmentId}
            onChange={(event) => setApartmentId(event.target.value)}
            data={[
              { value: "", label: "Seciniz" },
              ...apartments.map((apartment) => ({
                value: apartment.id,
                label: apartment.label
              }))
            ]}
          />
          <NativeSelect
            id="visitor-spot"
            data-testid="security-visitor-spot"
            label="Ziyaretci Park Yeri"
            value={parkingSpotId}
            onChange={(event) => setParkingSpotId(event.target.value)}
            data={[
              { value: "", label: "Seciniz" },
              ...visitorSpots.map((spot) => ({
                value: spot.id,
                label: spot.spotNumber
              }))
            ]}
          />
          <Button
            type="button"
            data-testid="security-visitor-submit"
            disabled={isVisitorSubmitting}
            onClick={() => void onCreateVisitor()}
          >
            {isVisitorSubmitting ? "Kaydediliyor..." : "Giris Kaydet"}
          </Button>
        </div>
        <FeedbackMessage feedback={visitorFeedback} testId="security-visitor-feedback" />
      </section>

      <section className="announcement-section">
        <h3>Aktif Ziyaretciler</h3>
        <div className="announcement-list">
          {visitorVehicles.map((vehicle) => (
            <article key={vehicle.id} className="announcement-card" data-testid={`security-vehicle-${vehicle.id}`}>
              <p>
                {vehicle.plate} | {vehicle.apartmentLabel} | {vehicle.parkingSpotNumber}
              </p>
              <p>Giris: {formatDateTime(vehicle.enteredAt)}</p>
              <p>Durum: {vehicle.exitedAt ? "Cikti" : "Iceride"}</p>
              {vehicle.isOverdue ? <p className="error">4 saat limiti asildi.</p> : null}
              {!vehicle.exitedAt ? (
                <Button
                  type="button"
                  data-testid={`security-vehicle-exit-${vehicle.id}`}
                  disabled={visitorExitBusyId === vehicle.id}
                  onClick={() => void onExitVisitor(vehicle.id)}
                >
                  Cikis Kaydet
                </Button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="announcement-section">
        <h3>Bildirimler</h3>
        <NotificationList
          notifications={notifications}
          onMarkRead={async (notificationId) => {
            await onMarkNotificationRead(notificationId);
          }}
        />
      </section>
    </article>
  );
}

export function UnauthorizedPage() {
  return (
    <article className="page-container">
      <div className="announcement-section" style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
        <Title order={2} mb="sm">Yetki Sınırı</Title>
        <Text c="dimmed" size="lg">Seçilen rol bu alana erişemiyor.</Text>
      </div>
    </article>
  );
}
