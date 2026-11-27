'use strict';
'require view';
'require form';
'require ui';
'require uci';
'require daeuniverse.common as daeu';

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('daeuniverse'),
			daeu.callGetCores().catch(function() { return {}; })
		]);
	},

	render: function(loadResults) {
		var coresInfo = loadResults[1] || {};
		var installed = coresInfo.installed_cores || { honk: true, dae: true };
		var versions = coresInfo.versions || {};

		var sections = uci.sections('daeuniverse', 'daeuniverse');
		var sid = (sections && sections[0]) ? sections[0]['.name'] : '@daeuniverse[0]';
		var initialCore = uci.get('daeuniverse', sid, 'core') || 'honk';
		if (initialCore !== 'dae' && initialCore !== 'honk') initialCore = 'honk';

		var globalFilePath = (initialCore === 'dae')
			? '/etc/daeuniverse/dae/config.d/global.dae'
			: '/etc/daeuniverse/honk/config.dae';

		var m, s, o;

		m = new form.Map('daeuniverse', _('Global Settings'), _('Configure global settings for DAE Universe.'));

		s = m.section(form.NamedSection, '_status');
		s.render = function() {
			return daeu.renderStatusHeader();
		};

		s = m.section(form.TypedSection, 'daeuniverse');
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enabled'));
		o.rmempty = false;

		var coreDescParts = [];
		if (versions.honk) coreDescParts.push('honk: ' + versions.honk);
		if (versions.dae) coreDescParts.push('dae: ' + versions.dae);
		var coreDesc = _('Select the proxy engine core. Each core uses its own native configuration directory under /etc/daeuniverse/.') +
			(coreDescParts.length ? (' (' + coreDescParts.join(' | ') + ')') : '');

		o = s.option(form.ListValue, 'core', _('Core Engine'), coreDesc);
		o.value('honk', installed.honk !== false ? _('honk (Default)') : _('honk (Not installed)'));
		o.value('dae', installed.dae !== false ? _('dae') : _('dae (Not installed)'));
		o.default = 'honk';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (value === 'honk' && installed.honk === false)
				return _('honk-core is not installed on this system.');
			if (value === 'dae' && installed.dae === false)
				return _('dae is not installed on this system.');
			return true;
		};

		o = s.option(form.Flag, 'advanced', _('Advanced Settings'), _('Enable to display full configuration editor and advanced routing/DNS/node tabs.'));
		o.rmempty = false;
		o.default = '0';

		o = s.option(form.ListValue, 'dashboard', _('Dashboard Type'), _('Select the active web dashboard.'));
		o.value('none', _('None'));
		o.value('doona', _('Doona'));
		o.value('doona_lite', _('Doona Lite'));
		o.value('zashboard', _('Zashboard'));
		o.default = 'doona';

		if (initialCore === 'dae') {
			o = s.option(form.DummyValue, '_entry_hint', _('Entry File'));
			o.depends('advanced', '1');
			o.rawhtml = true;
			o.cfgvalue = function() {
				return '<code>/etc/daeuniverse/dae/config.dae</code> &mdash; ' +
					_('automatically includes config.d/*.dae and api.dae.');
			};
		}

		o = s.option(form.TextValue, '_config', _('Global Configuration'),
			(initialCore === 'dae')
				? _('Editing /etc/daeuniverse/dae/config.d/global.dae (dae core).')
				: _('Editing /etc/daeuniverse/honk/config.dae (honk core). Configure include for split configs or full global block.')
		);
		o.depends('advanced', '1');
		o.rows = 25;
		o.wrap = 'off';
		o.load = function() {
			return daeu.readFile(globalFilePath);
		};
		o.write = function(section_id, formvalue) {
			if (!this.isActive(section_id) || formvalue == null) return;
			return daeu.writeFile(globalFilePath, formvalue);
		};

		this._editorDirty = false;
		var self = this;
		daeu.bindCodeMirrorToMap(m, function() {
			self._editorDirty = true;
		});
		return m.render();
	},

	handleSaveApply: function(ev, mode) {
		var sections = uci.sections('daeuniverse', 'daeuniverse');
		var sid = (sections && sections[0]) ? sections[0]['.name'] : '@daeuniverse[0]';
		var oldDash = uci.get('daeuniverse', sid, 'dashboard') || 'doona';
		var oldCore = uci.get('daeuniverse', sid, 'core') || 'honk';
		var editorDirty = !!this._editorDirty;
		var self = this;

		return this.handleSave(ev).then(function() {
			var newDash = uci.get('daeuniverse', sid, 'dashboard') || 'doona';
			var newCore = uci.get('daeuniverse', sid, 'core') || 'honk';
			var newEnabled = uci.get('daeuniverse', sid, 'enabled') || '0';

			daeu.applyTabVisibility();

			var coreStep = (newCore !== oldCore) ? daeu.callPrepareCoreSwitch(newCore).then(function(res) {
				if (!res || res.success === false) {
					uci.set('daeuniverse', sid, 'core', oldCore);
					return uci.save().then(function() {
						throw new Error(daeu.msgText(res, _('Failed to prepare target core')));
					});
				}
				if (res.warning) {
					daeu.showNotification(null, E('p', daeu.msgText(res.warning)), 'warning', 6000);
				}
			}) : Promise.resolve();

			return coreStep.then(function() {
				var dashStep = (newDash !== oldDash) ? daeu.switchDashboardAndWait(newDash).then(function(res) {
					if (res && res.pending)
						daeu.showNotification(null, E('p', _('Saved, but the panel files are not installed yet — download the panel first.')), 'warning');
					else if (res && res.running === false)
						throw new Error(_('Service did not come back up; check the logs'));
				}) : Promise.resolve();

				return dashStep.then(function() {
					self._editorDirty = false;

					var applyChecks = (editorDirty && newEnabled === '1')
						? daeu.callValidateConfig(newCore).then(function(vres) {
							if (vres && vres.valid === false)
								throw new Error(daeu.msgText(vres, _('Configuration validation failed')));
							return daeu.callReload();
						}).then(function(r) {
							if (!r || r.success === false)
								throw new Error(daeu.msgText(r, _('Service did not accept the request')));
						})
						: Promise.resolve();

					return applyChecks.then(function() {
						/*
						 * uci.changes() is an RPC in this LuCI release, so it
						 * returns a Promise: probing it with Object.keys() always
						 * looked empty and skipped the commit, which left every
						 * save staged but never applied while the page still
						 * reported success. Commit unconditionally instead, the
						 * way the stock handleSaveApply does.
						 */
						if (ui.changes && typeof ui.changes.apply === 'function')
							return ui.changes.apply(mode == '0');

						return null;
					});
				});
			});
		}).catch(function(err) {
			daeu.showNotification(null, E('p', _('Failed to apply configuration:') + ' ' + (err.message || err)), 'error', 6000);
		});
	}
});
