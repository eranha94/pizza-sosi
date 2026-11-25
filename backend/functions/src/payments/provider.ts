import { CardcomProvider } from './cardcom.js';

/** A payment's real state, as told by the provider (server to server). */
export interface PaymentResult {
  status: 'approved' | 'pending' | 'declined';
  amountAgorot: number;
  /** The order id we sent with the payment. */
  orderId: string;
  transactionId: string;
  cardSuffix: string;
  approvalNumber: string;
}

/**
 * Card payments through a hosted payment page (PCI DSS SAQ A): card data never touches our servers.
 * Credentials come only from Secret Manager.
 */
export interface PaymentProvider {
  readonly name: string;
  isConfigured(): Promise<boolean>;
  /** Create a hosted payment page for the order and return its URL. */
  createPaymentPage(input: {
    orderId: string;
    amountAgorot: number;
    description: string;
    customer: { name: string; email?: string | null; phone: string };
    successUrl: string;
    cancelUrl: string;
    notifyUrl: string;
  }): Promise<{ url: string; providerRef: string }>;
  /** Which payment a notification is about (its content is not trusted beyond that). */
  refFromNotification(fields: Record<string, unknown>): { providerRef: string; orderId: string } | null;
  /** Ask the provider directly what happened with this payment. */
  getResult(providerRef: string): Promise<PaymentResult>;
  refund(r: { transactionId: string }, amountAgorot: number, full: boolean): Promise<void>;
}

export function getPaymentProvider(): PaymentProvider {
  return new CardcomProvider();
}
