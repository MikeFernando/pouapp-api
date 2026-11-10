export type CustomerStatus = 'active' | 'inactive';
export type CustomerType = 'individual' | 'company';
export type PixKeyType = 'cpfCnpj' | 'phone' | 'email' | 'random';
export type CatalogUnit = 'kilogram' | 'piece' | 'bunch' | 'box' | 'dozen';

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
