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

/** Property owner role only (not super admin). */
export function isPropertyOwner(user: Pick<User, "role"> | null | undefined): boolean {
  return normalizeRole(user?.role) === "admin";
}

/** Resolve house IDs this user is allowed to access. Super admin = empty means "all" (handled separately). */
export function getAssignedHouseIds(
  user: Pick<User, "role" | "assignedHouse" | "assignedHouses"> | null | undefined
): string[] {
  if (!user) return [];
  if (isSuperAdmin(user)) return []; // caller treats superadmin as all
  const fromList = Array.isArray(user.assignedHouses)
    ? user.assignedHouses.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (fromList.length > 0) return [...new Set(fromList)];
  if (user.assignedHouse) return [user.assignedHouse];
  return [];
}

/** Only super admin sees every property without assignment. */
export function canViewAllHouses(user: Pick<User, "role"> | null | undefined): boolean {
  return isSuperAdmin(user);
}

export function canManageProperties(user: Pick<User, "role"> | null | undefined): boolean {
  return isSuperAdmin(user);
}

/** Admin + superadmin can edit property details and rooms on houses they can access. */
export function canEditProperty(user: Pick<User, "role"> | null | undefined): boolean {
  return isAdmin(user);
}

/** Super admin manages all team members (owners + staff). */
export function canManageStaff(user: Pick<User, "role"> | null | undefined): boolean {
  return isSuperAdmin(user);
}

/** Super admin or property owner can open Team page. */
export function canManageTeam(user: Pick<User, "role"> | null | undefined): boolean {
  return isSuperAdmin(user) || isPropertyOwner(user);
}

/** Property owner may create/assign staff on their own properties. */
export function canAssignStaff(user: Pick<User, "role"> | null | undefined): boolean {
  return isSuperAdmin(user) || isPropertyOwner(user);
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
  user: Pick<User, "role" | "assignedHouse" | "assignedHouses"> | null | undefined,
  houseId: string | null | undefined
): boolean {
  if (!user || !houseId) return false;
  if (canViewAllHouses(user)) return true;
  return getAssignedHouseIds(user).includes(houseId);
}

export function filterHousesByAccess<T extends { houseId: string }>(
  user: Pick<User, "role" | "assignedHouse" | "assignedHouses"> | null | undefined,
  houses: T[]
): T[] {
  if (!user) return [];
  if (canViewAllHouses(user)) return houses;
  const ids = new Set(getAssignedHouseIds(user));
  return houses.filter((h) => ids.has(h.houseId));
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

/** Guest stay purchases — property owners and maintenance staff. */
export function canAddGuestPurchases(user: Pick<User, "role"> | null | undefined): boolean {
  const role = normalizeRole(user?.role);
  return role === "admin" || role === "staff";
}

/** Full guest directory. Staff must not browse this. */
export function canViewAllGuests(user: Pick<User, "role"> | null | undefined): boolean {
  return isAdmin(user);
}

/** Catalogue editing for allotted property. */
export function canManageCatalogue(user: Pick<User, "role"> | null | undefined): boolean {
  const role = normalizeRole(user?.role);
  return role === "admin" || role === "staff";
}
