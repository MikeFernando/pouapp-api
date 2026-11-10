import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type {
  BusinessProfile,
  Customer,
  Product,
  User,
} from '../types/domain.js';

const now = () => new Date().toISOString();

class MemoryStore {
  users = new Map<string, User>();
  customers = new Map<string, Customer>();
  products = new Map<string, Product>();
  profiles = new Map<string, BusinessProfile>();

  async seed() {
    if (this.users.size > 0) return;

    const passwordHash = await bcrypt.hash('123456', 10);
    const user: User = {
      id: randomUUID(),
      name: 'Edipo Silva',
      email: 'edipo@pouapp.com',
      passwordHash,
      createdAt: now(),
      updatedAt: now(),
    };
    this.users.set(user.id, user);
    this.profiles.set(user.id, {
      userId: user.id,
      receiverName: 'Edipo Silva',
      pixKeyType: 'phone',
      pixKey: '',
      updatedAt: now(),
    });

    const seedCustomers: Array<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>> =
      [
        { type: 'individual', name: 'Beatriz Nunes', phone: '15992639023', status: 'active' },
        { type: 'individual', name: 'João Oliveira', phone: '11988887777', status: 'active' },
        { type: 'individual', name: 'Marina Costa', phone: '11977776666', status: 'active' },
      ];
    for (const item of seedCustomers) {
      const customer: Customer = {
        ...item,
        id: randomUUID(),
        createdAt: now(),
        updatedAt: now(),
      };
      this.customers.set(customer.id, customer);
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
  }

  listUsers() {
    return [...this.users.values()];
  }

  findUserByEmail(email: string) {
    return this.listUsers().find(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
  }
}

export const store = new MemoryStore();
