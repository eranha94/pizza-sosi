import { httpsCallable, FunctionsError } from 'firebase/functions';
import {
  API,
  CreateOrderRequest,
  type CreateOrderInput,
  type CreateOrderResponse,
  type CancelOrderRequest,
  type OrderView,
} from '@pizza-sosi/contracts';
import { services, ensureSignedIn } from './firebase';

/** The only door from the browser to the backend. */
async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  await ensureSignedIn();
  const { functions } = await services();
  const fn = httpsCallable<Req, Res>(functions, name, { limitedUseAppCheckTokens: true });
  const res = await fn(data);
  return res.data;
}

export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResponse> {
  // Validate locally only for quick feedback; the server validates again and decides.
  const parsed = CreateOrderRequest.parse(input);
  return call(API.createOrder, parsed);
}

export function cancelOrder(input: CancelOrderRequest) {
  return call<CancelOrderRequest, { status: string }>(API.cancelOrder, input);
}

export function errorMessage(e: unknown): string {
  if (e instanceof FunctionsError) {
    // Our server sends Hebrew messages; anything else (internal, network, timeout) gets a friendly text.
    if (e.code === 'functions/internal' || e.code === 'functions/unavailable' || e.code === 'functions/deadline-exceeded' || !/[\u0590-\u05FF]/.test(e.message))
      return 'משהו השתבש ולא הצלחנו לשלוח. נסו שוב בעוד רגע, או התקשרו אלינו';
    return e.message;
  }
  return 'אין חיבור. בדקו את האינטרנט ונסו שוב';
}

/** Read-only tracking for links opened on another device (e.g. from WhatsApp). */
export function getOrderStatus(orderId: string) {
  return call<{ orderId: string }, OrderView & { mine: boolean }>(API.getOrderStatus, { orderId });
}
