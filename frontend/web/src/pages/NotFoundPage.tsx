import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <section className="page">
      <h1>הדף לא נמצא</h1>
      <Link to="/" className="button button--primary">לדף הבית</Link>
    </section>
  );
}
