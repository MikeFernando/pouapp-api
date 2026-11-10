import { randomUUID } from 'node:crypto';
import type {
  BusinessProfile,
  Customer,
  CustomerNote,
  PostedSale,
  Product,
  Receipt,
  RefreshSession,
  User,
} from '../types/domain.js';

const now = () => new Date().toISOString();
const isoToday = (date = new Date()) => date.toISOString().slice(0, 10);

export const BCRYPT_COST = 12;

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

class MemoryStore {
  users = new Map<string, User>();
  customers = new Map<string, Customer>();
  products = new Map<string, Product>();
  profiles = new Map<string, BusinessProfile>();
  refreshSessions = new Map<string, RefreshSession>();
  notes = new Map<string, CustomerNote>();
  sales = new Map<string, PostedSale>();
  receipts = new Map<string, Receipt>();

  async seed() {
    // Catalog/demo data only — accounts are created via /auth/register.
    if (this.customers.size > 0) return;

    const seedCustomers: Array<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>> =
      [
        { type: 'individual', name: 'Beatriz Nunes', phone: '15992639023', status: 'active' },
        { type: 'individual', name: 'João Oliveira', phone: '11988887777', status: 'active' },
        { type: 'individual', name: 'Marina Costa', phone: '11977776666', status: 'active' },
      ];
    const createdCustomers: Customer[] = [];
    for (const item of seedCustomers) {
      const customer: Customer = {
        ...item,
        id: randomUUID(),
        createdAt: now(),
        updatedAt: now(),
      };
      this.customers.set(customer.id, customer);
      createdCustomers.push(customer);
    }

    const seedProducts: Array<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>> = [
      { name: 'Banana nanica', unit: 'dozen', salePriceCents: 590, active: true },
      { name: 'Tomate italiano', unit: 'box', salePriceCents: 5900, active: true },
      { name: 'Alface crespa', unit: 'piece', salePriceCents: 350, active: true },
      { name: 'Cenoura', unit: 'kilogram', salePriceCents: 450, active: true },
      { name: 'Batata doce', unit: 'kilogram', salePriceCents: 490, active: true },
      { name: 'Abacaxi', unit: 'piece', salePriceCents: 990, active: true },
      { name: 'Ovos dúzia', unit: 'dozen', salePriceCents: 1200, active: true },
      { name: 'Ovos bandeja 30', unit: 'piece', salePriceCents: 1890, active: true },
    ];
    for (const item of seedProducts) {
      const product: Product = {
        ...item,
        id: randomUUID(),
        createdAt: now(),
        updatedAt: now(),
      };
      this.products.set(product.id, product);
    }

    const today = isoToday();
    const beatriz = createdCustomers[0]!;
    const joao = createdCustomers[1]!;
    const marina = createdCustomers[2]!;
    const timestamp = now();

    // Open balance due in ~14 days (home "próximos vencimentos").
    const upcomingSale: PostedSale = {
      id: randomUUID(),
      customerId: beatriz.id,
      totalCents: 2370,
      allocatedCents: 0,
      occurredOn: today,
      dueOn: addDaysIso(today, 14),
      sale: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.sales.set(upcomingSale.id, upcomingSale);

    // Draft note due tomorrow.
    const tomorrowNote: CustomerNote = {
      id: randomUUID(),
      customerId: joao.id,
      status: 'draft',
      dueOn: addDaysIso(today, 1),
      totalCents: 4500,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.notes.set(tomorrowNote.id, tomorrowNote);

    // Sale due today (open) + small receipt today for another customer.
    const todaySale: PostedSale = {
      id: randomUUID(),
      customerId: marina.id,
      totalCents: 1890,
      allocatedCents: 0,
      occurredOn: today,
      dueOn: today,
      sale: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.sales.set(todaySale.id, todaySale);

    const receipt: Receipt = {
      id: randomUUID(),
      customerId: joao.id,
      paidOn: today,
      amountCents: 1200,
      allocations: [],
      createdAt: timestamp,
    };
    this.receipts.set(receipt.id, receipt);
  }

  listUsers() {
    return [...this.users.values()];
  }

  findUserByEmail(email: string) {
    return this.listUsers().find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
  }

  findRefreshByHash(tokenHash: string) {
    for (const session of this.refreshSessions.values()) {
      if (session.tokenHash === tokenHash) return session;
    }
    return undefined;
  }

  revokeRefreshFamily(familyId: string) {
    const revokedAt = Date.now();
    for (const session of this.refreshSessions.values()) {
      if (session.familyId === familyId && !session.revokedAt) {
        session.revokedAt = revokedAt;
      }
    }
  }

  revokeRefreshByHash(tokenHash: string) {
    const session = this.findRefreshByHash(tokenHash);
    if (session && !session.revokedAt) {
      session.revokedAt = Date.now();
    }
    return session;
  }

  revokeAllRefreshForUser(userId: string) {
    const revokedAt = Date.now();
    for (const session of this.refreshSessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = revokedAt;
      }
    }
  }
}

export const store = new MemoryStore();
