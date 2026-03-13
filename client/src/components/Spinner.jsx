/**
 * Spinner  –  reusable loading indicator
 *
 * Props:
 *   size   : 'sm' | 'md' | 'lg'   (default 'md')
 *   dark   : bool  – dark-themed spinner (blue on white bg)
 *   label  : string – optional text under the spinner
 *   inline : bool  – render inline instead of centred block
 */
export default function Spinner({ size = 'md', dark = false, label, inline = false }) {
  const cls = [
    'spinner',
    size === 'sm' ? 'spinner--sm' : size === 'lg' ? 'spinner--lg' : '',
    dark ? 'spinner--dark' : '',
  ].filter(Boolean).join(' ');

  if (inline) {
    return <span className={cls} aria-label="Loading" />;
  }

  return (
    <div className="loading-center">
      <span className={cls} aria-label="Loading" />
      {label && <span>{label}</span>}
    </div>
  );
}
