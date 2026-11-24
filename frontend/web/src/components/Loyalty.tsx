import type { LoyaltyCardView } from '@pizza-sosi/contracts';

/**
 * The punch card: one slot per order, filled slots are "stamped". With many slots (e.g. 20) they wrap.
 * The words carry the same information for screen readers.
 */
export function LoyaltyCard({ card, compact = false }: { card: LoyaltyCardView; compact?: boolean }) {
  const left = card.required - card.stamps;
  const text =
    card.rewards > 0
      ? `מגיע לך: ${card.rewardLabel} 🎉`
      : left === 1
        ? `עוד הזמנה אחת ומגיע לך: ${card.rewardLabel}`
        : `עוד ${left} הזמנות ומגיע לך: ${card.rewardLabel}`;
  return (
    <section className={`punch ${compact ? 'punch--compact' : ''} ${card.rewards > 0 ? 'is-full' : ''}`} aria-label="כרטיסיית נאמנות">
      <div className="punch__head">
        <strong>הכרטיסייה שלך</strong>
        <span>
          {card.stamps} / {card.required}
        </span>
      </div>
      <ol className="punch__slots" aria-hidden="true">
        {Array.from({ length: card.required }, (_, i) => (
          <li key={i} className={i < card.stamps || card.rewards > 0 ? 'is-on' : ''}>
            {i === card.required - 1 ? '🎁' : ''}
          </li>
        ))}
      </ol>
      <p className="punch__text">{text}</p>
      {card.minOrderAgorot > 0 && !compact && <p className="punch__note">כל הזמנה מ-{card.minOrderAgorot / 100} ₪ נחשבת, אחרי שהיא נמסרת.</p>}
    </section>
  );
}
