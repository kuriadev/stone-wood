// ── Staff profile photos
//
// Each person may add a photo (My profile), and the super admin may set
// anyone's (Staff Accounts). Stored in site_content, one row per person,
// served from /api/staff/photo so lists carry a short link, not the image.
// Without one, the person's initials on their role's colour.

export const STAFF_PHOTO_PREFIX = "staff_photo:";
export const staffPhotoKey = (id: string) => `${STAFF_PHOTO_PREFIX}${id}`;

export function staffIdFromKey(key: string): string | null {
  if (!key.startsWith(STAFF_PHOTO_PREFIX)) return null;
  const id = key.slice(STAFF_PHOTO_PREFIX.length);
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Where a saved photo loads from; `v` changes with every save. */
export const staffPhotoUrl = (id: string, updatedAt: string) =>
  `/api/staff/photo?id=${encodeURIComponent(id)}&v=${Date.parse(updatedAt) || 0}`;

/** "Ana Marie Santos" → "AS"; "kurt" → "K". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}
