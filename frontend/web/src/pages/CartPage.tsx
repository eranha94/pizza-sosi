import { Link } from 'react-router';
import { formatAgorot } from '@pizza-sosi/contracts/constants';
import { useCart, cartTotal } from '../store/cart';

export default function CartPage() {
  const { lines, setQuantity, remove } = useCart();
  const total = useCart(cartTotal);

  if (lines.length === 0) {
    return (
      <section className="page">
        <h1>הסל ריק</h1>
        <p>בחרו משהו טעים מהתפריט.</p>
        <Link to="/#menu" className="button button--primary">לתפריט</Link>
      </section>
    );
  }

  return (
    <section className="page">
      <h1>הסל שלך</h1>
      <ul className="cart-list">
        {lines.map((l) => (
          <li key={l.key} className="cart-line">
            <div className="cart-line__info">
              <strong>{l.name}</strong>
              {l.addOnNames.length > 0 && <span className="muted">{l.addOnNames.join(', ')}</span>}
              {l.note && <span className="muted">הערה: {l.note}</span>}
            </div>
            <div className="stepper" role="group" aria-label={`כמות של ${l.name}`}>
              <button type="button" aria-label="הפחתה" onClick={() => (l.quantity === 1 ? remove(l.key) : setQuantity(l.key, l.quantity - 1))}>−</button>
              <output>{l.quantity}</output>
              <button type="button" aria-label="הוספה" onClick={() => setQuantity(l.key, l.quantity + 1)}>+</button>
            </div>
            <span className="cart-line__price">{formatAgorot(l.unitPriceAgorot * l.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="summary">
        <span>סה״כ</span>
        <strong>{formatAgorot(total)}</strong>
      </div>
      <p className="muted small">הסכום הסופי מאושר בעת ההזמנה.</p>
      <Link to="/checkout" className="button button--primary button--block">להמשך הזמנה</Link>
    </section>
  );
}
