/**
 * ============================================================================
 *  PAGE BLOCKS — the modular content system.
 * ============================================================================
 *
 *  Every page is a list of blocks declared in `content.js`. Drop a block into
 *  the array and it renders. Nothing else to wire up.
 *
 *  Available blocks
 *    { type: 'heading',    text, level, kicker }
 *    { type: 'lead',       text }
 *    { type: 'text',       paragraphs: [...] }
 *    { type: 'columns',    columns: [{title, body}] }
 *    { type: 'imageGrid',  images: [{src, alt, ratio}], cols }
 *    { type: 'image',      src, alt, caption, ratio }
 *    { type: 'video',      src, poster, caption }
 *    { type: 'iframe',     src, title, ratio }
 *    { type: 'model',      src, caption }        lazy-loaded 3D viewport
 *    { type: 'projects',   items: [...] }
 *    { type: 'gallery',    items: [...] }
 *    { type: 'articles',   items: [...] }
 *    { type: 'stats',      items: [{value, label}] }
 *    { type: 'timeline',   items: [{year, title, body}] }
 *    { type: 'specs',      items: [{k, v}] }
 *    { type: 'quote',      text, author }
 *    { type: 'contact',    action, email }
 *    { type: 'spacer',     size }
 *    { type: 'divider' }
 *    { type: 'raw',        html }
 *
 *  Empty blocks render a clearly-marked "content slot" affordance so you can see
 *  exactly where each piece of content belongs.
 */

import { Suspense, lazy, useState } from 'react';
import { asset } from '../core/asset.js';

const LazyModel = lazy(() => import('./ModelBlock.jsx'));

export function PageShell({ page, children }) {
  return (
    <article className="page" style={{ '--accent': page.accent }}>
      <header className="page__head">
        <p className="page__eyebrow">{page.eyebrow ?? page.label}</p>
        <h1 className="page__title">{page.title}</h1>
        {page.subtitle && <p className="page__subtitle">{page.subtitle}</p>}
        <div className="page__rule" />
      </header>

      <div className="page__body">
        {(page.blocks ?? []).map((b, i) => <Block key={i} {...b} index={i} />)}
        {children}
      </div>
    </article>
  );
}

export function Block({ type, ...props }) {
  switch (type) {
    case 'heading': return <Heading {...props} />;
    case 'lead': return <Lead {...props} />;
    case 'text': return <Text {...props} />;
    case 'columns': return <Columns {...props} />;
    case 'imageGrid': return <ImageGrid {...props} />;
    case 'image': return <ImageBlock {...props} />;
    case 'video': return <VideoBlock {...props} />;
    case 'iframe': return <IframeBlock {...props} />;
    case 'model': return <ModelBlock {...props} />;
    case 'projects': return <ProjectGrid {...props} />;
    case 'gallery': return <Gallery {...props} />;
    case 'articles': return <ArticleList {...props} />;
    case 'stats': return <Stats {...props} />;
    case 'timeline': return <Timeline {...props} />;
    case 'specs': return <Specs {...props} />;
    case 'quote': return <Quote {...props} />;
    case 'contact': return <Contact {...props} />;
    case 'divider': return <hr className="page__divider" />;
    case 'spacer': return <div style={{ height: props.size ?? 48 }} />;
    case 'raw': return <div dangerouslySetInnerHTML={{ __html: props.html ?? '' }} />;
    default: return <Placeholder label={`Unknown block "${type}"`} />;
  }
}

/* ------------------------------------------------------------------ */
const Heading = ({ text, level = 2, kicker }) => (
  <div className={`blk blk--h level-${level}`}>
    {kicker && <p className="blk__kicker">{kicker}</p>}
    <h2 className="blk__heading">{text}</h2>
  </div>
);

const Lead = ({ text }) => <p className="blk blk--lead">{text}</p>;

const Text = ({ paragraphs = [] }) => (
  <div className="blk blk--text">
    {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
  </div>
);

const Columns = ({ columns = [] }) => (
  <div className="blk blk--columns" style={{ '--cols': columns.length || 2 }}>
    {columns.map((c, i) => (
      <div key={i} className="blk__col">
        {c.title && <h3 className="blk__col-title">{c.title}</h3>}
        <p>{c.body}</p>
      </div>
    ))}
  </div>
);

export const Placeholder = ({ label, hint }) => (
  <div className="slot">
    <span className="slot__tag">content slot</span>
    <span className="slot__label">{label}</span>
    {hint && <span className="slot__hint">{hint}</span>}
  </div>
);

/** A framed slot for an image that hasn't been added yet. */
const ImageSlot = ({ alt, ratio = '16 / 10', caption, src }) => {
  const [failed, setFailed] = useState(!src);
  if (src && !failed) {
    return (
      <figure className="shot">
        <img src={asset(src)} alt={alt ?? ''} loading="lazy" onError={() => setFailed(true)} />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }
  return (
    <figure className="shot shot--empty" style={{ aspectRatio: ratio }}>
      <Placeholder label={alt ?? 'image'} hint={src ? 'the file could not be loaded' : 'drop an image src here'} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
};

const ImageBlock = (p) => <ImageSlot {...p} />;

const ImageGrid = ({ images = [], cols }) => (
  <div className="blk blk--grid" style={{ '--cols': cols ?? Math.min(3, images.length || 2) }}>
    {images.map((img, i) => <ImageSlot key={i} {...img} />)}
  </div>
);

const VideoBlock = ({ src, poster, caption, ratio = '16 / 9' }) => {
  if (!src) {
    return (
      <figure className="shot shot--empty" style={{ aspectRatio: ratio }}>
        <Placeholder label="video" hint="drop a video src or a YouTube/Vimeo embed URL" />
        {caption && <figcaption>{caption}</figcaption>}
      </figure>
    );
  }
  const isEmbed = /youtube|youtu\.be|vimeo/i.test(src);
  return (
    <figure className="shot shot--video" style={{ aspectRatio: ratio }}>
      {isEmbed ? (
        <iframe
          src={src}
          title={caption ?? 'Embedded media'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <video src={asset(src)} poster={asset(poster)} controls playsInline preload="metadata" />
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
};

const IframeBlock = ({ src, title, ratio = '16 / 10' }) => (
  <figure className="shot shot--embed" style={{ aspectRatio: ratio }}>
    {src ? (
      <iframe src={src} title={title ?? 'Embedded content'} loading="lazy" allowFullScreen />
    ) : (
      <Placeholder label="embed" hint="paste any iframe URL — Figma, Are.na, a live demo…" />
    )}
  </figure>
);

const ModelBlock = (p) => (
  <Suspense fallback={<Placeholder label="3D viewport" hint="loading…" />}>
    <LazyModel {...p} />
  </Suspense>
);

/* ------------------------------------------------------------------ *
 * rich collections
 * ------------------------------------------------------------------ */
const ProjectGrid = ({ items = [] }) => (
  <div className="blk blk--projects">
    {items.length === 0 && <Placeholder label="projects" hint="add items to the 'projects' block" />}
    {items.map((it, i) => (
      <article key={i} className="card" style={{ '--card-accent': it.accent }}>
        <div className="card__media">
          {it.image ? <img src={it.image} alt={it.title} loading="lazy" /> : <span className="card__media-ghost" />}
          <span className="card__index">{String(i + 1).padStart(2, '0')}</span>
        </div>
        <div className="card__body">
          <p className="card__kicker">{[it.year, it.role].filter(Boolean).join(' · ')}</p>
          <h3 className="card__title">{it.title}</h3>
          <p className="card__text">{it.summary}</p>
          <ul className="card__tags">{(it.tags ?? []).map((t) => <li key={t}>{t}</li>)}</ul>
          {it.href && <a className="card__link" href={it.href} target="_blank" rel="noreferrer">Visit ↗</a>}
        </div>
      </article>
    ))}
  </div>
);

const Gallery = ({ items = [] }) => (
  <div className="blk blk--gallery" style={{ '--cols': Math.min(3, items.length || 3) }}>
    {items.length === 0 && <Placeholder label="gallery" hint="add images to the 'gallery' block" />}
    {items.map((it, i) => (
      <figure key={i} className="tile">
        {it.src ? <img src={asset(it.src)} alt={it.title ?? ''} loading="lazy" /> : <span className="tile__ghost" />}
        <figcaption>{it.title ?? `Shot ${i + 1}`}</figcaption>
      </figure>
    ))}
  </div>
);

const ArticleList = ({ items = [] }) => (
  <div className="blk blk--articles">
    {items.length === 0 && <Placeholder label="articles" hint="add items to the 'articles' block" />}
    {items.map((a, i) => (
      <a key={i} className="row" href={a.href ?? '#'} onClick={(e) => !a.href && e.preventDefault()}>
        <span className="row__date">{a.date ?? ''}</span>
        <span className="row__title">{a.title}</span>
        <span className="row__tag">{a.tag ?? 'note'}</span>
        <span className="row__arrow">→</span>
      </a>
    ))}
  </div>
);

const Stats = ({ items = [] }) => (
  <div className="blk blk--stats" style={{ '--cols': Math.min(4, items.length || 4) }}>
    {items.map((s, i) => (
      <div key={i} className="stat">
        <span className="stat__value">{s.value}</span>
        <span className="stat__label">{s.label}</span>
      </div>
    ))}
  </div>
);

const Timeline = ({ items = [] }) => (
  <div className="blk blk--timeline">
    {items.map((t, i) => (
      <div key={i} className="tl">
        <span className="tl__year">{t.year}</span>
        <div className="tl__body">
          <h3 className="tl__title">{t.title}</h3>
          <p>{t.body}</p>
        </div>
      </div>
    ))}
  </div>
);

const Specs = ({ items = [] }) => (
  <dl className="blk blk--specs">
    {items.map((s, i) => (
      <div key={i} className="specs__row">
        <dt>{s.k}</dt>
        <dd>{s.v}</dd>
      </div>
    ))}
  </dl>
);

const Quote = ({ text, author }) => (
  <blockquote className="blk blk--quote">
    <p>“{text}”</p>
    {author && <cite>{author}</cite>}
  </blockquote>
);

/**
 * Contact block. With no endpoint it renders a mailto link so the page works out
 * of the box; point `action` at a form service (Formspree, Netlify, your API)
 * and it becomes a real POST form with no other changes.
 */
const Contact = ({ action, email, name = 'Your name', message = 'Your message' }) => {
  const [sent, setSent] = useState(false);
  if (sent) return <div className="blk blk--contact-done">Message sent. I&rsquo;ll be in touch.</div>;

  if (!action) {
    return (
      <div className="blk blk--contact">
        <Placeholder label="contact form" hint="set an `action` URL to make this live" />
        {email && <a className="btn btn--primary" href={`mailto:${email}`}>Write to {email}</a>}
      </div>
    );
  }
  return (
    <form className="blk blk--form" action={action} method="POST"
      onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
      <label className="field">
        <span>{name}</span>
        <input name="name" type="text" required autoComplete="name" />
      </label>
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        <span>{message}</span>
        <textarea name="message" rows={6} required />
      </label>
      <button className="btn btn--primary" type="submit">Send</button>
    </form>
  );
};

export default PageShell;