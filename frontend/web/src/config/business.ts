import { CONTACT } from './contact';

/** Legal details of the business, shown on the legal pages. Public info only. */
export const BUSINESS = {
  name: 'פיצה סוסי',
  legalType: 'עוסק מורשה',
  id: '203918081',
  street: 'רחוב חולון',
  city: 'דאלית אל-כרמל',
  /** Full address as shown on the site (street + city). */
  get address() {
    return `${this.street}, ${this.city}`;
  },
  phone: CONTACT.phoneDisplay,
  email: 'support@pizza-sosi.co.il',
  site: 'pizza-sosi.co.il',
  /** Date the legal texts were last updated. */
  legalUpdated: '16 בנובמבר 2026',
};
