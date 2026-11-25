import { GrowProvider } from './grow.js';

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
  }): Promise<{ url: string; providerRef: string; providerToken: string }>;
  /** Match a provider notification to the order's stored ids. null = not from the provider. */
  verifyWebhook(
    fields: Record<string, string>,
    stored: { providerRef: string | null; providerToken: string | null },
  ): Promise<{
    providerRef: string;
    status: 'approved' | 'pending';
    amountAgorot: number;
    transactionId: string;
    transactionToken: string;
    asmachta: string;
    cardSuffix: string;
  } | null>;
  /** Ask the provider directly (server to server) what the real state is. */
  getTransaction(providerRef: string, providerToken: string): Promise<{ status: 'approved' | 'pending' | 'unknown'; amountAgorot: number }>;
  /** Acknowledge a notification. */
  approve(transactionId: string, transactionToken: string): Promise<void>;
  refund(t: { transactionId: string; transactionToken: string }, amountAgorot: number): Promise<void>;
}

export function getPaymentProvider(): PaymentProvider {
  return new GrowProvider();
}
