import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import type {
  BusinessProfile,
  Customer,
  CustomerNote,
  License,
  PostedSale,
  Product,
  Receipt,
  RefreshSession,
  User,
} from '../types/domain.js';
import { readJsonFile, writeJsonAtomic } from './persistence.js';

const now = () => new Date().toISOString();
const isoToday = (date = new Date()) => date.toISOString().slice(0, 10);

export const BCRYPT_COST = 12;

const STORE_VERSION = 1;

type StoreSnapshot = {
  version: number;
  users: User[];
  customers: Customer[];
  products: Product[];
  profiles: BusinessProfile[];
  licenses: License[];
  refreshSessions: RefreshSession[];
  notes: CustomerNote[];
  sales: PostedSale[];
  receipts: Receipt[];
};

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

class TrackedMap<K, V> extends Map<K, V> {
  constructor(private readonly onChange: () => void) {
    super();
  }

  override set(key: K, value: V): this {
    super.set(key, value);
    this.onChange();
    return this;
  }

  override delete(key: K): boolean {
    const removed = super.delete(key);
    if (removed) this.onChange();
    return removed;
  }

  override clear(): void {
    if (this.size === 0) return;
    super.clear();
    this.onChange();
  }
}

class MemoryStore {
  private hydrating = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveChain: Promise<void> = Promise.resolve();

  users: TrackedMap<string, User>;
  customers: TrackedMap<string, Customer>;
  products: TrackedMap<string, Product>;
  profiles: TrackedMap<string, BusinessProfile>;
  licenses: TrackedMap<string, License>;
  refreshSessions: TrackedMap<string, RefreshSession>;
  notes: TrackedMap<string, CustomerNote>;
  sales: TrackedMap<string, PostedSale>;
  receipts: TrackedMap<string, Receipt>;

  constructor() {
    const onChange = () => this.scheduleSave();
    this.users = new TrackedMap(onChange);
    this.customers = new TrackedMap(onChange);
    this.products = new TrackedMap(onChange);
    this.profiles = new TrackedMap(onChange);
    this.licenses = new TrackedMap(onChange);
    this.refreshSessions = new TrackedMap(onChange);
    this.notes = new TrackedMap(onChange);
    this.sales = new TrackedMap(onChange);
    this.receipts = new TrackedMap(onChange);
  }

  /** Call after in-place mutations that do not go through Map.set. */
  touch() {
    this.scheduleSave();
  }

  async load() {
    const snapshot = await readJsonFile<StoreSnapshot>(env.dataFile);
    if (!snapshot) {
      console.log(`store: no file at ${env.dataFile} (starting empty)`);
      return;
    }
    if (snapshot.version !== STORE_VERSION) {
      throw new Error(
        `Unsupported store version ${snapshot.version} (expected ${STORE_VERSION})`,
      );
    }

    this.hydrating = true;
    try {
      this.replaceMap(this.users, snapshot.users, (item) => item.id);
      this.replaceMap(this.customers, snapshot.customers, (item) => item.id);
      this.replaceMap(this.products, snapshot.products, (item) => item.id);
      this.replaceMap(this.profiles, snapshot.profiles, (item) => item.userId);
      this.replaceMap(this.licenses, snapshot.licenses, (item) => item.userId);
      this.replaceMap(
        this.refreshSessions,
        pruneRefreshSessions(snapshot.refreshSessions ?? []),
        (item) => item.id,
      );
      this.replaceMap(this.notes, snapshot.notes, (item) => item.id);
      this.replaceMap(this.sales, snapshot.sales, (item) => item.id);
      this.replaceMap(this.receipts, snapshot.receipts, (item) => item.id);
    } finally {
      this.hydrating = false;
    }

    console.log(
      `store: loaded ${this.users.size} user(s), ${this.licenses.size} license(s) from ${env.dataFile}`,
    );
  }

  async seed() {
    // Catalog/demo data only — accounts are created via /auth/register.
    if (this.customers.size > 0) return;

    this.hydrating = true;
    try {
      const seedCustomers: Array<
        Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>
      > = [
        {
          type: 'individual',
          name: 'Beatriz Nunes',
          phone: '15992639023',
          status: 'active',
        },
        {
          type: 'individual',
          name: 'João Oliveira',
          phone: '11988887777',
          status: 'active',
        },
        {
          type: 'individual',
          name: 'Marina Costa',
          phone: '11977776666',
          status: 'active',
        },
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

      const seedProducts: Array<
        Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
      > = [
        { name: 'Banana nanica', unit: 'dozen', salePriceCents: 590, active: true },
        {
          name: 'Tomate italiano',
          unit: 'box',
          salePriceCents: 5900,
          active: true,
        },
        { name: 'Alface crespa', unit: 'piece', salePriceCents: 350, active: true },
        { name: 'Cenoura', unit: 'kilogram', salePriceCents: 450, active: true },
        {
          name: 'Batata doce',
          unit: 'kilogram',
          salePriceCents: 490,
          active: true,
        },
        { name: 'Abacaxi', unit: 'piece', salePriceCents: 990, active: true },
        { name: 'Ovos dúzia', unit: 'dozen', salePriceCents: 1200, active: true },
        {
          name: 'Ovos bandeja 30',
          unit: 'piece',
          salePriceCents: 1890,
          active: true,
        },
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
    } finally {
      this.hydrating = false;
    }

    await this.flush();
  }

  listUsers() {
    return [...this.users.values()];
  }

  findUserByEmail(email: string) {
    return this.listUsers().find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
  }

  findLicenseByStripeCustomerId(customerId: string) {
    for (const license of this.licenses.values()) {
      if (license.stripeCustomerId === customerId) return license;
    }
    return undefined;
  }

  findLicenseByStripeSubscriptionId(subscriptionId: string) {
    for (const license of this.licenses.values()) {
      if (license.stripeSubscriptionId === subscriptionId) return license;
    }
    return undefined;
  }

  findUserForStripe(input: {
    email?: string | null;
    customerId?: string | null;
    subscriptionId?: string | null;
  }) {
    if (input.email) {
      const byEmail = this.findUserByEmail(input.email);
      if (byEmail) return byEmail;
    }
    if (input.subscriptionId) {
      const license = this.findLicenseByStripeSubscriptionId(
        input.subscriptionId,
      );
      if (license) return this.users.get(license.userId);
    }
    if (input.customerId) {
      const license = this.findLicenseByStripeCustomerId(input.customerId);
      if (license) return this.users.get(license.userId);
    }
    return undefined;
  }

  ensureLicense(
    userId: string,
    options?: { trialDays?: number },
  ): License {
    const existing = this.licenses.get(userId);
    if (existing) return existing;

    const trialDays = options?.trialDays ?? 0;
    const timestamp = now();
    let paidUntil: string | null = null;
    let status: License['status'] = 'unpaid';
    if (trialDays > 0) {
      paidUntil = new Date(
        Date.now() + trialDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      status = 'active';
    }

    const license: License = {
      userId,
      status,
      paidUntil,
      updatedAt: timestamp,
    };
    this.licenses.set(userId, license);
    return license;
  }

  setLicense(
    userId: string,
    patch: Partial<
      Pick<
        License,
        'status' | 'paidUntil' | 'stripeCustomerId' | 'stripeSubscriptionId'
      >
    >,
  ): License {
    const current = this.ensureLicense(userId);
    const next: License = {
      ...current,
      ...patch,
      userId,
      updatedAt: now(),
    };
    this.licenses.set(userId, next);
    return next;
  }

  findRefreshByHash(tokenHash: string) {
    for (const session of this.refreshSessions.values()) {
      if (session.tokenHash === tokenHash) return session;
    }
    return undefined;
  }

  revokeRefreshFamily(familyId: string) {
    const revokedAt = Date.now();
    let changed = false;
    for (const session of this.refreshSessions.values()) {
      if (session.familyId === familyId && !session.revokedAt) {
        session.revokedAt = revokedAt;
        changed = true;
      }
    }
    if (changed) this.touch();
  }

  revokeRefreshByHash(tokenHash: string) {
    const session = this.findRefreshByHash(tokenHash);
    if (session && !session.revokedAt) {
      session.revokedAt = Date.now();
      this.touch();
    }
    return session;
  }

  revokeAllRefreshForUser(userId: string) {
    const revokedAt = Date.now();
    let changed = false;
    for (const session of this.refreshSessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = revokedAt;
        changed = true;
      }
    }
    if (changed) this.touch();
  }

  scheduleSave() {
    if (this.hydrating) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, 150);
  }

  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    this.saveChain = this.saveChain.then(async () => {
      const snapshot: StoreSnapshot = {
        version: STORE_VERSION,
        users: [...this.users.values()],
        customers: [...this.customers.values()],
        products: [...this.products.values()],
        profiles: [...this.profiles.values()],
        licenses: [...this.licenses.values()],
        refreshSessions: pruneRefreshSessions([
          ...this.refreshSessions.values(),
        ]),
        notes: [...this.notes.values()],
        sales: [...this.sales.values()],
        receipts: [...this.receipts.values()],
      };
      await writeJsonAtomic(env.dataFile, snapshot);
    });

    await this.saveChain;
  }

  private replaceMap<K, V>(
    map: TrackedMap<K, V>,
    items: V[] | undefined,
    keyOf: (item: V) => K,
  ) {
    map.clear();
    for (const item of items ?? []) {
      map.set(keyOf(item), item);
    }
  }
}

function pruneRefreshSessions(sessions: RefreshSession[]): RefreshSession[] {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return sessions.filter((session) => {
    if (session.expiresAt > Date.now()) return true;
    if (session.revokedAt && session.revokedAt > cutoff) return true;
    return false;
  });
}

export const store = new MemoryStore();
