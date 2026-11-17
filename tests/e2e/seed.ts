import { db } from './admin';

/** A tiny menu + always-open store, written straight into the Firestore emulator. */
export default async function seed() {
  const d = db();
  const allDay = { open: '00:00', close: '23:59' };
  await d.doc('settings/store').set({
    weeklyHours: [allDay, allDay, allDay, allDay, allDay, allDay, allDay],
    overrides: [],
    acceptingOrders: true,
    prepMinutes: 20,
    deliveryEnabled: true,
    deliveryFeeAgorot: 1500,
    minOrderAgorot: 0,
    whatsappStatuses: [],
  });
  const opt = (id: string, name: string, whole: number, half: number | null) => ({ id, name, wholeAgorot: whole, halfAgorot: half, active: true });
  await d.doc('menuItems/e2e-pizza').set({
    name: 'פיצה בדיקה',
    description: 'פיצה לבדיקות אוטומטיות',
    category: 'pizzas',
    priceAgorot: 5900,
    imagePath: null,
    order: 10,
    active: true,
    tags: ['recommended'],
    addOnGroups: [
      { id: 'dough', name: 'עובי בצק', order: 1, selection: 'single', defaultOptionId: 'std', options: [opt('std', 'סטנדרט', 0, null), opt('thick', 'עבה', 500, null)] },
      { id: 'tops', name: 'תוספות', order: 2, selection: 'multi', defaultOptionId: null, options: [opt('olives', 'זיתים', 1000, 600), opt('tuna', 'טונה', 1300, 800)] },
    ],
  });
  await d.doc('menuItems/e2e-cola').set({
    name: 'קולה בדיקה', description: '', category: 'drinks', priceAgorot: 800, imagePath: null, order: 10, active: true, tags: [], addOnGroups: [],
  });
}
