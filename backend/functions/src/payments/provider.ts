/**
 * Adapter for the card-payment provider (hosted payment page, PCI DSS SAQ A).
 * The provider is not chosen yet (Isracard is the acquirer). A concrete adapter
 * implements this interface; credentials come only from Secret Manager.
 */
export interface PaymentProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Create a hosted payment page for the order and return its URL. Card data never touches our servers. */
  createPaymentPage(input: {
    orderId: string;
    amountAgorot: number;
    customer: { name: string; email: string; phone: string };
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; providerRef: string }>;
  /** Verify a webhook's signature/authenticity. Must reject anything not from the provider. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<{ providerRef: string } | null>;
  /** Ask the provider directly (server to server) what the real transaction state is. */
  getTransaction(providerRef: string): Promise<{ status: 'approved' | 'declined' | 'pending'; amountAgorot: number; orderId: string }>;
  refund(providerRef: string, amountAgorot: number): Promise<void>;
}

class NotConfiguredProvider implements PaymentProvider {
  readonly name = 'none';
  isConfigured() {
    return false;
  }
  async createPaymentPage(): Promise<never> {
    throw new Error('payment provider not configured');
  }
  async verifyWebhook() {
    return null;
  }
  async getTransaction(): Promise<never> {
    throw new Error('payment provider not configured');
  }
  async refund(): Promise<never> {
    throw new Error('payment provider not configured');
  }
}

export function getPaymentProvider(): PaymentProvider {
  // When the provider is chosen: return new XyzProvider(secrets) here.
  return new NotConfiguredProvider();
}
