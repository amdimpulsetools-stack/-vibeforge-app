export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "DoctoVibe";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const ITEMS_PER_PAGE = 10;

export const USER_ROLES = {
  ADMIN: "admin",
  USER: "user",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
