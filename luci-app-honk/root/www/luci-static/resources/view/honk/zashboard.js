'use strict';
'require view';
'require ui';
'require honk.common as honk';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	render: function() {
		var currentInfo = null;
		var pollTimer = null;
		var iframeLoaded = false;

		function getTargetHost(configHost) {
			if (!configHost || configHost === '0.0.0.0' || configHost === '::' || configHost === '[::]') {
				return window.location.hostname;
			}
			return configHost;
		}

		function buildZashboardUrl(info) {
			var targetHost = getTargetHost(info.host);
			var port = info.port || '9090';
			var secret = info.secret || '';
			var protocol = 'http';

			var query = 'hostname=' + encodeURIComponent(targetHost) +
				'&port=' + encodeURIComponent(port) +
				'&protocol=' + encodeURIComponent(protocol);
			if (secret) {
				query += '&secret=' + encodeURIComponent(secret);
			}
			return protocol + '://' + targetHost + ':' + port + '/ui/?' + query + '#/setup?' + query;
		}

		// Create HTML elements
		var style = E('style', {}, [
			'#zash_iframe {',
			'	width: 100%;',
			'	height: calc(100vh - 210px);',
			'	min-height: 650px;',
			'	border: 1px solid var(--hairline, var(--border-color-medium, #ccc));',
			'	border-radius: 4px;',
			'	display: block;',
			'}',
			'#zash_iframe.fullscreen {',
			'	position: fixed !important; top: 0 !important; left: 0 !important;',
			'	width: 100vw !important; height: 100vh !important; z-index: 999999 !important;',
			'	border: none !important; border-radius: 0 !important;',
			'}',
			'#update_modal {',
			'	position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;',
			'	background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);',
			'	display: flex; align-items: center; justify-content: center; z-index: 9999;',
			'}',
			'.zash-modal-box {',
			'	background: var(--surface-overlay, var(--surface, var(--background-color-high, #ffffff))) !important;',
			'	color: var(--text, var(--text-color-highest, inherit)) !important;',
			'	border: 1px solid var(--hairline, var(--border-color-low, #ccc)) !important;',
			'	border-radius: var(--radius-base, 8px) !important;',
			'	padding: 22px 24px !important;',
			'	box-shadow: var(--app-shadow-lg, 0 16px 36px rgba(0, 0, 0, 0.35)) !important;',
			'	width: 500px; max-width: 92vw; margin: 0 !important; box-sizing: border-box;',
			'}',
			'.zash-modal-close {',
			'	background: transparent; border: none; cursor: pointer; width: 28px; height: 28px;',
			'	border-radius: var(--radius-base, 4px); display: inline-flex; align-items: center; justify-content: center;',
			'	color: var(--text-muted, var(--text-color-medium, #888)); padding: 0;',
			'	transition: background-color 0.15s, color 0.15s;',
			'}',
			'.zash-modal-close:hover {',
			'	background: var(--hover-faint, rgba(128, 128, 128, 0.15));',
			'	color: var(--text, var(--text-color-highest, #333));',
			'}',
			'.zash-log-box {',
			'	max-height: 150px; overflow-y: auto; font-family: var(--font-mono, monospace);',
			'	font-size: 12px; line-height: 1.4; padding: 8px; margin: 8px 0;',
			'	background: var(--surface-sunken, var(--background-color-low, transparent));',
			'	border: 1px solid var(--hairline, var(--border-color-medium, #ccc));',
			'	border-radius: var(--radius-base, 3px); white-space: pre-wrap; word-break: break-all;',
			'}'
		].join('\n'));

		// State 0: Loading
		var stateLoading = E('div', { 'class': 'cbi-section', 'style': 'text-align: center; padding: 30px;' }, [
			E('p', {}, E('em', {}, _('正在检测 Zashboard 与 Clash API 配置...')))
		]);

		// State 1: Unconfigured
		var quickEnableMsg = E('span', { 'style': 'margin-left: 8px;' });
		var btnQuickEnable = E('button', {
			'type': 'button',
			'class': 'cbi-button cbi-button-apply',
			'click': function() {
				btnQuickEnable.disabled = true;
				btnQuickEnable.innerText = _('正在开启并重启 HONK...');
				honk.callHonkEnableClashApi().then(function(resp) {
					btnQuickEnable.disabled = false;
					btnQuickEnable.innerText = _('一键启用默认 Clash API 配置');
					if (resp && resp.success) {
						quickEnableMsg.innerText = _('已成功启用！正在重启服务并初始化面板...');
						setTimeout(loadInfo, 2500);
					} else {
						ui.addNotification(null, E('p', _('启用失败：') + (resp ? resp.message : '未知错误')), 'error');
					}
				}).catch(function(err) {
					btnQuickEnable.disabled = false;
					btnQuickEnable.innerText = _('一键启用默认 Clash API 配置');
					ui.addNotification(null, E('p', _('启用失败：') + err.message), 'error');
				});
			}
		}, _('一键启用默认 Clash API 配置'));

		var stateUnconfigured = E('div', { 'class': 'cbi-section', 'style': 'display: none;' }, [
			E('h3', {}, _('Zashboard / Clash API 未配置')),
			E('div', { 'class': 'cbi-section-descr' },
				_('HONK 尚未在配置文件中启用 Clash API。Zashboard 控制面板需要依赖 Clash API 提供的外部控制器端口与面板静态文件路径。')
			),
			E('div', { 'class': 'alert-message warning', 'style': 'margin: 12px 0;' },
				_('请在【全局设置】的配置文件中添加或取消注释 experimental.clash_api 语法块，并确保配置了 external_controller 和 external_ui。')
			),
			E('div', { 'style': 'margin-top: 10px;' }, [
				E('label', { 'class': 'cbi-value-title' }, E('strong', {}, _('参考配置示例（/etc/honk/config.dae）：'))),
				E('pre', { 'style': 'padding: 10px; margin-top: 6px; border: 1px solid var(--border-color-medium, #ccc); border-radius: 4px;' },
					"experimental {\n" +
					"    clash_api {\n" +
					"        external_controller: '0.0.0.0:9090'\n" +
					"        external_ui: '/etc/honk/zashboard'\n" +
					"        secret: ''\n" +
					"        default_mode: 'Rule'\n" +
					"    }\n" +
					"}"
				)
			]),
			E('div', { 'style': 'margin-top: 16px; display: flex; gap: 10px; align-items: center;' }, [
				E('a', { 'href': L.url('admin/services/honk/global'), 'class': 'cbi-button' }, _('前往【全局设置】手动配置')),
				btnQuickEnable,
				quickEnableMsg
			])
		]);

		// State 2: Missing UI
		var metaUiDir = E('td', {}, '/etc/honk/zashboard');
		var metaController = E('td', {}, '0.0.0.0:9090');
		var metaSecret = E('td', {}, _('（未设置）'));

		var radioGithub = E('input', { 'type': 'radio', 'class': 'cbi-input-radio', 'name': 'zash_dl_src', 'value': 'https://github.com/Zephyruso/zashboard/releases/latest/download/dist-no-fonts.zip', 'checked': 'checked' });
		var radioMirror1 = E('input', { 'type': 'radio', 'class': 'cbi-input-radio', 'name': 'zash_dl_src', 'value': 'https://ghfast.top/https://github.com/Zephyruso/zashboard/releases/latest/download/dist-no-fonts.zip' });
		var radioMirror2 = E('input', { 'type': 'radio', 'class': 'cbi-input-radio', 'name': 'zash_dl_src', 'value': 'https://ghproxy.net/https://github.com/Zephyruso/zashboard/releases/latest/download/dist-no-fonts.zip' });
		var radioCustom = E('input', { 'type': 'radio', 'class': 'cbi-input-radio', 'name': 'zash_dl_src', 'value': 'custom' });
		var inputCustomUrl = E('input', { 'type': 'text', 'class': 'cbi-input-text', 'style': 'width: 100%;', 'placeholder': 'https://.../dist-no-fonts.zip' });
		var customUrlWrap = E('div', { 'style': 'display: none; margin-top: 8px;' }, [ inputCustomUrl ]);

		var dlLogBox = E('div', { 'class': 'zash-log-box' });
		var dlProgressWrap = E('div', { 'style': 'display: none; margin: 12px 0;' }, [
			E('div', { 'style': 'font-weight: bold; margin-bottom: 4px;' }, _('准备下载...')),
			dlLogBox
		]);

		function updateCustomVisibility() {
			customUrlWrap.style.display = radioCustom.checked ? 'block' : 'none';
		}
		radioGithub.addEventListener('change', updateCustomVisibility);
		radioMirror1.addEventListener('change', updateCustomVisibility);
		radioMirror2.addEventListener('change', updateCustomVisibility);
		radioCustom.addEventListener('change', updateCustomVisibility);

		var btnStartDownload = E('button', {
			'type': 'button',
			'class': 'cbi-button cbi-button-apply',
			'click': function() {
				var url = '';
				if (radioCustom.checked) {
					url = (inputCustomUrl.value || '').trim();
					if (!url) {
						ui.addNotification(null, E('p', _('请输入有效的下载 URL')), 'error');
						return;
					}
				} else if (radioMirror1.checked) {
					url = radioMirror1.value;
				} else if (radioMirror2.checked) {
					url = radioMirror2.value;
				} else {
					url = radioGithub.value;
				}

				btnStartDownload.disabled = true;
				btnStartDownload.innerText = _('正在处理...');
				triggerDownload(url, dlLogBox, dlProgressWrap, function() {
					btnStartDownload.disabled = false;
					btnStartDownload.innerText = _('开始下载并安装 Zashboard');
				});
			}
		}, _('开始下载并安装 Zashboard'));

		var stateMissingUi = E('div', { 'class': 'cbi-section', 'style': 'display: none;' }, [
			E('h3', {}, _('未检测到 Zashboard 面板文件')),
			E('div', { 'class': 'cbi-section-descr' },
				_('Clash API 配置已就绪，但设定的外部控制面板目录中缺少面板文件。您可以点击下方按钮，使用 OpenWrt 原生轻量解压直接在线下载部署。')
			),
			E('table', { 'class': 'table', 'style': 'margin: 14px 0;' }, [
				E('tr', {}, [ E('th', { 'style': 'width: 25%;' }, _('目标安装目录 (external_ui)')), metaUiDir ]),
				E('tr', {}, [ E('th', {}, _('监听地址与端口')), metaController ]),
				E('tr', {}, [ E('th', {}, _('API 认证密钥')), metaSecret ])
			]),
			E('div', { 'style': 'margin: 16px 0;' }, [
				E('label', { 'style': 'font-weight: bold; display: block; margin-bottom: 8px;' },
					_('下载版本与源（专为 OpenWrt 优化的无字体极简版，仅约 1MB）：')
				),
				E('div', { 'style': 'display: flex; flex-direction: column; gap: 8px;' }, [
					E('label', { 'style': 'display: flex; align-items: center; gap: 8px; cursor: pointer;' }, [
						radioGithub, E('span', {}, [ E('strong', {}, 'GitHub 官方 Release '), '(dist-no-fonts.zip, 极简推荐)' ])
					]),
					E('label', { 'style': 'display: flex; align-items: center; gap: 8px; cursor: pointer;' }, [
						radioMirror1, E('span', {}, [ E('strong', {}, '国内高速镜像 1 '), '(ghfast.top 加速)' ])
					]),
					E('label', { 'style': 'display: flex; align-items: center; gap: 8px; cursor: pointer;' }, [
						radioMirror2, E('span', {}, [ E('strong', {}, '国内高速镜像 2 '), '(ghproxy.net 加速)' ])
					]),
					E('label', { 'style': 'display: flex; align-items: center; gap: 8px; cursor: pointer;' }, [
						radioCustom, E('span', {}, E('strong', {}, _('自定义 URL')))
					])
				]),
				customUrlWrap
			]),
			dlProgressWrap,
			E('div', { 'style': 'margin-top: 16px;' }, [ btnStartDownload ])
		]);

		// State 3: Ready
		var httpsAlert = E('div', { 'class': 'alert-message warning', 'style': 'display: none; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;' }, [
			E('div', {}, [
				E('strong', {}, _('检测到当前通过 HTTPS 访问 LuCI：')),
				E('span', {}, _('现代浏览器可能会阻止直接加载 HTTP 协议的 Clash API 面板。如无法正常显示，请点击右侧按钮在新标签页打开。'))
			]),
			E('a', { 'href': '#', 'target': '_blank', 'class': 'cbi-button cbi-button-action', 'style': 'white-space: nowrap; margin-left: 10px;' }, '↗ ' + _('在新标签页打开'))
		]);

		var honkPortLabel = E('span', { 'class': 'honk_port_label' }, '9090');
		var honkStopAlert = E('div', { 'class': 'alert-message warning', 'style': 'display: none; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;' }, [
			E('div', {}, [
				E('strong', {}, _('HONK 服务当前未运行：')),
				E('span', {}, [ _('Clash API 端口（'), honkPortLabel, _('）尚未监听。启动服务后即可正常显示数据。') ])
			]),
			E('a', { 'href': L.url('admin/services/honk/global'), 'class': 'cbi-button cbi-button-action', 'style': 'white-space: nowrap; margin-left: 10px;' }, _('前往启动 HONK'))
		]);

		var statusServicePill = E('span', { 'class': 'label success' }, _('运行中'));
		var statusEndpointPill = E('span', { 'class': 'label notice', 'style': 'font-family: monospace;' });
		var btnExternalOpen = E('a', { 'href': '#', 'target': '_blank', 'class': 'cbi-button cbi-button-action', 'title': _('在新标签页中独立打开') }, '↗ ' + _('新标签页'));
		var iframe = E('iframe', { 'id': 'zash_iframe', 'src': 'about:blank', 'allow': 'fullscreen; clipboard-read; clipboard-write' });

		// Update Modal
		var updateTargetLabel = E('code', {
			'style': 'background: var(--surface-sunken, var(--background-color-low, rgba(128, 128, 128, 0.12))); padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono, monospace); font-weight: bold;'
		}, '/etc/honk/zashboard');

		var modalRadioGithub = E('input', { 'type': 'radio', 'class': 'cbi-input-radio', 'name': 'modal_dl_src', 'value': 'https://github.com/Zephyruso/zashboard/releases/latest/download/dist-no-fonts.zip', 'checked': 'checked' });
		var modalRadioMirror = E('input', { 'type': 'radio', 'class': 'cbi-input-radio', 'name': 'modal_dl_src', 'value': 'https://ghfast.top/https://github.com/Zephyruso/zashboard/releases/latest/download/dist-no-fonts.zip' });
		var modalLogBox = E('div', { 'class': 'zash-log-box' });
		var modalProgressWrap = E('div', { 'style': 'display: none; margin-top: 12px;' }, [ modalLogBox ]);

		var btnConfirmUpdate = E('button', { 'type': 'button', 'class': 'cbi-button cbi-button-action' }, _('开始更新'));
		var btnCancelUpdate = E('button', { 'type': 'button', 'class': 'cbi-button' }, _('取消'));
		var btnCloseModal = E('button', {
			'type': 'button',
			'class': 'zash-modal-close',
			'title': _('关闭')
		}, [
			document.createElementNS('http://www.w3.org/2000/svg', 'svg')
		]);

		// Create close SVG
		var closeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		closeSvg.setAttribute('width', '14');
		closeSvg.setAttribute('height', '14');
		closeSvg.setAttribute('viewBox', '0 0 24 24');
		closeSvg.setAttribute('fill', 'none');
		closeSvg.setAttribute('stroke', 'currentColor');
		closeSvg.setAttribute('stroke-width', '2');
		closeSvg.setAttribute('stroke-linecap', 'round');
		closeSvg.setAttribute('stroke-linejoin', 'round');
		var l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		l1.setAttribute('x1', '18'); l1.setAttribute('y1', '6'); l1.setAttribute('x2', '6'); l1.setAttribute('y2', '18');
		var l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		l2.setAttribute('x1', '6'); l2.setAttribute('y1', '6'); l2.setAttribute('x2', '18'); l2.setAttribute('y2', '18');
		closeSvg.appendChild(l1);
		closeSvg.appendChild(l2);
		btnCloseModal.innerHTML = '';
		btnCloseModal.appendChild(closeSvg);

		var updateModal = E('div', { 'id': 'update_modal', 'style': 'display: none;' }, [
			E('div', { 'class': 'zash-modal-box' }, [
				E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;' }, [
					E('h4', { 'style': 'margin: 0; font-size: 16px; font-weight: 600;' }, _('更新 Zashboard 面板')),
					btnCloseModal
				]),
				E('p', { 'class': 'cbi-section-descr', 'style': 'margin: 0 0 14px 0; color: var(--text-muted, inherit); line-height: 1.5; font-size: 13px;' }, [
					_('系统将下载最新的无字体极简版（dist-no-fonts.zip）并重新部署至目标目录：'),
					updateTargetLabel
				]),
				E('div', { 'style': 'margin: 14px 0;' }, [
					E('label', { 'style': 'font-weight: 600; display: block; margin-bottom: 8px; font-size: 13px;' }, _('选择下载源：')),
					E('div', { 'style': 'display: flex; flex-direction: column; gap: 8px;' }, [
						E('label', { 'style': 'display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;' }, [
							modalRadioGithub, E('span', {}, [ E('strong', {}, 'GitHub 官方 Release '), '(dist-no-fonts.zip)' ])
						]),
						E('label', { 'style': 'display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;' }, [
							modalRadioMirror, E('span', {}, [ E('strong', {}, '国内高速镜像 '), '(ghfast.top 加速)' ])
						])
					])
				]),
				modalProgressWrap,
				E('div', { 'style': 'margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;' }, [
					btnCancelUpdate,
					btnConfirmUpdate
				])
			])
		]);

		function closeModal() {
			updateModal.style.display = 'none';
		}
		btnCloseModal.onclick = closeModal;
		btnCancelUpdate.onclick = closeModal;

		btnConfirmUpdate.onclick = function() {
			var url = modalRadioMirror.checked ? modalRadioMirror.value : modalRadioGithub.value;
			btnConfirmUpdate.disabled = true;
			triggerDownload(url, modalLogBox, modalProgressWrap, function() {
				closeModal();
				btnConfirmUpdate.disabled = false;
			});
		};

		var btnUpdateDashboard = E('button', {
			'type': 'button',
			'class': 'cbi-button',
			'title': _('更新至最新版 Zashboard'),
			'click': function() {
				modalProgressWrap.style.display = 'none';
				modalLogBox.innerText = '';
				btnConfirmUpdate.disabled = false;
				updateModal.style.display = 'flex';
			}
		}, _('更新面板'));

		var btnRefreshIframe = E('button', {
			'type': 'button',
			'class': 'cbi-button',
			'title': _('刷新面板内容'),
			'click': function() {
				if (currentInfo) {
					iframe.src = buildZashboardUrl(currentInfo);
				}
			}
		}, _('刷新'));

		var btnToggleFullscreen = E('button', {
			'type': 'button',
			'class': 'cbi-button',
			'title': _('切换全屏显示'),
			'click': function() {
				if (!document.fullscreenElement) {
					if (iframe.requestFullscreen) {
						iframe.requestFullscreen();
					} else if (iframe.webkitRequestFullscreen) {
						iframe.webkitRequestFullscreen();
					}
				} else {
					if (document.exitFullscreen) {
						document.exitFullscreen();
					}
				}
			}
		}, _('全屏'));

		var stateReady = E('div', { 'style': 'display: none;' }, [
			httpsAlert,
			honkStopAlert,
			E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;' }, [
				E('div', { 'style': 'display: flex; align-items: center; gap: 8px;' }, [
					E('strong', { 'style': 'font-size: 15px;' }, 'Zashboard'),
					statusServicePill,
					statusEndpointPill
				]),
				E('div', { 'style': 'display: flex; align-items: center; gap: 6px;' }, [
					btnUpdateDashboard,
					btnRefreshIframe,
					btnToggleFullscreen,
					btnExternalOpen
				])
			]),
			iframe
		]);

		function showState(name) {
			stateLoading.style.display = (name === 'loading') ? 'block' : 'none';
			stateUnconfigured.style.display = (name === 'unconfigured') ? 'block' : 'none';
			stateMissingUi.style.display = (name === 'missing_ui') ? 'block' : 'none';
			stateReady.style.display = (name === 'ready') ? 'block' : 'none';
		}

		function triggerDownload(url, logBox, progressWrap, onFinish) {
			progressWrap.style.display = 'block';
			logBox.innerText = _('正在初始化下载任务...\n');

			honk.callHonkDownloadZashboard(url).then(function(resp) {
				if (!resp || !resp.success) {
					logBox.innerText += _('触发下载失败：') + (resp ? resp.message : '未知错误') + '\n';
					if (onFinish) onFinish();
					return;
				}

				if (pollTimer) clearInterval(pollTimer);
				pollTimer = setInterval(function() {
					honk.callHonkDownloadStatus().then(function(sResp) {
						if (!sResp) return;
						if (sResp.log) {
							logBox.innerText = sResp.log;
							logBox.scrollTop = logBox.scrollHeight;
						}
						if (sResp.status === 'SUCCESS') {
							clearInterval(pollTimer);
							pollTimer = null;
							logBox.innerText += '\n✨ ' + _('安装完成！正在加载面板...');
							if (onFinish) onFinish();
							setTimeout(loadInfo, 1200);
						} else if (sResp.status === 'FAILED') {
							clearInterval(pollTimer);
							pollTimer = null;
							logBox.innerText += '\n❌ ' + _('安装失败，请检查日志。');
							if (onFinish) onFinish();
						}
					});
				}, 1000);
			}).catch(function(err) {
				logBox.innerText += _('触发下载异常：') + err.message + '\n';
				if (onFinish) onFinish();
			});
		}

		function loadInfo() {
			honk.callHonkZashboardInfo().then(function(data) {
				if (!data || !data.configured) {
					showState('unconfigured');
					return;
				}
				currentInfo = data;

				if (!data.has_ui) {
					metaUiDir.innerText = data.external_ui || '/etc/honk/zashboard';
					metaController.innerText = data.external_controller || '0.0.0.0:9090';
					metaSecret.innerText = data.secret ? _('已设置 (隐藏)') : _('未设置（留空）');
					showState('missing_ui');
					return;
				}

				// Ready state
				showState('ready');
				var targetHost = getTargetHost(data.host);
				var port = data.port || '9090';
				var fullUrl = buildZashboardUrl(data);

				if (data.running) {
					statusServicePill.className = 'label success';
					statusServicePill.innerText = _('运行中');
					honkStopAlert.style.display = 'none';
				} else {
					statusServicePill.className = 'label warning';
					statusServicePill.innerText = _('未运行');
					honkStopAlert.style.display = 'flex';
					honkPortLabel.innerText = port;
				}

				statusEndpointPill.innerText = targetHost + ':' + port;
				btnExternalOpen.href = fullUrl;

				var httpsBtn = httpsAlert.querySelector('a');
				if (httpsBtn) httpsBtn.href = fullUrl;

				if (window.location.protocol === 'https:') {
					httpsAlert.style.display = 'flex';
				} else {
					httpsAlert.style.display = 'none';
				}

				if (!iframeLoaded || iframe.src !== fullUrl) {
					iframe.src = fullUrl;
					iframeLoaded = true;
				}

				updateTargetLabel.innerText = data.external_ui || '/etc/honk/zashboard';
			}).catch(function() {
				showState('unconfigured');
			});
		}

		loadInfo();

		return E('div', { 'class': 'zash-wrap' }, [
			style,
			stateLoading,
			stateUnconfigured,
			stateMissingUi,
			stateReady,
			updateModal
		]);
	}
});
