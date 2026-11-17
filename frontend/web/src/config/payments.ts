/**
 * Online card payment (PayMe). Until the integration is live the option is shown greyed out with "בקרוב",
 * so customers – and the card company reviewing the site – see that it is coming.
 * Turn on together with the backend PayMe provider (the server also refuses card orders while it isn't configured).
 */
export const CARD_PAYMENTS_ENABLED = false;
