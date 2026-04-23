import {
  paymentCreateRequestSchema,
  paymentListResponseSchema,
  paymentMethodSchema,
  paymentMutationResponseSchema,
  type Payment,
  type PaymentMethod
} from "@asys/contracts";

import { buildAuthHeaders } from "../auth/api";
import { webEnv } from "../config";
import { parseApiResponse, parseRequestPayload } from "../lib/http";

export async function listPayments(
  accessToken: string,
  filters?: {
    method?: PaymentMethod;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<Payment[]> {
  const params = new URLSearchParams();
  if (filters?.method) {
    params.set(
      "method",
      parseRequestPayload(paymentMethodSchema, filters.method, "Odeme filtre method degeri gecersiz.")
    );
  }
  if (filters?.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }
  if (filters?.dateTo) {
    params.set("dateTo", filters.dateTo);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";

  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/payments${query}`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, paymentListResponseSchema);
  return parsed.payments;
}

export async function createPayment(
  accessToken: string,
  payload: {
    dueId: string;
    method: PaymentMethod;
  }
): Promise<Payment> {
  const body = parseRequestPayload(
    paymentCreateRequestSchema,
    payload,
    "Odeme formu gonderilemedi. Lutfen secimlerinizi kontrol edin."
  );
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(accessToken)
    },
    credentials: "include",
    body: JSON.stringify(body)
  });

  const parsed = await parseApiResponse(response, paymentMutationResponseSchema);
  return parsed.payment;
}

export function paymentReceiptUrl(paymentId: string): string {
  return `${webEnv.VITE_API_BASE_URL}/api/payments/${encodeURIComponent(paymentId)}/receipt.pdf`;
}
