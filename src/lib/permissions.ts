import type { User, Role } from "@/data/types";

/** Normalize role strings from Firestore / legacy docs. */
export function normalizeRole(role: unknown): Role {
  const value = String(role ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

  if (value === "superadmin" || value === "superadministrator") return "superadmin";
  if (value === "admin" || value === "houseadmin") return "admin";
  if (value === "staff") return "staff";
  return "staff";
}

export function isSuperAdmin(user: Pick<User, "role"> | null | undefined): boolean {
  return normalizeRole(user?.role) === "superadmin";
}

export function isAdmin(user: Pick<User, "role"> | null | undefined): boolean {
  const role = normalizeRole(user?.role);
  return role === "admin" || role === "superadmin";
}

export function isStaff(user: Pick<User, "role"> | null | undefined): boolean {
  return normalizeRole(user?.role) === "staff";
}

/** Superadmin + admin see every property; staff only assigned house. */
export function canViewAllHouses(user: Pick<User, "role"> | null | undefined): boolean {
  return !isStaff(user);
}

export function canManageProperties(user: Pick<User, "role"> | null | undefined): boolean {
  return isSuperAdmin(user);
}

/** Admin + superadmin can edit property details and rooms. */
export function canEditProperty(user: Pick<User, "role"> | null | undefined): boolean {
  return isAdmin(user);
}

export function canManageStaff(user: Pick<User, "role"> | null | undefined): boolean {
  return isSuperAdmin(user);
}

export function canEditRooms(user: Pick<User, "role"> | null | undefined): boolean {
  return !isStaff(user);
}

/** Admin + superadmin can edit room rates and bed pricing. */
export function canEditRoomRates(user?: Pick<User, "role"> | null): boolean {
  return isAdmin(user);
}

export function canAccessNav(
  user: Pick<User, "role"> | null | undefined,
  roles: Role[]
): boolean {
  if (isSuperAdmin(user)) return true;
  return roles.includes(normalizeRole(user?.role));
}

export function canAccessHouse(
  user: Pick<User, "role" | "assignedHouse"> | null | undefined,
  houseId: string | null | undefined
): boolean {
  if (!user || !houseId) return false;
  if (canViewAllHouses(user)) return true;
  return user.assignedHouse === houseId;
}

export function filterHousesByAccess<T extends { houseId: string }>(
  user: Pick<User, "role" | "assignedHouse"> | null | undefined,
  houses: T[]
): T[] {
  if (!user || canViewAllHouses(user)) return houses;
  return houses.filter((h) => h.houseId === user.assignedHouse);
}

/** Human-facing role names for the portal. */
export function roleDisplayLabel(role: unknown): string {
  const r = normalizeRole(role);
  if (r === "superadmin") return "Super Admin";
  if (r === "admin") return "Property Owner";
  return "Maintenance";
}

export function canManageCompanies(user: Pick<User, "role"> | null | undefined): boolean {
  return isSuperAdmin(user);
}

/** Guest stay purchases — property owners (not catalogue editing). */
export function canAddGuestPurchases(user: Pick<User, "role"> | null | undefined): boolean {
  return normalizeRole(user?.role) === "admin";
}
