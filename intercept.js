/**
 * DSP Sweeper — API Interceptor
 * Runs in the page's MAIN world at document_start.
 * Intercepts fetch/XHR responses and forwards them to the content script via CustomEvent.
 */
(function () {
  'use strict';

  // Intercept fetch
  const origFetch = window.fetch;
  window.fetch = function () {
    const url = (arguments[0] instanceof Request) ? arguments[0].url : String(arguments[0]);
    const result = origFetch.apply(this, arguments);
    if (url.includes('route-summaries') || url.includes('locationUpdate')) {
      result.then(function (response) {
        return response.clone().text().then(function (text) {
          if (url.includes('route-summaries')) {
            document.dispatchEvent(new CustomEvent('__bbdr_route_summaries', { detail: text }));
          } else if (url.includes('locationUpdate')) {
            document.dispatchEvent(new CustomEvent('__bbdr_location_update', { detail: text }));
          }
        });
      }).catch(function () {});
    }
    return result;
  };

  // Intercept XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__bbdr_url = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    var self = this;
    this.addEventListener('load', function () {
      var url = self.__bbdr_url || '';
      if (url.includes('route-summaries')) {
        document.dispatchEvent(new CustomEvent('__bbdr_route_summaries', { detail: self.responseText }));
      } else if (url.includes('locationUpdate')) {
        document.dispatchEvent(new CustomEvent('__bbdr_location_update', { detail: self.responseText }));
      }
    });
    return origSend.apply(this, arguments);
  };

  console.log('[DSP Sweeper] API interceptor active (MAIN world)');
})();
