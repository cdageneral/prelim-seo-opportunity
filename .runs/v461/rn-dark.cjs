// 2026-09-09 v7.487: was an absolute /tmp/work/repo path that stopped existing;
// resolve through NODE_PATH (run.sh exports it) so the check actually runs.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const dom = new JSDOM('<!doctype html><html data-theme="dark"><body><div id="root"></div></body></html>', { pretendToBeVisual: true, url: 'https://x.test/' });
global.window = dom.window; global.document = dom.window.document;
global.navigator = dom.window.navigator; global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element; global.Node = dom.window.Node;
global.MouseEvent = dom.window.MouseEvent; global.KeyboardEvent = dom.window.KeyboardEvent;
global.requestAnimationFrame = cb => setTimeout(cb, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;
require(require("path").resolve(process.argv[2]));
