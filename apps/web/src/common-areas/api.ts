import { commonAreaListResponseSchema, type CommonArea } from "@asys/contracts";

import { buildAuthHeaders } from "../auth/api";
import { webEnv } from "../config";
import { parseApiResponse } from "../lib/http";

export async function listCommonAreas(accessToken: string): Promise<CommonArea[]> {
  const response = await fetch(`${webEnv.VITE_API_BASE_URL}/api/common-areas`, {
    method: "GET",
    headers: buildAuthHeaders(accessToken),
    credentials: "include"
  });

  const parsed = await parseApiResponse(response, commonAreaListResponseSchema);
  return parsed.areas;
}
