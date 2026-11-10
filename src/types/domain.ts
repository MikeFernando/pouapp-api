export type CustomerStatus = 'active' | 'inactive';
export type CustomerType = 'individual' | 'company';
export type PixKeyType = 'cpfCnpj' | 'phone' | 'email' | 'random';
export type CatalogUnit = 'kilogram' | 'piece' | 'bunch' | 'box' | 'dozen';
export type NoteStatus = 'draft' | 'delivered';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  type: CustomerType;
  name: string;
  phone?: string;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  unit: CatalogUnit;
  salePriceCents: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessProfile {
  userId: string;
  pixKeyType?: PixKeyType;
  pixKey?: string;
  receiverName?: string;
  updatedAt: string;
}

/** Billing status for the tenant account (Stripe / manual). */
export type LicenseStatus = 'active' | 'past_due' | 'canceled' | 'unpaid';

export interface License {
  userId: string;
  status: LicenseStatus;
  /** Inclusive end of paid period (ISO). Null means never paid / no access. */
  paidUntil: string | null;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  updatedAt: string;
}

/** Why the app should block when active=false. */
export type LicenseBlockReason = 'payment_required' | 'wrong_email';

export interface LicenseView {
  active: boolean;
  status: LicenseStatus;
  paidUntil: string | null;
  message: string | null;
  /** Null when the license is active. */
  reason: LicenseBlockReason | null;
  /** Set when reason=wrong_email — the email that currently holds payment. */
  paidEmail: string | null;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  iss?: string;
  aud?: string | string[];
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface RefreshSession {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: number;
  revokedAt?: number;
  createdAt: number;
  replacedById?: string;
}

export interface CustomerNote {
  id: string;
  customerId: string;
  status: NoteStatus;
  dueOn: string;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface PostedSale {
  id: string;
  customerId: string;
  totalCents: number;
  allocatedCents: number;
  occurredOn: string;
  dueOn: string;
  sale: true;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptAllocation {
  saleId: string;
  amountCents: number;
}

export interface Receipt {
  id: string;
  customerId: string;
  paidOn: string;
  amountCents: number;
  allocations: ReceiptAllocation[];
  createdAt: string;
}

export interface HomeDueItem {
  customerId: string;
  customerName: string;
  openCents: number;
  dueOn: string;
  openNotes?: number;
  settled?: boolean;
}

export interface HomeBoard {
  date: string;
  receivedTodayCents: number;
  receiptsDueToday: HomeDueItem[];
  duesTomorrow: HomeDueItem[];
  upcomingDues: HomeDueItem[];
}
