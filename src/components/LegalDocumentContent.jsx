import { Link } from 'react-router-dom';

function fillPlaceholders(content, values) {
  return String(content || '').replace(/\{(entityName|contactEmail|governingLaw|trialDays)\}/g, (_, key) => String(values[key] ?? ''));
}

function InlineText({ children }) {
  const parts = String(children).split(/(https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\/(?:terms|privacy|cookies)\b)/g);
  return parts.map((part, index) => {
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>;
    if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(part)) return <a key={index} href={`mailto:${part}`}>{part}</a>;
    if (/^\/(terms|privacy|cookies)$/.test(part)) return <Link key={index} to={part}>{part}</Link>;
    return part;
  });
}

export default function LegalDocumentContent({ content, values }) {
  const lines = fillPlaceholders(content, values).split(/\r?\n/);
  const blocks = [];
  let bullets = [];

  function flushBullets() {
    if (!bullets.length) return;
    blocks.push(<ul key={`list-${blocks.length}`}>{bullets.map((item, index) => <li key={index}><InlineText>{item}</InlineText></li>)}</ul>);
    bullets = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushBullets(); continue; }
    if (line.startsWith('- ')) { bullets.push(line.slice(2)); continue; }
    flushBullets();
    if (line.startsWith('## ')) blocks.push(<h2 key={`heading-${blocks.length}`}>{line.slice(3)}</h2>);
    else blocks.push(<p key={`paragraph-${blocks.length}`}><InlineText>{line}</InlineText></p>);
  }
  flushBullets();

  return blocks;
}
