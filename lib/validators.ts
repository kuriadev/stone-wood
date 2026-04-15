/** Check if a Philippine mobile number is valid (11 digits, starts with 09) */
export function isValidPHNumber(contact: string): boolean {
  return /^09\d{9}$/.test(contact);
}

/** Check if an email address is valid */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Check if a booking date string is not in the past */
export function isDateInFuture(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d) >= today;
}

/** Validate online booking form fields */
export function validateBookingForm(form: {
  name: string;
  email: string;
  contact: string;
}): string | null {
  if (!form.name.trim()) return "Full name is required.";
  if (!isValidEmail(form.email)) return "Please enter a valid email address.";
  if (!isValidPHNumber(form.contact)) return "Please enter a valid 11-digit PH mobile number.";
  return null;
}

/** Validate on-site reservation form */
export function validateOnsiteForm(form: {
  name: string;
  contact: string;
}): string | null {
  if (!form.name.trim()) return "Full name is required.";
  if (!isValidPHNumber(form.contact)) return "Please enter a valid 11-digit PH mobile number.";
  return null;
}
