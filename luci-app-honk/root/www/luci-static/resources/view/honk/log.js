'use strict';
'require view';
'require ui';
'require poll';
'require honk.common as honk';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	render: function() {
		var scrolled = false;

		var logTextarea = E('textarea', {
			'id': 'log_textarea',
			'class': 'cbi-input-textarea',
			'style': 'width: calc(100% - 20px); height: 645px; margin: 10px; font-family: var(--font-mono, monospace); font-size: 12px; line-height: 1.4;',
			'rows': 25,
			'wrap': 'off',
			'readonly': 'readonly'
		});

		var btnClear = E('button', {
			'type': 'button',
			'class': 'cbi-button cbi-button-remove',
			'style': 'margin-left: 10px; margin-top: 10px;',
			'click': function() {
				btnClear.disabled = true;
				honk.callHonkClearLog().then(function() {
					btnClear.disabled = false;
					logTextarea.value = '';
					logTextarea.textContent = '';
					logTextarea.scrollTop = 0;
					scrolled = false;
					ui.addNotification(null, E('p', _('Logs cleared successfully.')), 'info');
				}).catch(function(err) {
					btnClear.disabled = false;
					ui.addNotification(null, E('p', _('Failed to clear logs: ') + err.message), 'error');
				});
			}
		}, _('Clear logs'));

		function updateLog() {
			return honk.callHonkGetLog().then(function(data) {
				var content = (data && data.log) ? data.log : '';
				logTextarea.value = content;
				if (!scrolled && content) {
					logTextarea.scrollTop = logTextarea.scrollHeight;
					scrolled = true;
				}
			});
		}

		updateLog();

		poll.add(function() {
			return updateLog();
		}, 3);

		return E('fieldset', { 'class': 'cbi-section', 'id': '_log_fieldset' }, [
			E('legend', {}, _('Logs')),
			btnClear,
			logTextarea
		]);
	}
});
