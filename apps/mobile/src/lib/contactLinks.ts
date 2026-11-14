export const dialablePhoneUri = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  const digitCount = cleaned.replace(/\D/g, '').length;
  return digitCount >= 7 ? `tel:${cleaned}` : null;
};

export const mailtoUri = (email: string | null | undefined): string | null => {
  if (!email) return null;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? `mailto:${trimmed}` : null;
};
