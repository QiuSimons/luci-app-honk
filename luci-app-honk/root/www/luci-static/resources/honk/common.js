'use strict';
'require baseclass';
'require rpc';
'require fs';
'require ui';
'require poll';

var callHonkStatus = rpc.declare({
	object: 'luci.honk',
	method: 'status',
	expect: { }
});

var callHonkReload = rpc.declare({
	object: 'luci.honk',
	method: 'reload',
	expect: { success: true }
});

var callHonkGetLog = rpc.declare({
	object: 'luci.honk',
	method: 'get_log',
	expect: { }
});

var callHonkClearLog = rpc.declare({
	object: 'luci.honk',
	method: 'clear_log',
	expect: { success: true }
});

var callHonkZashboardInfo = rpc.declare({
	object: 'luci.honk',
	method: 'get_zashboard_info',
	expect: { }
});

var callHonkDownloadZashboard = rpc.declare({
	object: 'luci.honk',
	method: 'download_zashboard',
	params: [ 'url' ],
	expect: { }
});

var callHonkDownloadStatus = rpc.declare({
	object: 'luci.honk',
	method: 'download_status',
	expect: { }
});

var callHonkEnableClashApi = rpc.declare({
	object: 'luci.honk',
	method: 'enable_clash_api',
	expect: { }
});

function readFile(path) {
	if (fs.read_direct) {
		return fs.read_direct(path).catch(function() {
			return L.resolveDefault(fs.read(path), '');
		});
	}
	return L.resolveDefault(fs.read(path), '');
}

function writeFile(path, content) {
	var clean = (content || '').replace(/\r\n/g, '\n');
	return fs.write(path, clean);
}

function loadStyle(href) {
	if (!document.querySelector('link[href="' + href + '"]')) {
		var link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		document.head.appendChild(link);
	}
}

function loadScript(src) {
	return new Promise(function(resolve, reject) {
		var existing = document.querySelector('script[src="' + src + '"]');
		if (existing) {
			resolve();
			return;
		}
		var s = document.createElement('script');
		s.src = src;
		s.async = false;
		s.onload = function() { resolve(); };
		s.onerror = function() { reject(new Error('Failed to load ' + src)); };
		document.head.appendChild(s);
	});
}

function ensureEditorStyles() {
	if (document.getElementById('honk-editor-custom-style')) return;

	var style = document.createElement('style');
	style.id = 'honk-editor-custom-style';
	style.textContent = [
		'.honk-status-field { display: inline-flex !important; align-items: center !important; justify-content: flex-start !important; gap: 16px !important; flex-wrap: wrap !important; min-height: 32px !important; }',
		'.honk-editor-toolbar { margin-bottom: 6px !important; margin-top: 0 !important; display: flex !important; align-items: center !important; justify-content: flex-start !important; }',
		'.cm-format-btn { margin: 0 !important; cursor: pointer !important; }',
		'.cbi-value:has(.CodeMirror) { align-items: flex-start !important; }',
		'.cbi-value:has(.CodeMirror) > .cbi-value-title { padding-top: 5px !important; }',
		'.cbi-value:has(.CodeMirror) .cbi-value-field { flex: 1 1 0% !important; min-width: 0 !important; width: auto !important; }',
		'.CodeMirror {',
		'	border: 1px solid var(--hairline, var(--border-color-medium, #ccc)) !important;',
		'	border-radius: var(--radius-base, 4px);',
		'	height: auto;',
		'	min-height: 480px;',
		'	font-family: var(--font-mono, monospace);',
		'	font-size: 13px;',
		'	background: var(--control-bg, var(--surface, #ffffff)) !important;',
		'	color: var(--text, inherit) !important;',
		'	box-shadow: none;',
		'}',
		'.CodeMirror-gutters {',
		'	border-right: 1px solid var(--hairline, var(--border-color-medium, #ccc)) !important;',
		'	background: var(--surface-sunken, var(--background-color-low, #f7f7f7)) !important;',
		'}',
		'.CodeMirror-linenumber { color: var(--text-muted, var(--text-color-low, #888888)) !important; }',
		'[data-darkmode="true"] .CodeMirror, [data-theme="dark"] .CodeMirror, .dark .CodeMirror {',
		'	background: var(--control-bg, #141822) !important;',
		'	color: var(--text, #f9fafb) !important;',
		'	border-color: var(--hairline, #334155) !important;',
		'}',
		'[data-darkmode="true"] .CodeMirror-gutters, [data-theme="dark"] .CodeMirror-gutters, .dark .CodeMirror-gutters {',
		'	background: var(--surface-sunken, #0a0e17) !important;',
		'	border-right-color: var(--hairline, #334155) !important;',
		'}'
	].join('\n');
	document.head.appendChild(style);
}

function ensureCodeMirror() {
	loadStyle(L.resource('honk/lib/codemirror.css'));
	loadStyle(L.resource('honk/addon/fold/foldgutter.css'));
	ensureEditorStyles();

	if (window.CodeMirror && window.CodeMirror.modes && window.CodeMirror.modes.dae) {
		return Promise.resolve(window.CodeMirror);
	}

	return loadScript(L.resource('honk/lib/codemirror.js'))
		.then(function() {
			return Promise.all([
				loadScript(L.resource('honk/addon/edit/matchbrackets.js')),
				loadScript(L.resource('honk/addon/fold/foldcode.js')),
				loadScript(L.resource('honk/addon/fold/foldgutter.js')),
				loadScript(L.resource('honk/addon/fold/indent-fold.js')),
				loadScript(L.resource('honk/mode/dae/dae.js'))
			]);
		})
		.then(function() {
			return window.CodeMirror;
		});
}

function formatEditor(ed) {
	ed.operation(function() {
		var cursor = ed.getCursor();
		var content = ed.getValue();

		var formatCodePart = function(part) {
			part = part.replace(/\s*->\s*/g, ' -> ');
			part = part.replace(/\s*&&\s*/g, ' && ');
			part = part.replace(/([^\s])\s*\{/g, '$1 {');
			part = part.replace(/,([^\s])/g, ', $1');

			var exprPrefixes = ['geosite', 'geoip', 'keyword', 'full', 'suffix', 'regex', 'domain'];
			var regex = new RegExp('\\b(' + exprPrefixes.join('|') + '):([^\\s\'"])', 'g');
			part = part.replace(regex, '$1: $2');
			return part;
		};

		var lines = content.split('\n');
		var formattedLines = lines.map(function(line) {
			var trimmed = line.trim();
			if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
				return line.trimEnd();
			}

			line = line.replace(/^(\s*[a-zA-Z0-9_-]+):([^\s])/, '$1: $2');

			var quoteParts = line.split(/(['"])/);
			var inQuote = false;
			var currentQuote = '';
			for (var j = 0; j < quoteParts.length; j++) {
				var part = quoteParts[j];
				if (part === "'" || part === '"') {
					if (!inQuote) {
						inQuote = true;
						currentQuote = part;
					} else if (part === currentQuote) {
						inQuote = false;
						currentQuote = '';
					}
				} else if (!inQuote) {
					var hashIdx = part.indexOf('#');
					if (hashIdx !== -1) {
						var codeSub = part.slice(0, hashIdx);
						var commentSub = part.slice(hashIdx);
						codeSub = formatCodePart(codeSub);
						quoteParts[j] = codeSub + commentSub;
						break;
					} else {
						quoteParts[j] = formatCodePart(part);
					}
				}
			}
			line = quoteParts.join('');

			return line.trimEnd();
		});

		ed.setValue(formattedLines.join('\n'));

		for (var i = 0; i < ed.lineCount(); i++) {
			ed.indentLine(i, 'smart');
		}
		ed.setCursor(cursor);
	});
}

function initCodeMirror(textarea, onSaveCallback) {
	return ensureCodeMirror().then(function(CodeMirror) {
		var editor = CodeMirror.fromTextArea(textarea, {
			mode: 'dae',
			indentUnit: 4,
			tabSize: 4,
			styleActiveLine: true,
			lineNumbers: true,
			theme: 'default',
			lineWrapping: true,
			matchBrackets: true,
			autoCloseBrackets: true,
			foldGutter: true,
			gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
		});

		editor.on('inputRead', function(cm, change) {
			if (change.origin !== '+input') return;
			var val = change.text[0];
			var pairs = { '{': '}', '[': ']', '(': ')', '"': '"', "'": "'" };
			if (pairs[val]) {
				var cur = cm.getCursor();
				cm.replaceRange(pairs[val], cur);
				cm.setCursor(cur);
			}
		});

		var syncTextarea = function() {
			textarea.value = editor.getValue();
			textarea.dispatchEvent(new Event('input', { bubbles: true }));
			textarea.dispatchEvent(new Event('change', { bubbles: true }));
			if (typeof onSaveCallback === 'function') {
				onSaveCallback(textarea.value);
			}
		};

		editor.on('change', syncTextarea);

		var formatBtn = E('button', {
			'type': 'button',
			'class': 'btn cbi-button cm-format-btn',
			'click': function() {
				formatEditor(editor);
				syncTextarea();
			}
		}, _('Format Code'));

		var toolbar = E('div', { 'class': 'honk-editor-toolbar' }, [ formatBtn ]);

		var wrapper = editor.getWrapperElement();
		wrapper.parentNode.insertBefore(toolbar, wrapper);

		var form = textarea.closest('form');
		if (form && !form.dataset.cmHooked) {
			form.addEventListener('submit', function() {
				formatEditor(editor);
				editor.save();
				syncTextarea();
			});
			form.dataset.cmHooked = 'true';
		}

		return editor;
	});
}

function renderStatusHeader() {
	var statusEl = E('span', { 'id': 'honk_status', 'style': 'font-weight: 500;' }, [
		E('em', {}, _('Collecting data...'))
	]);

	var reloadBtn = E('button', {
		'type': 'button',
		'class': 'btn cbi-button cbi-button-action',
		'click': function(ev) {
			var btn = ev.target;
			btn.disabled = true;
			btn.innerText = _('Reloading...');
			callHonkReload().then(function() {
				btn.disabled = false;
				btn.innerText = _('Reload Service');
				ui.addNotification(null, E('p', _('HONK service reload triggered successfully.')), 'info');
			}).catch(function(err) {
				btn.disabled = false;
				btn.innerText = _('Reload Service');
				ui.addNotification(null, E('p', _('Failed to reload HONK: ') + (err.message || err)), 'error');
			});
		}
	}, _('Reload Service'));

	var section = E('fieldset', { 'class': 'cbi-section' }, [
		E('legend', {}, _('Status')),
		E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Running Status')),
			E('div', { 'class': 'cbi-value-field honk-status-field' }, [
				statusEl,
				reloadBtn
			])
		])
	]);

	function updateStatus(data) {
		var tb = document.getElementById('honk_status');
		if (!tb) return;
		if (data && data.running) {
			var mem = data.memory ? ' (' + _('Memory Usage') + ': ' + data.memory + ')' : '';
			tb.innerHTML = '<span style="color:var(--success, #22c55e); font-weight: bold;">' + _('HONK') + ' ' + _('RUNNING') + '</span> <span style="color:var(--text-muted, #888); font-size:0.9em;">' + mem + '</span>';
		} else {
			tb.innerHTML = '<span style="color:var(--danger, #ef4444); font-weight: bold;">' + _('HONK') + ' ' + _('NOT RUNNING') + '</span>';
		}
	}

	callHonkStatus().then(updateStatus);

	poll.add(function() {
		return callHonkStatus().then(updateStatus);
	}, 3);

	return section;
}

return baseclass.extend({
	callHonkStatus: callHonkStatus,
	callHonkReload: callHonkReload,
	callHonkGetLog: callHonkGetLog,
	callHonkClearLog: callHonkClearLog,
	callHonkZashboardInfo: callHonkZashboardInfo,
	callHonkDownloadZashboard: callHonkDownloadZashboard,
	callHonkDownloadStatus: callHonkDownloadStatus,
	callHonkEnableClashApi: callHonkEnableClashApi,
	readFile: readFile,
	writeFile: writeFile,
	ensureCodeMirror: ensureCodeMirror,
	formatEditor: formatEditor,
	initCodeMirror: initCodeMirror,
	renderStatusHeader: renderStatusHeader
});
