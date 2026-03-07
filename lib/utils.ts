import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Format a byte count as a human-readable storage size (GiB / MiB / KiB / B). */
export function fmtBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(2) + " GiB";
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(1)     + " MiB";
  if (bytes >= 1_024)         return (bytes / 1_024).toFixed(1)         + " KiB";
  return bytes + " B";
}

/** Format a bytes-per-second rate (MiB/s / KiB/s / B/s). */
export function fmtBytesRate(bytes: number): string {
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + " MiB/s";
  if (bytes >= 1_024)     return (bytes / 1_024).toFixed(1)     + " KiB/s";
  return bytes.toFixed(0) + " B/s";
}

/** Format a message rate as "X/s". Pass `decimals` to control precision (default 1). */
export function fmtRate(rate: number | undefined, decimals = 1): string {
  return (rate ?? 0).toFixed(decimals) + "/s";
}

/** Format a count with M / k suffixes. */
export function fmtCount(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1)     + "k";
  return String(n);
}

/** Format a timestamp as a locale-aware date + time string. */
export function fmtDateFull(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}
