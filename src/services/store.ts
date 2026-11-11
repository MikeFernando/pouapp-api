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

export const BCRYPT_COST = 12;

const STORE_VERSION = 2;

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

/** Default hortifruti catalog cloned for each new account. */
const DEFAULT_PRODUCT_CATALOG: Array<
  Omit<Product, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
> = [
  { name: 'Banana nanica', unit: 'dozen', salePriceCents: 590, active: true },
  { name: 'Tomate italiano', unit: 'box', salePriceCents: 5900, active: true },
  { name: 'Alface crespa', unit: 'piece', salePriceCents: 350, active: true },
  { name: 'Cenoura', unit: 'kilogram', salePriceCents: 450, active: true },
  { name: 'Batata doce', unit: 'kilogram', salePriceCents: 490, active: true },
  { name: 'Abacaxi', unit: 'piece', salePriceCents: 990, active: true },
  { name: 'Ovos dúzia', unit: 'dozen', salePriceCents: 1200, active: true },
  {
    name: 'Ovos bandeja 30',
    unit: 'piece',
    salePriceCents: 1890,
    active: true,
  },
];

function hasUserId(value: unknown): value is { userId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { userId?: unknown }).userId === 'string' &&
    (value as { userId: string }).userId.length > 0
  );
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
    const snapshot = await readJsonFile<StoreSnapshot & { version: number }>(
      env.dataFile,
    );
    if (!snapshot) {
      console.log(`store: no file at ${env.dataFile} (starting empty)`);
      return;
    }
    if (snapshot.version !== 1 && snapshot.version !== STORE_VERSION) {
      throw new Error(
        `Unsupported store version ${snapshot.version} (expected ${STORE_VERSION})`,
      );
    }

    this.hydrating = true;
    try {
      this.replaceMap(this.users, snapshot.users, (item) => item.id);
      this.replaceMap(this.profiles, snapshot.profiles, (item) => item.userId);
      this.replaceMap(this.licenses, snapshot.licenses, (item) => item.userId);
      this.replaceMap(
        this.refreshSessions,
        pruneRefreshSessions(snapshot.refreshSessions ?? []),
        (item) => item.id,
      );

      if (snapshot.version === 1) {
        // v1 shared customers/products across all accounts — drop them.
        this.customers.clear();
        this.products.clear();
        this.notes.clear();
        this.sales.clear();
        this.receipts.clear();
      } else {
        this.replaceMap(
          this.customers,
          (snapshot.customers ?? []).filter(hasUserId),
          (item) => item.id,
        );
        this.replaceMap(
          this.products,
          (snapshot.products ?? []).filter(hasUserId),
          (item) => item.id,
        );
        this.replaceMap(
          this.notes,
          (snapshot.notes ?? []).filter(hasUserId),
          (item) => item.id,
        );
        this.replaceMap(
          this.sales,
          (snapshot.sales ?? []).filter(hasUserId),
          (item) => item.id,
        );
        this.replaceMap(
          this.receipts,
          (snapshot.receipts ?? []).filter(hasUserId),
          (item) => item.id,
        );
      }
    } finally {
      this.hydrating = false;
    }

    if (snapshot.version === 1) {
      for (const user of this.users.values()) {
        this.provisionTenant(user.id);
      }
      await this.flush();
      console.log(
        `store: migrated v1→v2 (tenant isolation) — ${this.users.size} user(s)`,
      );
    }

    console.log(
      `store: loaded ${this.users.size} user(s), ${this.licenses.size} license(s) from ${env.dataFile}`,
    );
  }

  /**
   * Kept for boot compatibility. Tenant data is created in
   * [provisionTenant] on register — never shared globally.
   */
  async seed() {
    // Ensure every existing account has its own product catalog.
    for (const user of this.users.values()) {
      this.provisionTenant(user.id);
    }
  }

  /** Creates the default product catalog for a tenant (idempotent). */
  provisionTenant(userId: string) {
    const hasCatalog = [...this.products.values()].some(
      (product) => product.userId === userId,
    );
    if (hasCatalog) return;

    const timestamp = now();
    for (const item of DEFAULT_PRODUCT_CATALOG) {
      const product: Product = {
        ...item,
        id: randomUUID(),
        userId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.products.set(product.id, product);
    }
  }

  listUsers() {
    return [...this.users.values()];
  }

  findUserByEmail(email: string) {
    return this.listUsers().find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
  }

  listCustomersForUser(userId: string) {
    return [...this.customers.values()].filter(
      (customer) => customer.userId === userId,
    );
  }

  getCustomerForUser(customerId: string, userId: string) {
    const customer = this.customers.get(customerId);
    if (!customer || customer.userId !== userId) return undefined;
    return customer;
  }

  listProductsForUser(userId: string) {
    return [...this.products.values()].filter(
      (product) => product.userId === userId,
    );
  }

  getProductForUser(productId: string, userId: string) {
    const product = this.products.get(productId);
    if (!product || product.userId !== userId) return undefined;
    return product;
  }

  listNotesForUser(userId: string) {
    return [...this.notes.values()].filter((note) => note.userId === userId);
  }

  listSalesForUser(userId: string) {
    return [...this.sales.values()].filter((sale) => sale.userId === userId);
  }

  listReceiptsForUser(userId: string) {
    return [...this.receipts.values()].filter(
      (receipt) => receipt.userId === userId,
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
