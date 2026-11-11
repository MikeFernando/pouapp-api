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

function customerName(customerId: string): string {
  return store.customers.get(customerId)?.name?.trim() || 'Cliente';
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
      openNotes: (current.openNotes ?? 0) + (next.openNotes ?? 0),
    });
    return;
  }
  map.set(next.customerId, {
    ...current,
    openCents: current.openCents + next.openCents,
    openNotes: (current.openNotes ?? 0) + (next.openNotes ?? 0),
    settled: Boolean(current.settled && next.settled),
  });
}

export function buildHomeBoard(date: string, userId: string): HomeBoard {
  const tomorrow = addDays(date, 1);
  const sales = store.listSalesForUser(userId);
  const notes = store
    .listNotesForUser(userId)
    .filter((note) => note.status === 'draft' && note.totalCents > 0);
  const receipts = store.listReceiptsForUser(userId);

  const receivedTodayCents = receipts
    .filter((receipt) => receipt.paidOn === date)
    .reduce((sum, receipt) => sum + receipt.amountCents, 0);

  const todayMap = new Map<string, HomeDueItem>();
  for (const sale of sales) {
    if (sale.dueOn !== date) continue;
    const open = openCents(sale);
    const total = sale.totalCents;
    mergeDue(
      todayMap,
      {
        customerId: sale.customerId,
        customerName: customerName(sale.customerId),
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
    todayMap.set(note.customerId, {
      customerId: note.customerId,
      customerName: customerName(note.customerId),
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
    const item: HomeDueItem = {
      customerId: sale.customerId,
      customerName: customerName(sale.customerId),
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
    const item: HomeDueItem = {
      customerId: note.customerId,
      customerName: customerName(note.customerId),
      openCents: note.totalCents,
      dueOn: note.dueOn,
      settled: false,
      openNotes: 1,
    };
    if (note.dueOn === tomorrow) {
      if (!tomorrowMap.has(note.customerId)) tomorrowMap.set(note.customerId, item);
      else {
        const current = tomorrowMap.get(note.customerId)!;
        tomorrowMap.set(note.customerId, {
          ...current,
          openCents: current.openCents + note.totalCents,
          openNotes: (current.openNotes ?? 0) + 1,
        });
      }
    } else if (note.dueOn > tomorrow) {
      const current = upcomingMap.get(note.customerId);
      if (!current || note.dueOn < current.dueOn) {
        upcomingMap.set(note.customerId, item);
      } else if (note.dueOn === current.dueOn) {
        upcomingMap.set(note.customerId, {
          ...current,
          openCents: current.openCents + note.totalCents,
          openNotes: (current.openNotes ?? 0) + 1,
        });
      }
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
