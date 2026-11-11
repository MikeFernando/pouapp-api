import type {
  Customer,
  CustomerNote,
  HomeBoard,
  HomeDueItem,
  PostedSale,
  Receipt,
} from '../types/domain.js';
import { store } from './store.js';

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function customerName(customerId: string): string | null {
  const name = store.customers.get(customerId)?.name?.trim();
  return name && name.length > 0 ? name : null;
}

function openCents(sale: PostedSale): number {
  return Math.max(0, sale.totalCents - sale.allocatedCents);
}

function mergeDue(
  map: Map<string, HomeDueItem>,
  next: HomeDueItem,
  preferEarlierDue: boolean,
) {
  if (next.openCents <= 0 && !next.settled) return;
  const current = map.get(next.customerId);
  if (!current) {
    map.set(next.customerId, next);
    return;
  }
  if (preferEarlierDue && next.dueOn < current.dueOn) {
    map.set(next.customerId, {
      ...next,
      openNotes: 1,
    });
    return;
  }
  map.set(next.customerId, {
    ...current,
    openCents: current.openCents + next.openCents,
    openNotes: 1,
    settled: Boolean(current.settled && next.settled),
  });
}

/** One draft note per customer — keep the newest `updatedAt`. */
function openDraftNotes(userId: string): CustomerNote[] {
  store.consolidateDraftNotes(userId);
  const byCustomer = new Map<string, CustomerNote>();
  for (const note of store.listNotesForUser(userId)) {
    if (note.status !== 'draft' || note.totalCents <= 0) continue;
    if (!customerName(note.customerId)) {
      store.notes.delete(note.id);
      continue;
    }
    const current = byCustomer.get(note.customerId);
    if (!current || note.updatedAt > current.updatedAt) {
      byCustomer.set(note.customerId, note);
    }
  }
  return [...byCustomer.values()];
}

export function buildHomeBoard(date: string, userId: string): HomeBoard {
  const tomorrow = addDays(date, 1);
  const sales = store.listSalesForUser(userId);
  const notes = openDraftNotes(userId);
  const receipts = store.listReceiptsForUser(userId);

  const receivedTodayCents = receipts
    .filter((receipt) => receipt.paidOn === date)
    .reduce((sum, receipt) => sum + receipt.amountCents, 0);

  const todayMap = new Map<string, HomeDueItem>();
  for (const sale of sales) {
    if (sale.dueOn !== date) continue;
    const name = customerName(sale.customerId);
    if (!name) continue;
    const open = openCents(sale);
    const total = sale.totalCents;
    mergeDue(
      todayMap,
      {
        customerId: sale.customerId,
        customerName: name,
        openCents: open > 0 ? open : total,
        dueOn: date,
        settled: open <= 0,
      },
      false,
    );
  }
  for (const note of notes) {
    if (note.dueOn !== date) continue;
    if (todayMap.has(note.customerId)) continue;
    const name = customerName(note.customerId);
    if (!name) continue;
    todayMap.set(note.customerId, {
      customerId: note.customerId,
      customerName: name,
      openCents: note.totalCents,
      dueOn: date,
      settled: false,
      openNotes: 1,
    });
  }

  const tomorrowMap = new Map<string, HomeDueItem>();
  const upcomingMap = new Map<string, HomeDueItem>();

  for (const sale of sales) {
    const open = openCents(sale);
    if (open <= 0) continue;
    const name = customerName(sale.customerId);
    if (!name) continue;
    const item: HomeDueItem = {
      customerId: sale.customerId,
      customerName: name,
      openCents: open,
      dueOn: sale.dueOn,
      settled: false,
    };
    if (sale.dueOn === tomorrow) {
      mergeDue(tomorrowMap, item, true);
    } else if (sale.dueOn > tomorrow) {
      mergeDue(upcomingMap, item, true);
    }
  }

  for (const note of notes) {
    if (tomorrowMap.has(note.customerId) || upcomingMap.has(note.customerId)) {
      // Sales already represent this customer; notes never stack on top.
      continue;
    }
    const name = customerName(note.customerId);
    if (!name) continue;
    const item: HomeDueItem = {
      customerId: note.customerId,
      customerName: name,
      openCents: note.totalCents,
      dueOn: note.dueOn,
      settled: false,
      openNotes: 1,
    };
    if (note.dueOn === tomorrow) {
      tomorrowMap.set(note.customerId, item);
    } else if (note.dueOn > tomorrow) {
      upcomingMap.set(note.customerId, item);
    }
  }

  const sortByName = (a: HomeDueItem, b: HomeDueItem) => {
    if (Boolean(a.settled) !== Boolean(b.settled)) {
      return a.settled ? 1 : -1;
    }
    return a.customerName.localeCompare(b.customerName, 'pt-BR');
  };
  const sortByDue = (a: HomeDueItem, b: HomeDueItem) => {
    const byDate = a.dueOn.localeCompare(b.dueOn);
    if (byDate !== 0) return byDate;
    return a.customerName.localeCompare(b.customerName, 'pt-BR');
  };

  return {
    date,
    receivedTodayCents,
    receiptsDueToday: [...todayMap.values()].sort(sortByName),
    duesTomorrow: [...tomorrowMap.values()].sort(sortByName),
    upcomingDues: [...upcomingMap.values()].sort(sortByDue),
  };
}

/** Calendar day in Brazil — avoids UTC flipping “hoje/amanhã” after 21h. */
export function isoToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export type { Customer, CustomerNote, PostedSale, Receipt };
