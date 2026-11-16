/**
 * Customer details remembered on this device only (localStorage) – never sent anywhere except with an order.
 * The customer chooses this at checkout and can clear it any time ("שכחו אותי").
 */
export interface Profile {
  name: string;
  phone: string;
  email: string;
  street: string;
  houseNumber: string;
  apartment: string;
  addressNotes: string;
  fulfillment: 'pickup' | 'delivery';
  notifyWhatsapp: boolean;
}
export interface MyOrder {
  id: string;
  number: number;
  at: number;
  totalAgorot: number;
}

const PROFILE_KEY = 'pizza-sosi-profile';
const ORDERS_KEY = 'pizza-sosi-my-orders';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / full – fine */
  }
}

export const loadProfile = () => read<Profile>(PROFILE_KEY);
export const saveProfile = (p: Profile) => write(PROFILE_KEY, p);
export const forgetProfile = () => write(PROFILE_KEY, null);

export const loadMyOrders = () => read<MyOrder[]>(ORDERS_KEY) ?? [];
export function rememberOrder(o: MyOrder) {
  write(ORDERS_KEY, [o, ...loadMyOrders().filter((x) => x.id !== o.id)].slice(0, 20));
}
export const forgetMyOrders = () => write(ORDERS_KEY, null);
