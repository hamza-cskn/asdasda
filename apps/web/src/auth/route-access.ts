import type { Role } from "@asys/contracts";

export const roleRouteMap: Record<Role, string> = {
  ADMIN: "/panel/admin",
  RESIDENT: "/panel/resident",
  SECURITY: "/panel/security"
};

export function isRoleRouteAllowed(role: Role, pathname: string): boolean {
  if (pathname === "/panel" || pathname === "/panel/yetkisiz") {
    return true;
  }

  return pathname.startsWith(roleRouteMap[role]!);
}
