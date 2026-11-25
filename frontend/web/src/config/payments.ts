import type { StoreSettings } from '@pizza-sosi/contracts';

/**
 * Online card payment (Grow). The owner switches it in the admin: off ("בקרוב"), test or live.
 * In test mode only a device that opened the site with ?paytest=1 sees the option – and the server
 * still accepts it only from the owner's test phone.
 */
const FLAG = 'pizza-sosi-paytest';

export function rememberPayTestFlag() {
  try {
    const p = new URLSearchParams(location.search).get('paytest');
    if (p === '1') localStorage.setItem(FLAG, '1');
    if (p === '0') localStorage.removeItem(FLAG);
  } catch {
    /* storage blocked */
  }
}

export function cardPaymentsOn(store: Pick<StoreSettings, 'cardPayments'> | undefined): boolean {
  const mode = store?.cardPayments ?? 'off';
  if (mode === 'live') return true;
  if (mode !== 'test') return false;
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

/** The card order waiting for payment on this device (the cart is kept until it is paid). */
const PAYING = 'pizza-sosi-paying';
export const payingOrder = {
  get: () => {
    try {
      return sessionStorage.getItem(PAYING);
    } catch {
      return null;
    }
  },
  set: (id: string) => {
    try {
      sessionStorage.setItem(PAYING, id);
    } catch {
      /* ignore */
    }
  },
  clear: () => {
    try {
      sessionStorage.removeItem(PAYING);
    } catch {
      /* ignore */
    }
  },
};
