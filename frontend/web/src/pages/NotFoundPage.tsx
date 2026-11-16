import { Link } from 'react-router';
import { usePageTitle } from '../lib/a11y';

export default function NotFoundPage() {
  usePageTitle('הדף לא נמצא');
  return (
    <section className="page">
      <h1>הדף לא נמצא</h1>
      <Link to="/" className="button button--primary">לדף הבית</Link>
    </section>
  );
}
