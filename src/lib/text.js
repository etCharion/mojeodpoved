// Plain text of an HTML fragment — the single source of truth for
// "how many characters did the student actually write" checks.
export const stripHtml = (html) => {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};
