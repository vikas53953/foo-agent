// Spec: 02-3 §F28.1 (FE-09). First child of <head>: sets data-theme before first paint and follows live switches.
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var apply = function () {
    root.dataset.theme = mq.matches ? 'dark' : 'light';
  };
  apply();
  mq.addEventListener('change', function () {
    root.classList.add('theme-switching');
    apply();
    requestAnimationFrame(function () {
      root.classList.remove('theme-switching');
    });
  });
})();
