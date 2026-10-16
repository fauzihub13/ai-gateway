import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatIdr(v: number): string {
  return `Rp${v.toLocaleString('id-ID')}`;
}

export function formatNumber(v: number): string {
  return v.toLocaleString('id-ID');
}