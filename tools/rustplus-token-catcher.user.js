// ==UserScript==
// @name         Rust+ login token catcher
// @description  Facepunch's login page hands the token to the Rust+ phone app via window.ReactNativeWebView. This stands in for that app and only DISPLAYS the message on screen. Nothing is sent anywhere.
// @match        https://companion-rust.facepunch.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* Runs in the page's own context (injected as a <script>), so it also works when the userscript
       manager runs this file in an isolated world. */
    function pageSide() {
        function ready(fn) {
            if (document.body) fn();
            else document.addEventListener('DOMContentLoaded', fn);
        }

        function banner(text, ok) {
            ready(function () {
                var bar = document.getElementById('rpp-catcher-bar');
                if (!bar) {
                    bar = document.createElement('div');
                    bar.id = 'rpp-catcher-bar';
                    bar.style.cssText = 'position:fixed;z-index:2147483647;left:0;right:0;top:0;padding:6px 10px;' +
                        'font:14px sans-serif;color:#fff;text-align:center;';
                    document.body.appendChild(bar);
                }
                bar.style.background = ok ? '#1a7f37' : '#b36b00';
                bar.textContent = text;
            });
        }

        function show(text) {
            ready(function () {
                var box = document.getElementById('rpp-catcher-box');
                if (!box) {
                    box = document.createElement('textarea');
                    box.id = 'rpp-catcher-box';
                    box.readOnly = true;
                    box.style.cssText = 'position:fixed;z-index:2147483647;left:5%;top:15%;width:90%;height:45%;' +
                        'font:14px monospace;background:#fff;color:#000;border:4px solid #c00;padding:8px;';
                    document.body.appendChild(box);
                }
                box.value = text;
                box.focus();
                box.select();
            });
            banner('Rust+ token catcher: odebrano wiadomosc od strony, skopiuj ja z czerwonej ramki', true);
        }

        window.ReactNativeWebView = {
            postMessage: function (message) {
                show(typeof message === 'string' ? message : JSON.stringify(message));
            }
        };

        banner('Rust+ token catcher: aktywny, zaloguj sie przez Steam', true);
    }

    /* 1) Works at once when the userscript already runs in the page's own context. */
    pageSide();

    /* 2) Also inject into the page's context, for userscript managers that use an isolated world.
          <html> may not exist yet at document-start, so retry until it does. */
    (function inject() {
        const parent = document.head || document.documentElement;
        if (!parent) {
            setTimeout(inject, 5);
            return;
        }
        const script = document.createElement('script');
        script.textContent = '(' + pageSide.toString() + ')();';
        parent.appendChild(script);
        script.remove();
    })();
})();
