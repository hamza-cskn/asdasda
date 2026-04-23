import { z } from "zod";

const isoDateTimeSchema = z.string().datetime();
const moneySchema = z.number().finite().nonnegative();

export const roleSchema = z.enum(["ADMIN", "RESIDENT", "SECURITY"]);
export type Role = z.infer<typeof roleSchema>;

export const dueStatusSchema = z.enum(["PENDING", "PAID", "OVERDUE"]);
export type DueStatus = z.infer<typeof dueStatusSchema>;

export const paymentMethodSchema = z.enum(["CREDIT_CARD", "BANK_TRANSFER"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const maintenanceStatusSchema = z.enum(["BEKLEMEDE", "ISLEMDE", "TAMAMLANDI"]);
export type MaintenanceStatus = z.infer<typeof maintenanceStatusSchema>;

export const reservationStatusSchema = z.enum(["ACTIVE", "CANCELLED"]);
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

export const commonAreaTypeSchema = z.enum(["GYM", "MEETING_ROOM", "CHILD_PARK"]);
export type CommonAreaType = z.infer<typeof commonAreaTypeSchema>;

export const parkingSpotTypeSchema = z.enum(["STANDARD", "ACCESSIBLE", "VISITOR"]);
export type ParkingSpotType = z.infer<typeof parkingSpotTypeSchema>;

export const notificationCategorySchema = z.enum([
  "PASSWORD_RESET",
  "ANNOUNCEMENT_PUBLISHED",
  "MAINTENANCE_REQUEST_CREATED",
  "MAINTENANCE_STATUS_UPDATED",
  "MAINTENANCE_ESCALATED_7D",
  "DUE_OVERDUE",
  "DUE_DEBTOR_3_MONTHS",
  "PAYMENT_RECEIVED",
  "RESERVATION_CREATED",
  "RESERVATION_CANCELLED",
  "VISITOR_OVERSTAY",
  "SYSTEM_BACKUP"
]);
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;

export const apartmentSchema = z.object({
  id: z.string().min(1),
  block: z.string().min(1),
  floor: z.number().int(),
  number: z.string().min(1),
  monthlyDue: moneySchema,
  isOccupied: z.boolean(),
  residentId: z.string().min(1).nullable(),
  residentName: z.string().min(1).nullable()
});
export type Apartment = z.infer<typeof apartmentSchema>;

export const apartmentListResponseSchema = z.object({
  apartments: z.array(apartmentSchema)
});
export type ApartmentListResponse = z.infer<typeof apartmentListResponseSchema>;

export const userSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  isActive: z.boolean().default(true)
});
export type User = z.infer<typeof userSchema>;

export const managedUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema,
  phone: z.string().min(1).nullable(),
  isActive: z.boolean(),
  apartmentId: z.string().min(1).nullable(),
  apartmentLabel: z.string().min(1).nullable()
});
export type ManagedUser = z.infer<typeof managedUserSchema>;

export const userProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1).nullable(),
  role: roleSchema,
  isActive: z.boolean(),
  apartment: apartmentSchema.nullable()
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const managedUserListResponseSchema = z.object({
  users: z.array(managedUserSchema)
});
export type ManagedUserListResponse = z.infer<typeof managedUserListResponseSchema>;

export const userProfileResponseSchema = z.object({
  profile: userProfileSchema
});
export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;

export const managedUserActivationRequestSchema = z
  .object({
    isActive: z.boolean()
  })
  .strict();
export type ManagedUserActivationRequest = z.infer<typeof managedUserActivationRequestSchema>;

export const managedUserCreateRequestSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(12),
    role: roleSchema,
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    apartmentId: z.string().trim().min(1).optional().nullable().or(z.literal(""))
  })
  .strict();
export type ManagedUserCreateRequest = z.infer<typeof managedUserCreateRequestSchema>;

export const managedUserUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    apartmentId: z.string().trim().min(1).optional().nullable().or(z.literal("")),
    role: roleSchema.optional()
  })
  .strict();
export type ManagedUserUpdateRequest = z.infer<typeof managedUserUpdateRequestSchema>;

export const profileUpdateRequestSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    phone: z.string().trim().max(30).optional().or(z.literal(""))
  })
  .strict();
export type ProfileUpdateRequest = z.infer<typeof profileUpdateRequestSchema>;

export const managedUserMutationResponseSchema = z.object({
  user: managedUserSchema
});
export type ManagedUserMutationResponse = z.infer<typeof managedUserMutationResponseSchema>;
export const managedUserActivationResponseSchema = managedUserMutationResponseSchema;
export type ManagedUserActivationResponse = ManagedUserMutationResponse;

export const announcementSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  publishedAt: isoDateTimeSchema,
  authorId: z.string().min(1).nullable(),
  authorName: z.string().min(1).nullable()
});
export type Announcement = z.infer<typeof announcementSchema>;

export const announcementListResponseSchema = z.object({
  announcements: z.array(announcementSchema)
});
export type AnnouncementListResponse = z.infer<typeof announcementListResponseSchema>;

export const announcementMutationResponseSchema = z.object({
  announcement: announcementSchema
});
export type AnnouncementMutationResponse = z.infer<typeof announcementMutationResponseSchema>;

export const announcementCreateRequestSchema = z
  .object({
    title: z.string().trim().min(3, "Baslik en az 3 karakter olmalidir.").max(120),
    content: z.string().trim().min(10, "Icerik en az 10 karakter olmalidir.").max(5000)
  })
  .strict();
export type AnnouncementCreateRequest = z.infer<typeof announcementCreateRequestSchema>;

export const announcementUpdateRequestSchema = announcementCreateRequestSchema;
export type AnnouncementUpdateRequest = z.infer<typeof announcementUpdateRequestSchema>;

export const maintenanceRequestSchema = z.object({
  id: z.string().min(1),
  residentId: z.string().min(1),
  residentName: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  photoUrl: z.string().min(1).nullable(),
  status: maintenanceStatusSchema,
  rating: z.number().int().min(1).max(5).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  responseDueAt: isoDateTimeSchema.nullable(),
  respondedAt: isoDateTimeSchema.nullable(),
  escalatedAt: isoDateTimeSchema.nullable()
});
export type MaintenanceRequest = z.infer<typeof maintenanceRequestSchema>;

export const maintenanceListResponseSchema = z.object({
  requests: z.array(maintenanceRequestSchema)
});
export type MaintenanceListResponse = z.infer<typeof maintenanceListResponseSchema>;

export const maintenanceMutationResponseSchema = z.object({
  request: maintenanceRequestSchema
});
export type MaintenanceMutationResponse = z.infer<typeof maintenanceMutationResponseSchema>;

export const maintenanceCreateRequestSchema = z
  .object({
    category: z.string().trim().min(3, "Kategori en az 3 karakter olmalidir.").max(80),
    description: z.string().trim().min(10, "Aciklama en az 10 karakter olmalidir.").max(2500),
    photoUrl: z.string().trim().max(1_000).optional().or(z.literal(""))
  })
  .strict();
export type MaintenanceCreateRequest = z.infer<typeof maintenanceCreateRequestSchema>;

export const maintenanceStatusUpdateRequestSchema = z
  .object({
    status: maintenanceStatusSchema
  })
  .strict();
export type MaintenanceStatusUpdateRequest = z.infer<typeof maintenanceStatusUpdateRequestSchema>;

export const maintenanceRatingUpdateRequestSchema = z
  .object({
    rating: z
      .number({
        invalid_type_error: "Degerlendirme 1 ile 5 arasinda sayi olmalidir."
      })
      .int("Degerlendirme tam sayi olmalidir.")
      .min(1, "Degerlendirme en az 1 olmalidir.")
      .max(5, "Degerlendirme en fazla 5 olmalidir.")
  })
  .strict();
export type MaintenanceRatingUpdateRequest = z.infer<typeof maintenanceRatingUpdateRequestSchema>;

export const notificationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  category: notificationCategorySchema,
  isRead: z.boolean(),
  createdAt: isoDateTimeSchema,
  link: z.string().min(1).nullable()
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative()
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export const notificationMutationResponseSchema = z.object({
  notification: notificationSchema
});
export type NotificationMutationResponse = z.infer<typeof notificationMutationResponseSchema>;

export const dueSchema = z.object({
  id: z.string().min(1),
  apartmentId: z.string().min(1),
  apartmentLabel: z.string().min(1),
  amount: moneySchema,
  lateFeeAmount: moneySchema,
  totalAmount: moneySchema,
  paidAmount: moneySchema,
  outstandingAmount: moneySchema,
  status: dueStatusSchema,
  dueDate: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  overdueMonthCount: z.number().int().nonnegative(),
  receiptAvailable: z.boolean()
});
export type Due = z.infer<typeof dueSchema>;

export const paymentSchema = z.object({
  id: z.string().min(1),
  dueId: z.string().min(1),
  apartmentLabel: z.string().min(1),
  amount: moneySchema,
  method: paymentMethodSchema,
  paidAt: isoDateTimeSchema,
  createdById: z.string().min(1).nullable(),
  receiptUrl: z.string().min(1)
});
export type Payment = z.infer<typeof paymentSchema>;

export const dueListResponseSchema = z.object({
  dues: z.array(dueSchema)
});
export type DueListResponse = z.infer<typeof dueListResponseSchema>;

export const paymentListResponseSchema = z.object({
  payments: z.array(paymentSchema)
});
export type PaymentListResponse = z.infer<typeof paymentListResponseSchema>;

export const monthlyDueGenerationRequestSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/)
  })
  .strict();
export type MonthlyDueGenerationRequest = z.infer<typeof monthlyDueGenerationRequestSchema>;

export const paymentCreateRequestSchema = z
  .object({
    dueId: z.string().trim().min(1),
    method: paymentMethodSchema
  })
  .strict();
export type PaymentCreateRequest = z.infer<typeof paymentCreateRequestSchema>;

export const paymentMutationResponseSchema = z.object({
  payment: paymentSchema
});
export type PaymentMutationResponse = z.infer<typeof paymentMutationResponseSchema>;

export const commonAreaSchema = z.object({
  id: z.string().min(1),
  type: commonAreaTypeSchema,
  name: z.string().min(1),
  description: z.string().min(1).nullable(),
  maxDurationHours: z.number().int().positive(),
  dailyLimitHours: z.number().int().positive(),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/)
});
export type CommonArea = z.infer<typeof commonAreaSchema>;

export const commonAreaListResponseSchema = z.object({
  areas: z.array(commonAreaSchema)
});
export type CommonAreaListResponse = z.infer<typeof commonAreaListResponseSchema>;

export const reservationSchema = z.object({
  id: z.string().min(1),
  commonAreaId: z.string().min(1),
  commonAreaName: z.string().min(1),
  residentId: z.string().min(1),
  residentName: z.string().min(1),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  status: reservationStatusSchema,
  createdAt: isoDateTimeSchema,
  cancelledAt: isoDateTimeSchema.nullable()
});
export type Reservation = z.infer<typeof reservationSchema>;

export const reservationListResponseSchema = z.object({
  reservations: z.array(reservationSchema)
});
export type ReservationListResponse = z.infer<typeof reservationListResponseSchema>;

export const reservationMutationResponseSchema = z.object({
  reservation: reservationSchema
});
export type ReservationMutationResponse = z.infer<typeof reservationMutationResponseSchema>;

export const reservationCreateRequestSchema = z
  .object({
    commonAreaId: z.string().trim().min(1),
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema
  })
  .strict();
export type ReservationCreateRequest = z.infer<typeof reservationCreateRequestSchema>;

export const parkingSpotSchema = z.object({
  id: z.string().min(1),
  spotNumber: z.string().min(1),
  type: parkingSpotTypeSchema,
  apartmentId: z.string().min(1).nullable(),
  apartmentLabel: z.string().min(1).nullable(),
  isOccupied: z.boolean(),
  occupiedByPlate: z.string().min(1).nullable()
});
export type ParkingSpot = z.infer<typeof parkingSpotSchema>;

export const parkingSpotListResponseSchema = z.object({
  spots: z.array(parkingSpotSchema)
});
export type ParkingSpotListResponse = z.infer<typeof parkingSpotListResponseSchema>;

export const parkingSpotAssignmentRequestSchema = z
  .object({
    apartmentId: z.string().trim().min(1).nullable()
  })
  .strict();
export type ParkingSpotAssignmentRequest = z.infer<typeof parkingSpotAssignmentRequestSchema>;

export const parkingSpotMutationResponseSchema = z.object({
  spot: parkingSpotSchema
});
export type ParkingSpotMutationResponse = z.infer<typeof parkingSpotMutationResponseSchema>;

export const visitorVehicleSchema = z.object({
  id: z.string().min(1),
  plate: z.string().min(1),
  apartmentId: z.string().min(1),
  apartmentLabel: z.string().min(1),
  parkingSpotId: z.string().min(1),
  parkingSpotNumber: z.string().min(1),
  registeredById: z.string().min(1).nullable(),
  registeredByName: z.string().min(1).nullable(),
  enteredAt: isoDateTimeSchema,
  exitedAt: isoDateTimeSchema.nullable(),
  isOverdue: z.boolean()
});
export type VisitorVehicle = z.infer<typeof visitorVehicleSchema>;

export const visitorVehicleListResponseSchema = z.object({
  vehicles: z.array(visitorVehicleSchema)
});
export type VisitorVehicleListResponse = z.infer<typeof visitorVehicleListResponseSchema>;

export const visitorVehicleMutationResponseSchema = z.object({
  vehicle: visitorVehicleSchema
});
export type VisitorVehicleMutationResponse = z.infer<typeof visitorVehicleMutationResponseSchema>;

export const visitorVehicleCreateRequestSchema = z
  .object({
    plate: z.string().trim().min(5).max(16),
    apartmentId: z.string().trim().min(1),
    parkingSpotId: z.string().trim().min(1)
  })
  .strict();
export type VisitorVehicleCreateRequest = z.infer<typeof visitorVehicleCreateRequestSchema>;

export const dashboardMaintenanceBucketSchema = z.object({
  category: z.string().min(1),
  count: z.number().int().nonnegative()
});
export type DashboardMaintenanceBucket = z.infer<typeof dashboardMaintenanceBucketSchema>;

export const dashboardTrendPointSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  collectedAmount: moneySchema
});
export type DashboardTrendPoint = z.infer<typeof dashboardTrendPointSchema>;

export const dashboardDebtorSchema = z.object({
  apartmentId: z.string().min(1),
  apartmentLabel: z.string().min(1),
  outstandingAmount: moneySchema,
  overdueCount: z.number().int().nonnegative()
});
export type DashboardDebtor = z.infer<typeof dashboardDebtorSchema>;

export const dashboardSummarySchema = z.object({
  totalCollection: moneySchema,
  openMaintenanceCount: z.number().int().nonnegative(),
  occupancyRate: z.number().min(0).max(100),
  maintenanceByCategory: z.array(dashboardMaintenanceBucketSchema),
  duesTrend: z.array(dashboardTrendPointSchema),
  debtorApartments: z.array(dashboardDebtorSchema),
  recentAnnouncements: z.array(announcementSchema)
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

export const dashboardResponseSchema = z.object({
  dashboard: dashboardSummarySchema
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

export const authJwtSessionSchema = z.object({
  mode: z.literal("JWT"),
  accessToken: z.string().min(1),
  expiresAt: isoDateTimeSchema,
  user: userSchema
});
export const authLoginResponseSchema = authJwtSessionSchema;
export const authSessionResponseSchema = authJwtSessionSchema;
export const authSessionSchema = authJwtSessionSchema;
export type AuthSession = z.infer<typeof authSessionSchema>;

export const authMessageResponseSchema = z.object({
  message: z.string(),
  success: z.boolean().optional()
});
export type AuthMessageResponse = z.infer<typeof authMessageResponseSchema>;

export const loginRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Gecerli bir e-posta adresi giriniz."),
    password: z.string().min(12, "Sifre en az 12 karakter olmalidir.")
  })
  .strict();
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const forgotPasswordRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Gecerli bir e-posta adresi giriniz.")
  })
  .strict();
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z
  .object({
    token: z.string().trim().min(16, "Gecersiz sifirlama baglantisi."),
    newPassword: z.string().min(12, "Sifre en az 12 karakter olmalidir.")
  })
  .strict();
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
