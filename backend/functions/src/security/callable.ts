import { onCall, type CallableRequest, type CallableOptions } from 'firebase-functions/v2/https';
import { FUNCTIONS_REGION } from '@pizza-sosi/contracts';
import { ALLOWED_ORIGINS } from '../config.js';

/**
 * Every API endpoint goes through this wrapper:
 *  - App Check enforced (only our real site can call)
 *  - CORS limited to our domains
 *  - fixed region, small instance limits (cost + abuse ceiling)
 */
export function secureCall<T>(handler: (req: CallableRequest) => Promise<T>, opts: Partial<CallableOptions> = {}) {
  return onCall(
    {
      region: FUNCTIONS_REGION,
      enforceAppCheck: true,
      cors: ALLOWED_ORIGINS,
      maxInstances: 10,
      concurrency: 40,
      timeoutSeconds: 30,
      memory: '256MiB',
      ...opts,
    },
    handler,
  );
}
