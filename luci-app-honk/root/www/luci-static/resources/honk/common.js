'use strict';
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
		'.cm-format-btn { margin-top: 8px; margin-bottom: 8px; display: inline-block; }',
		'.CodeMirror {',
		'	border: 1px solid var(--hairline, var(--border-color-medium, #ccc)) !important;',
		'	border-radius: var(--radius-base, 4px);',
		'	height: auto;',
		'	min-height: 420px;',
		'	font-family: var(--font-mono, monospace);',
		'	font-size: 13px;',
		'	background: var(--control-bg, var(--surface, var(--background-color-high, #ffffff))) !important;',
		'	color: var(--text, var(--text-color-highest, inherit)) !important;',
		'	box-shadow: none;',
		'}',
		'.CodeMirror-gutters {',
		'	border-right: 1px solid var(--hairline, var(--border-color-medium, #ccc)) !important;',
		'	background: var(--surface-sunken, var(--background-color-low, #f7f7f7)) !important;',
		'}',
		'.CodeMirror-linenumber { color: var(--text-muted, var(--text-color-low, #888888)) !important; }',
		'.CodeMirror-cursor { border-left: 1px solid var(--text, var(--text-color-highest, currentColor)) !important; }',
		'.CodeMirror-selected { background: var(--hover-faint, var(--background-color-medium, rgba(128, 128, 128, 0.2))) !important; }',
		'.CodeMirror-focused .CodeMirror-selected { background: var(--brand-subtle, var(--background-color-medium, rgba(0, 133, 183, 0.25))) !important; }',
		'.CodeMirror-activeline-background { background: var(--hover-faint, var(--background-color-low, rgba(128, 128, 128, 0.08))) !important; }',
		'.CodeMirror-matchingbracket { text-decoration: underline; font-weight: bold; color: var(--brand, var(--primary-color-high, inherit)) !important; }',

		'/* Dark mode container & gutter overrides across all themes */',
		'[data-darkmode="true"] .CodeMirror, [data-theme="dark"] .CodeMirror, .dark .CodeMirror, html[data-darkmode=true] .CodeMirror {',
		'	background: var(--control-bg, var(--surface, #141822)) !important;',
		'	color: var(--text, #f9fafb) !important;',
		'	border-color: var(--hairline, #334155) !important;',
		'}',
		'[data-darkmode="true"] .CodeMirror-gutters, [data-theme="dark"] .CodeMirror-gutters, .dark .CodeMirror-gutters, html[data-darkmode=true] .CodeMirror-gutters {',
		'	background: var(--surface-sunken, #0a0e17) !important;',
		'	border-right-color: var(--hairline, #334155) !important;',
		'}',
		'[data-darkmode="true"] .CodeMirror-linenumber, [data-theme="dark"] .CodeMirror-linenumber, .dark .CodeMirror-linenumber, html[data-darkmode=true] .CodeMirror-linenumber {',
		'	color: var(--text-muted, #909297) !important;',
		'}',

		'/* DAE syntax highlighting - Light Mode */',
		'.cm-s-default .cm-keyword { color: #85007a; font-weight: bold; }',
		'.cm-s-default .cm-variable-3 { color: #b45309; }',
		'.cm-s-default .cm-variable-2 { color: #0369a1; }',
		'.cm-s-default .cm-def { color: #0284c7; }',
		'.cm-s-default .cm-operator.marker { color: #d946ef; font-weight: bold; }',
		'.cm-s-default .cm-operator { color: #0284c7; }',
		'.cm-s-default .cm-number { color: #0d9488; }',
		'.cm-s-default .cm-string { color: #15803d; }',
		'.cm-s-default .cm-comment { color: var(--text-muted, var(--text-color-low, #6b7280)); font-style: italic; }',

		'/* DAE syntax highlighting - Dark Mode */',
		'[data-darkmode="true"] .cm-s-default .cm-keyword, [data-theme="dark"] .cm-s-default .cm-keyword, .dark .cm-s-default .cm-keyword, html[data-darkmode=true] .cm-s-default .cm-keyword { color: #c678dd !important; font-weight: bold; }',
		'[data-darkmode="true"] .cm-s-default .cm-variable-3, [data-theme="dark"] .cm-s-default .cm-variable-3, .dark .cm-s-default .cm-variable-3, html[data-darkmode=true] .cm-s-default .cm-variable-3 { color: #e5c07b !important; }',
		'[data-darkmode="true"] .cm-s-default .cm-variable-2, [data-theme="dark"] .cm-s-default .cm-variable-2, .dark .cm-s-default .cm-variable-2, html[data-darkmode=true] .cm-s-default .cm-variable-2 { color: #61afef !important; }',
		'[data-darkmode="true"] .cm-s-default .cm-def, [data-theme="dark"] .cm-s-default .cm-def, .dark .cm-s-default .cm-def, html[data-darkmode=true] .cm-s-default .cm-def { color: #56b6c2 !important; }',
		'[data-darkmode="true"] .cm-s-default .cm-operator.marker, [data-theme="dark"] .cm-s-default .cm-operator.marker, .dark .cm-s-default .cm-operator.marker, html[data-darkmode=true] .cm-s-default .cm-operator.marker { color: #e06c75 !important; font-weight: bold; }',
		'[data-darkmode="true"] .cm-s-default .cm-operator, [data-theme="dark"] .cm-s-default .cm-operator, .dark .cm-s-default .cm-operator, html[data-darkmode=true] .cm-s-default .cm-operator { color: #56b6c2 !important; }',
		'[data-darkmode="true"] .cm-s-default .cm-number, [data-theme="dark"] .cm-s-default .cm-number, .dark .cm-s-default .cm-number, html[data-darkmode=true] .cm-s-default .cm-number { color: #d19a66 !important; }',
		'[data-darkmode="true"] .cm-s-default .cm-string, [data-theme="dark"] .cm-s-default .cm-string, .dark .cm-s-default .cm-string, html[data-darkmode=true] .cm-s-default .cm-string { color: #98c379 !important; }',
		'[data-darkmode="true"] .cm-s-default .cm-comment, [data-theme="dark"] .cm-s-default .cm-comment, .dark .cm-s-default .cm-comment, html[data-darkmode=true] .cm-s-default .cm-comment { color: var(--text-muted, #909297) !important; }',

		'@media (prefers-color-scheme: dark) {',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .CodeMirror {',
		'		background: var(--control-bg, var(--surface, #141822)) !important;',
		'		color: var(--text, #f9fafb) !important;',
		'		border-color: var(--hairline, #334155) !important;',
		'	}',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .CodeMirror-gutters {',
		'		background: var(--surface-sunken, #0a0e17) !important;',
		'		border-right-color: var(--hairline, #334155) !important;',
		'	}',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .cm-s-default .cm-keyword { color: #c678dd; }',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .cm-s-default .cm-variable-3 { color: #e5c07b; }',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .cm-s-default .cm-variable-2 { color: #61afef; }',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .cm-s-default .cm-def { color: #56b6c2; }',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .cm-s-default .cm-operator.marker { color: #e06c75; }',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .cm-s-default .cm-operator { color: #56b6c2; }',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .cm-s-default .cm-number { color: #d19a66; }',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .cm-s-default .cm-string { color: #98c379; }',
		'	:root:not([data-darkmode="false"]):not([data-theme="light"]) .cm-s-default .cm-comment { color: var(--text-muted, #909297); }',
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
			'class': 'cbi-button cm-format-btn',
			'click': function() {
				formatEditor(editor);
				syncTextarea();
			}
		}, _('Format Code'));

		var wrapper = editor.getWrapperElement();
		wrapper.parentNode.insertBefore(formatBtn, wrapper);

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
	var statusEl = E('p', { 'id': 'honk_status' }, [
		E('em', {}, E('b', {}, _('Collecting data...')))
	]);

	var reloadBtn = E('button', {
		'type': 'button',
		'class': 'cbi-button cbi-button-action',
		'style': 'margin-top: 8px;',
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
		statusEl,
		reloadBtn
	]);

	function updateStatus(data) {
		var tb = document.getElementById('honk_status');
		if (!tb) return;
		if (data && data.running) {
			var mem = data.memory ? ' (' + _('Memory Usage') + ': ' + data.memory + ')' : '';
			tb.innerHTML = '<em style="color:green"><b>' + _('HONK') + ' ' + _('RUNNING') + '</b></em> <span style="color:#666; font-size:0.9em;">' + mem + '</span>';
		} else {
			tb.innerHTML = '<em style="color:red"><b>' + _('HONK') + ' ' + _('NOT RUNNING') + '</b></em>';
		}
	}

	callHonkStatus().then(updateStatus);

	poll.add(function() {
		return callHonkStatus().then(updateStatus);
	}, 3);

	return section;
}

return {
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
};
