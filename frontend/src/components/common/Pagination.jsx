/**
 * Pagination.jsx — shared numbered pagination control
 * frontend/src/components/common/Pagination.jsx
 *
 * Used by both the Shop/browse page (ProductsPage) and the search-results page
 * (SearchPage) so they share one consistent control. Standard behavior:
 *   • numbered page buttons with an ellipsis (…) collapsing large gaps
 *   • Prev / Next with disabled states at the ends
 *   • current-page highlight
 *   • responsive (buttons wrap; Prev/Next labels shorten on narrow screens)
 *
 * The parent owns page state and scroll-to-top — this component is presentational
 * and only calls onPageChange(nextPage). It renders nothing when there is a
 * single page (or none), so callers can drop it in unconditionally.
 *
 * Props:
 *   page          number  — current 1-based page
 *   totalPages    number  — total number of pages
 *   onPageChange  fn      — (nextPage) => void
 *   className     string  — optional extra classes on the wrapper
 */

// Build the compact list of pages to render, inserting the string '…' where a
// run of pages is collapsed. Always keeps the first page, the last page, the
// current page, and one neighbor on each side of current. Classic algorithm:
// collect the "kept" indices, then walk them inserting a gap marker whenever
// two consecutive kept indices aren't adjacent (a single-page gap is filled
// with the real number rather than an ellipsis, since '…' for one page is
// pointless).
const buildPageList = (page, totalPages) => {
  const delta = 1; // neighbors on each side of the current page
  const kept = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      kept.push(i);
    }
  }

  const withGaps = [];
  let prev;
  for (const i of kept) {
    if (prev) {
      if (i - prev === 2) withGaps.push(prev + 1); // exactly one missing → show it
      else if (i - prev > 2) withGaps.push('…');    // real gap → ellipsis
    }
    withGaps.push(i);
    prev = i;
  }
  return withGaps;
};

const Pagination = ({ page, totalPages, onPageChange, className = '' }) => {
  if (!totalPages || totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);
  const go = (p) => {
    if (p < 1 || p > totalPages || p === page) return;
    onPageChange(p);
  };

  return (
    <nav
      className={`flex items-center justify-center flex-wrap gap-1.5 sm:gap-2 mt-8 ${className}`}
      aria-label="Pagination"
    >
      {/* Prev */}
      <button
        onClick={() => go(page - 1)}
        disabled={page === 1}
        className="px-3 sm:px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:border-gray-300 transition-all"
        aria-label="Previous page"
      >
        <span className="sm:hidden">←</span>
        <span className="hidden sm:inline">← Prev</span>
      </button>

      {/* Numbered buttons + ellipses */}
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="w-9 h-9 flex items-center justify-center text-gray-400 select-none">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => go(p)}
            aria-current={page === p ? 'page' : undefined}
            className={`w-9 h-9 text-sm rounded-lg transition-all
              ${page === p
                ? 'bg-indigo-600 text-white'
                : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}
          >
            {p}
          </button>
        )
      )}

      {/* Next */}
      <button
        onClick={() => go(page + 1)}
        disabled={page === totalPages}
        className="px-3 sm:px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:border-gray-300 transition-all"
        aria-label="Next page"
      >
        <span className="sm:hidden">→</span>
        <span className="hidden sm:inline">Next →</span>
      </button>
    </nav>
  );
};

export default Pagination;
