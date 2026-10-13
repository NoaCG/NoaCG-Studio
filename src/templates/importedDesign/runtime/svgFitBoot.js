if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', refitSvgText);
} else {
  refitSvgText();                               // DOM already parsed (e.g. an inline preview build)
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(refitSvgText);
  // And whenever a face lands: in a page still parsing, ready can resolve before any layout has
  // asked for the face, and the one pass it buys is then taken in the fallback.
  if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', refitSvgText);
}
// A DESIGN THAT WAS NOT ON SCREEN WHEN IT LOADED FITS WHEN IT ARRIVES. Both passes above run
// once, at load, and a document that is preloaded hidden (a playout renderer, a control page
// whose monitors are behind another workspace) has nothing for them to measure. It stays owed
// rather than wrong (svgFitLaidOut), and this is what pays the debt when no update() ever comes
// to. Guarded on the debt itself, so a hide-and-show cycle on a design that already has its
// answers costs nothing, and the panel growth this fit performs can never re-enter it.
if (typeof ResizeObserver === 'function') {
  var svgFitArt = document.querySelector('.__PREFIX__-art');
  if (svgFitArt) {
    new ResizeObserver(function () {
      if (svgFitDue()) refitSvgText();
    }).observe(svgFitArt);
  }
}
